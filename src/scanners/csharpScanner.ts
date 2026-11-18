import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fg from 'fast-glob';
import type { Issue, ProjectInfo, ScanOptions } from '../types.js';
import { mapFilePathToPage } from '../core/pageMapper.js';

export async function scanCSharpProject(project: ProjectInfo, options: ScanOptions): Promise<Issue[]> {
  const issues: Issue[] = [];
  const rootDir = project.rootPath;

  // 1. Run dotnet build with warnings
  const csprojOrSln = project.configFiles.find(f => f.endsWith('.sln') || f.endsWith('.csproj'));
  if (csprojOrSln) {
    try {
      // Run dotnet build with warning level
      execSync('dotnet build -nologo -clp:NoSummary --property:WarningLevel=4', {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
    } catch (err: unknown) {
      const errorOutput = (err as { stdout?: string; stderr?: string }).stdout || '';
      const lines = errorOutput.split('\n');

      for (const line of lines) {
        // Example: D:\path\OrderController.cs(45,12): warning CS8602: Dereference of a possibly null reference. [path\MyProject.csproj]
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+([A-Z0-9]+):\s+([^\[]+)/);
        if (match) {
          const rawFile = match[1].trim();
          const lineNum = parseInt(match[2], 10);
          const colNum = parseInt(match[3], 10);
          const level = match[4].toLowerCase();
          const code = match[5];
          const message = match[6].trim();

          const relativeFile = path.isAbsolute(rawFile) ? path.relative(rootDir, rawFile) : rawFile;

          // Null reference warnings
          const isNullRef = ['CS8600', 'CS8602', 'CS8603', 'CS8604'].includes(code);
          // Async call not awaited
          const isFireAndForget = code === 'CS4014';

          let severity: Issue['severity'] = level === 'error' ? 'CRITICAL' : 'WARNING';
          let category: Issue['category'] = 'CODE_SMELL';
          let runtimeImpact = 'Cảnh báo từ trình biên dịch C# Roslyn.';

          if (isNullRef) {
            severity = 'CRITICAL';
            category = 'RUNTIME_CRASH';
            runtimeImpact = 'CRASH RUNTIME: Rất dễ văng ngoại lệ NullReferenceException làm sập request của người dùng khi dữ liệu đầu vào hoặc kết quả DB bị null.';
          } else if (isFireAndForget) {
            severity = 'CRITICAL';
            category = 'RUNTIME_CRASH';
            runtimeImpact = 'Luồng bất đồng bộ không được await (Fire-and-forget). Nếu có exception xảy ra trong task, nó sẽ bị nuốt chửng hoặc gây lỗi ngầm không thể trace.';
          } else if (level === 'error') {
            category = 'TYPE_ERROR';
            runtimeImpact = 'Lỗi biên dịch mã nguồn C#. Dự án không thể build thành công để deploy.';
          }

          issues.push({
            page: mapFilePathToPage(relativeFile),
            file: relativeFile,
            line: lineNum,
            column: colNum,
            code,
            severity,
            category,
            title: message,
            runtimeImpact,
            suggestion: isNullRef
              ? 'Kiểm tra null trước khi gọi (sử dụng toán tử "?." hoặc if (x != null))'
              : isFireAndForget
              ? 'Thêm từ khóa `await` trước lời gọi Task.'
              : 'Xem lại thông báo lỗi của compiler và sửa cú pháp.',
          });
        }
      }
    }
  }

  // 2. Scan C# source files for common runtime anti-patterns & performance issues
  const csFiles = await fg(['**/*.cs'], {
    cwd: rootDir,
    ignore: ['**/bin/**', '**/obj/**', '**/.vs/**', '**/Migrations/**'],
    deep: 8,
  });

  for (const relFile of csFiles) {
    const fullPath = path.join(rootDir, relFile);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const page = mapFilePathToPage(relFile);

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const trimmed = lineText.trim();
      const lineNum = i + 1;

      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }

      // Check: .Result or .Wait() blocking async calls (Deadlock & Thread pool starvation)
      if (lineText.match(/\.(?:Result|Wait\(\))\b/) && !relFile.includes('Test')) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'SYNC_OVER_ASYNC_BLOCK',
          severity: 'CRITICAL',
          category: 'PERFORMANCE',
          title: 'Sử dụng .Result hoặc .Wait() trên Task bất đồng bộ (Sync-over-Async)',
          runtimeImpact: 'NGUY HIỂM CAO: Gây nghẽn ThreadPool và có thể dẫn đến DEADLOCK hoàn toàn toàn bộ API khi lượng truy cập tăng nhẹ trên production.',
          suggestion: 'Chuyển phương thức sang async và dùng `await` thay vì gọi `.Result` hoặc `.Wait()`.',
        });
      }

      // Check: throw ex; instead of throw; (Clears stack trace)
      if (lineText.match(/\bthrow\s+[a-zA-Z0-9_]+\s*;/)) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'STACK_TRACE_CLEARED',
          severity: 'WARNING',
          category: 'RUNTIME_CRASH',
          title: 'Sử dụng "throw ex;" làm mất dấu vết nguồn gốc lỗi (Stack Trace)',
          runtimeImpact: 'Khi hệ thống xảy ra lỗi trên production, log sẽ chỉ hiển thị dòng throw này thay vì dòng gốc bị lỗi, khiến việc điều tra sự cố mất nhiều giờ.',
          suggestion: 'Sử dụng lệnh `throw;` đơn thuần để bảo toàn nguyên vẹn toàn bộ Call Stack.',
        });
      }

      // Check: Empty catch block (Silent failure)
      if (lineText.match(/catch\s*\([^)]*\)\s*\{\s*\}/)) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'SWALLOWED_EXCEPTION',
          severity: 'CRITICAL',
          category: 'RUNTIME_CRASH',
          title: 'Bắt ngoại lệ rỗng (Empty Catch Block nuốt lỗi)',
          runtimeImpact: 'Ngoại lệ bị nuốt chửng âm thầm, tính năng không hoạt động nhưng không hề có log nào được ghi lại, gây sai lệch dữ liệu ngầm.',
          suggestion: 'Ghi log lỗi bằng `_logger.LogError(...)` hoặc rethrow ngoại lệ.',
        });
      }

      // Check: Hardcoded Connection String or Secrets
      if (lineText.match(/(?:Password|Pwd|SecretKey|ApiKey)\s*=\s*["'][^"']+["']/i)) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'HARDCODED_CREDENTIALS',
          severity: 'CRITICAL',
          category: 'SECURITY_RISK',
          title: 'Hardcoded mật khẩu / Connection String / API Key trong code',
          runtimeImpact: 'Lộ thông tin bảo mật nghiêm trọng nếu source code bị rò rỉ. Không thể thay đổi cấu hình giữa môi trường Staging và Production.',
          suggestion: 'Lưu trữ thông tin nhạy cảm trong `appsettings.json`, Azure Key Vault hoặc Environment Variables.',
        });
      }

      // Check: Missing CancellationToken in controller endpoints executing long DB calls
      if (
        (relFile.includes('Controller') || relFile.includes('Endpoint')) &&
        lineText.match(/public\s+async\s+Task<[^>]+>\s+[A-Za-z0-9_]+\s*\(/) &&
        !lineText.includes('CancellationToken')
      ) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'MISSING_CANCELLATION_TOKEN',
          severity: 'WARNING',
          category: 'RESOURCE_LEAK',
          title: 'Endpoint thiếu tham số CancellationToken',
          runtimeImpact: 'Khi người dùng reload hoặc tắt trang giữa chừng, backend vẫn tiếp tục xử lý truy vấn database nặng, gây lãng phí CPU và DB connections.',
          suggestion: 'Nhận `CancellationToken cancellationToken` vào controller action và truyền nó vào các câu truy vấn async (EF Core / HttpClient).',
        });
      }
    }
  }

  return issues;
}
