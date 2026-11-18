import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fg from 'fast-glob';
import type { Issue, ProjectInfo, ScanOptions } from '../types.js';
import { mapFilePathToPage } from '../core/pageMapper.js';

export async function scanCSharpProject(project: ProjectInfo, options: ScanOptions): Promise<Issue[]> {
  const issues: Issue[] = [];
  const rootDir = project.rootPath;
  const scanDir = project.selectedProjectFile ? path.dirname(project.selectedProjectFile) : rootDir;
  const buildTarget = project.selectedProjectFile ? `"${project.selectedProjectFile}"` : '';

  // 1. Run dotnet build with warnings
  const csprojOrSln = project.selectedProjectFile || project.configFiles.find(f => f.endsWith('.sln') || f.endsWith('.csproj'));
  if (csprojOrSln) {
    try {
      // Run dotnet build for the solution or specific project
      execSync(`dotnet build ${buildTarget} -nologo -clp:NoSummary --property:WarningLevel=4`, {
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

          const fullFilePath = path.isAbsolute(rawFile) ? rawFile : path.resolve(rootDir, rawFile);

          // If a specific sub-project was targeted, ignore warnings from other projects
          if (project.selectedProjectFile && !fullFilePath.toLowerCase().startsWith(scanDir.toLowerCase())) {
            continue;
          }

          const relativeFile = path.relative(scanDir, fullFilePath);

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
    cwd: scanDir,
    ignore: ['**/bin/**', '**/obj/**', '**/.vs/**', '**/Migrations/**'],
    deep: 8,
  });

  for (const relFile of csFiles) {
    const fullPath = path.join(scanDir, relFile);
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

    // ── Excel Template Styling Checks (file-level analysis) ──
    // Only analyze files that reference Excel libraries
    const usesExcel =
      content.includes('using OfficeOpenXml') ||
      content.includes('using NPOI') ||
      content.includes('using ClosedXML') ||
      content.includes('using Aspose.Cells') ||
      content.includes('Microsoft.Office.Interop.Excel') ||
      content.includes('ExcelPackage') ||
      content.includes('IWorkbook') ||
      content.includes('XLWorkbook');

    if (usesExcel) {
      scanExcelTemplateIssues(content, lines, relFile, page, issues);
    }
  }

  return issues;
}

/**
 * Detect common Excel export/template styling bugs:
 *
 * Pattern A — A fixed border range is used in a scope with multiple template branches.
 *
 * Pattern B — Hardcoded literal range in a Cells[] style call when CompanyCode
 *   branching is nearby.
 *
 * Pattern C — Method writes many cell values but never applies Border styling
 *   (the entire method has zero Border references).
 *
 * Pattern D — LoadFromCollection / LoadFromDataTable not followed by border styling.
 */
function scanExcelTemplateIssues(
  content: string,
  lines: string[],
  relFile: string,
  page: string,
  issues: Issue[],
): void {

  // ── Pattern A: single borderRange variable set once, used across multi-template branches ──
  //
  // Find fixed range assignments, then check whether the variable is used for styling
  // in a scope that also branches on template/customer selection.

  const borderVarAssignRegex =
    /(?:string|var)?\s*(\w*[Bb]order\w*|rangeStr\w*|rangeEnd\w*|endRange\w*|styleRange\w*|borderRange\w*)\s*=\s*["']([A-Z]{1,3}\d*:[A-Z]{1,3})\d*["']/g;

  let aMatch: RegExpExecArray | null;
  while ((aMatch = borderVarAssignRegex.exec(content)) !== null) {
    const varName = aMatch[1];
    const rangeValue = aMatch[2];
    const assignLine = content.slice(0, aMatch.index).split('\n').length;

    // Find the method block that contains this assignment
    const methodBlocks = extractMethodBlocks(content);
    const containingMethod = methodBlocks.find(
      m => m.startLine <= assignLine && assignLine <= m.endLine,
    );
    const scopeBody = containingMethod?.body ?? content;

    // Does the same scope select different template files or branch on CompanyCode?
    const hasMultiTemplate =
      /sFileName\s*=|templateFile\s*=|TemplateFile\s*=/i.test(scopeBody) &&
      /CompanyCode|companyCode|customerCode|CustomerCode/i.test(scopeBody);

    // Is the variable actually used in a style/border Cells call?
    const usedInStyleCall =
      new RegExp(`worksheet\\.Cells\\s*\\[\\s*${varName}\\s*[+\\]]|range\\s*=\\s*worksheet\\.Cells\\s*\\[\\s*${varName}`).test(scopeBody) &&
      /Style|Border|Fill|Font/i.test(scopeBody);

    if (hasMultiTemplate && usedInStyleCall) {
      issues.push({
        page,
        file: relFile,
        line: assignLine,
        code: 'EXCEL_BORDER_RANGE_MISMATCH',
        severity: 'WARNING',
        category: 'EXCEL_TEMPLATE_STYLE',
        riskType: 'Excel Template Style (Border Range Mismatch)',
        title: `Biến "${varName}" = "${rangeValue}" cố định trong scope có nhiều nhánh template/CompanyCode; cần xác minh phạm vi`,
        runtimeImpact:
          `Nếu các nhánh ghi số cột khác nhau, range "${rangeValue}" có thể kẻ border dư hoặc thiếu. ` +
          `Cần đối chiếu cột cuối thực tế được ghi với từng template; scanner chưa xác định được số cột của từng nhánh.`,
        suggestion:
          `Xác minh số cột được ghi ở mỗi nhánh và cột cuối của template tương ứng. Nếu chúng khác nhau, ` +
          `tính phạm vi style từ vùng dữ liệu thực tế hoặc chọn phạm vi theo nhánh; không giả định tên template hay số cột.`,
      });
    }
  }

  // ── Pattern B: literal range string inside Cells[] style call, near CompanyCode branch ──
  const hardcodedLiteralRangeRegex =
    /\.(?:Cells|Range|get_Range)\s*\[\s*["']\s*([A-Z]{1,3}\d*)\s*:\s*([A-Z]{1,3})\d*\s*["']/gi;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    const litMatch = hardcodedLiteralRangeRegex.exec(lineText);
    hardcodedLiteralRangeRegex.lastIndex = 0; // reset stateful regex

    if (!litMatch) continue;

    const isStyleLine =
      /Style|Border|Fill|Font|NumberFormat|AutoFit|Merge/i.test(lineText);
    if (!isStyleLine) continue;

    const contextStart = Math.max(0, i - 40);
    const contextEnd   = Math.min(lines.length, i + 10);
    const surrounding  = lines.slice(contextStart, contextEnd).join('\n');

    const hasCompanyBranch = /CompanyCode|companyCode|customerCode|CustomerCode/i.test(surrounding);
    const hasMultiFile     = /sFileName\s*=|templateFile\s*=/i.test(surrounding);

    if (hasCompanyBranch || hasMultiFile) {
      const rangeStr = `${litMatch[1]}:${litMatch[2]}`;
      issues.push({
        page,
        file: relFile,
        line: i + 1,
        code: 'EXCEL_HARDCODED_STYLE_RANGE',
        severity: 'WARNING',
        category: 'EXCEL_TEMPLATE_STYLE',
        riskType: 'Excel Template Style (Hardcoded Range)',
        title: `Dùng range literal cố định "${rangeStr}" để set style, nhưng có phân nhánh theo CompanyCode/template`,
        runtimeImpact:
          `Nếu các nhánh chọn template có số cột khác nhau, range "${rangeStr}" có thể gây border thừa hoặc thiếu.`,
        suggestion:
          `Đối chiếu cột cuối được ghi với từng template. Nếu phạm vi khác nhau, tính style range từ vùng dữ liệu thực tế hoặc theo nhánh.`,
      });
    }
  }

  // ── Pattern C: method writes many cell values but has zero Border references ──
  const methodBlocks = extractMethodBlocks(content);
  for (const block of methodBlocks) {
    const writesData =
      block.body.match(/\.(?:Value|SetCellValue|SetCellFormula)\s*=/gi) ||
      block.body.match(/\.(?:LoadFromCollection|LoadFromDataTable|LoadFromArrays)\s*\(/gi);

    if (!writesData || writesData.length < 3) continue;

    const hasBorder =
      /Border|ExcelBorderStyle|BorderStyle|CellStyle|BorderAround/i.test(block.body);

    if (!hasBorder) {
      issues.push({
        page,
        file: relFile,
        line: block.startLine,
        lineEnd: block.endLine,
        code: 'EXCEL_MISSING_BORDER_STYLE',
        severity: 'WARNING',
        category: 'EXCEL_TEMPLATE_STYLE',
        riskType: 'Excel Missing Border/Style',
        title: `Hàm "${block.name}" ghi ${writesData.length} ô dữ liệu ra Excel nhưng không set Border`,
        runtimeImpact:
          'Không tìm thấy thao tác set border trong method này; nếu style không được áp dụng qua helper hoặc nơi khác, file có thể thiếu đường viền.',
        suggestion:
          'Kiểm tra helper/style được gọi bên ngoài method này. Nếu chưa có, áp dụng border cho vùng dữ liệu thực tế sau khi ghi xong, dùng API của thư viện Excel đang được project sử dụng.',
      });
    }
  }

  // ── Pattern D: LoadFromCollection / LoadFromDataTable without border after ──
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (lineText.trim().startsWith('//')) continue;

    if (!lineText.match(/\.(?:LoadFromCollection|LoadFromDataTable|LoadFromArrays)\s*\(/)) continue;

    const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 16)).join('\n');
    const hasStyleAfter = /Border|Style|AutoFit/i.test(nextLines);

    if (!hasStyleAfter) {
      issues.push({
        page,
        file: relFile,
        line: i + 1,
        code: 'EXCEL_LOAD_WITHOUT_STYLE',
        severity: 'WARNING',
        category: 'EXCEL_TEMPLATE_STYLE',
        riskType: 'Excel Load Data Without Styling',
        title: 'LoadFromCollection/LoadFromDataTable đổ data không set border/style sau đó',
        runtimeImpact:
          'Không tìm thấy thao tác style ngay sau lệnh nạp dữ liệu; style có thể được áp dụng ở helper hoặc đoạn code khác.',
        suggestion:
          'Kiểm tra các helper được gọi sau đó. Nếu chưa có style, xác định vùng dữ liệu được nạp và áp dụng format bằng API của thư viện Excel đang dùng.',
      });
    }
  }
}

/**
 * Extract method/function blocks from C# code for analysis.
 * Returns array of { name, startLine, endLine, body }
 */
function extractMethodBlocks(content: string): Array<{ name: string; startLine: number; endLine: number; body: string }> {
  const methods: Array<{ name: string; startLine: number; endLine: number; body: string }> = [];
  const lines = content.split('\n');

  // Simple method detection: find lines matching method signatures
  const methodRegex = /(?:public|private|protected|internal|static|async|override|virtual|\s)+\s+[\w<>\[\],\s]+\s+(\w+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(methodRegex);
    if (!match) continue;

    const methodName = match[1];
    // Skip common non-method matches
    if (['if', 'else', 'while', 'for', 'foreach', 'switch', 'catch', 'using', 'lock', 'new', 'return'].includes(methodName)) continue;

    // Find the opening brace
    let braceStart = -1;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].includes('{')) {
        braceStart = j;
        break;
      }
    }
    if (braceStart === -1) continue;

    // Count braces to find method end
    let depth = 0;
    let methodEnd = braceStart;
    for (let j = braceStart; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth === 0) {
        methodEnd = j;
        break;
      }
    }

    const body = lines.slice(braceStart, methodEnd + 1).join('\n');
    // Only include if the method body is not too large (avoid analyzing massive methods that do many things)
    if (body.length < 20000) {
      methods.push({
        name: methodName,
        startLine: i + 1,
        endLine: methodEnd + 1,
        body,
      });
    }
  }

  return methods;
}
