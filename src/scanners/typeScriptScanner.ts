import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fg from 'fast-glob';
import type { Issue, ProjectInfo, ScanOptions } from '../types.js';
import { mapFilePathToPage } from '../core/pageMapper.js';

export async function scanTypeScriptProject(project: ProjectInfo, options: ScanOptions): Promise<Issue[]> {
  const issues: Issue[] = [];
  const rootDir = project.rootPath;

  // 1. Run tsc --noEmit if tsconfig.json exists
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    try {
      execSync('npx tsc --noEmit --pretty false', {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });
    } catch (err: unknown) {
      const errorOutput = (err as { stdout?: string; stderr?: string }).stdout || '';
      const lines = errorOutput.split('\n');

      for (const line of lines) {
        // Example: src/pages/cart.tsx(45,12): error TS2322: Type 'string' is not assignable to type 'number'.
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
        if (match) {
          const relativeFile = path.relative(rootDir, path.resolve(rootDir, match[1]));
          const lineNum = parseInt(match[2], 10);
          const colNum = parseInt(match[3], 10);
          const errorCode = match[5];
          const message = match[6].trim();

          const isNullOrUndefined = errorCode === 'TS2532' || errorCode === 'TS2531' || errorCode === 'TS18048';
          const isMissingProp = errorCode === 'TS2339' || errorCode === 'TS2322';

          let runtimeImpact = 'Lỗi biên dịch TypeScript. Code không thể build hoặc bundle để release.';
          if (isNullOrUndefined) {
            runtimeImpact = 'CRASH RUNTIME: Có thể xảy ra "Cannot read properties of undefined/null" gây vỡ giao diện (WSOD) khi dữ liệu API chưa tải xong.';
          } else if (isMissingProp) {
            runtimeImpact = 'Thuộc tính không tồn tại trong type. Có thể dẫn đến render giá trị undefined hoặc sập luồng xử lý.';
          }

          issues.push({
            page: mapFilePathToPage(relativeFile),
            file: relativeFile,
            line: lineNum,
            column: colNum,
            code: errorCode,
            severity: isNullOrUndefined ? 'CRITICAL' : 'CRITICAL',
            category: isNullOrUndefined ? 'RUNTIME_CRASH' : 'TYPE_ERROR',
            title: message,
            runtimeImpact,
            suggestion: isNullOrUndefined
              ? 'Sử dụng Optional Chaining (?.) hoặc kiểm tra null/undefined trước khi truy xuất.'
              : 'Sửa lại type hoặc kiểm tra lại định dạng dữ liệu truyền vào.',
          });
        }
      }
    }
  }

  // 2. Scan source files for Runtime Bugs & Code Smells (AST & Regex pattern analysis)
  const sourceFiles = await fg(['**/*.{ts,tsx,js,jsx}'], {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.d.ts'],
    deep: 8,
  });

  for (const relFile of sourceFiles) {
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

      // Check: Hardcoded localhost or internal IP before release
      if (lineText.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i) && !relFile.includes('.test.') && !relFile.includes('.spec.')) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'HARDCODED_LOCAL_URL',
          severity: 'CRITICAL',
          category: 'RUNTIME_CRASH',
          title: 'Hardcoded URL localhost trong code trước release',
          runtimeImpact: 'Khi deploy lên production, request gọi về localhost sẽ thất bại 100%, tính năng trên page này sẽ tê liệt.',
          suggestion: 'Chuyển sang dùng biến môi trường (process.env / import.meta.env).',
        });
      }

      // Check: Unhandled fetch / axios call without await or catch (floating promise)
      if (
        lineText.match(/(?:fetch|axios\.(?:get|post|put|delete))\([^)]*\)/) &&
        !lineText.includes('await') &&
        !lineText.includes('return') &&
        !lineText.includes('.catch') &&
        !lineText.includes('const ') &&
        !lineText.includes('let ')
      ) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'UNHANDLED_ASYNC_CALL',
          severity: 'CRITICAL',
          category: 'RUNTIME_CRASH',
          title: 'Gọi API bất đồng bộ không bắt lỗi (Unhandled Promise)',
          runtimeImpact: 'Khi mạng chập chờn hoặc API lỗi 500, lỗi không được catch sẽ gây unhandled promise rejection và làm treo UI.',
          suggestion: 'Thêm `await` kèm khối `try...catch`, hoặc gắn `.catch(err => ...)` để xử lý trạng thái lỗi.',
        });
      }

      // Check: dangerouslySetInnerHTML
      if (lineText.includes('dangerouslySetInnerHTML')) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'DANGEROUS_HTML_INJECTION',
          severity: 'CRITICAL',
          category: 'SECURITY_RISK',
          title: 'Sử dụng dangerouslySetInnerHTML có nguy cơ XSS',
          runtimeImpact: 'Kẻ tấn công có thể chèn mã độc JavaScript vào trang nếu nội dung HTML xuất phát từ input của user hoặc API bên thứ ba.',
          suggestion: 'Sử dụng thư viện sanitize (như DOMPurify) trước khi render HTML, hoặc dùng component thông thường.',
        });
      }

      // Check: Debugger statement leftover
      if (lineText.trim() === 'debugger;' || lineText.trim() === 'debugger') {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'DEBUGGER_LEFTOVER',
          severity: 'CRITICAL',
          category: 'RUNTIME_CRASH',
          title: 'Còn sót lệnh debugger trong code',
          runtimeImpact: 'Khi người dùng hoặc tester mở F12 DevTools trên production, toàn bộ trang web sẽ bị dừng (freeze) tại breakpoint này.',
          suggestion: 'Xóa câu lệnh debugger trước khi tạo bản release.',
        });
      }

      // Check: Overuse of 'as any' in critical business logic
      if (lineText.match(/\bas\s+any\b/) && (relFile.includes('/pages/') || relFile.includes('/app/') || relFile.includes('/services/'))) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'UNSAFE_TYPE_CAST_ANY',
          severity: 'WARNING',
          category: 'TYPE_ERROR',
          title: 'Ép kiểu "as any" bỏ qua kiểm tra type safety',
          runtimeImpact: 'Mất hoàn toàn sự bảo vệ của TypeScript. Nếu dữ liệu runtime sai cấu trúc, app sẽ crash mà không có cảnh báo lúc compile.',
          suggestion: 'Định nghĩa interface/type cụ thể hoặc sử dụng `unknown` kết hợp type guard (Zod / type predicates).',
        });
      }

      // Check: Leftover console.log in production code
      if (lineText.match(/console\.(?:log|debug|info)\(/) && !relFile.includes('.test.') && !relFile.includes('.spec.')) {
        issues.push({
          page,
          file: relFile,
          line: lineNum,
          code: 'CONSOLE_LOG_LEFTOVER',
          severity: 'INFO',
          category: 'CODE_SMELL',
          title: 'Còn sót log debug ra console',
          runtimeImpact: 'Gây lộ thông tin nhạy cảm (data payload) trên console trình duyệt của khách hàng và ảnh hưởng nhẹ đến hiệu năng.',
          suggestion: 'Loại bỏ console.log hoặc dùng logger chuyên dụng có cấu hình tắt ở production.',
        });
      }
    }
  }

  return issues;
}
