#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { runScan } from './core/scanner.js';
import { renderConsoleTable } from './formatters/tableFormatter.js';
import { generateHtmlReport } from './formatters/htmlFormatter.js';
import { generateJsonReport } from './formatters/jsonFormatter.js';
import type { IssueSeverity, ScanOptions } from './types.js';

const program = new Command();

program
  .name('code-check')
  .description('Công cụ CLI kiểm tra chất lượng mã nguồn & phát hiện lỗi trước khi release (Hỗ trợ C# & TypeScript)')
  .version('1.0.0')
  .option('-p, --path <path>', 'Đường dẫn thư mục dự án cần kiểm tra (mặc định: thư mục hiện tại)', '.')
  .option('-b, --branch <branch>', 'Chỉ kiểm tra các file thay đổi trên branch này')
  .option('--base <baseBranch>', 'Branch gốc để so sánh diff (mặc định: main/master)', 'main')
  .option('-s, --severity <levels>', 'Lọc theo mức độ (VD: critical,warning,info)')
  .option('--html <file>', 'Xuất báo cáo kết quả ra file HTML (VD: report.html)')
  .option('--json <file>', 'Xuất dữ liệu kết quả ra file JSON')
  .option('--strict', 'Trả về exit code 1 nếu phát hiện bất kỳ lỗi Critical nào (dùng cho CI/CD hoặc pre-commit hook)')
  .action(async (opts) => {
    const targetPath = path.resolve(opts.path);

    const spinner = ora({
      text: chalk.cyan(`Đang phân tích dự án tại: ${chalk.bold(targetPath)}...`),
      color: 'cyan',
    }).start();

    try {
      const severities = opts.severity
        ? opts.severity.split(',').map((s: string) => s.trim().toUpperCase() as IssueSeverity)
        : undefined;

      const scanOptions: ScanOptions = {
        projectPath: targetPath,
        branch: opts.branch,
        baseBranch: opts.base,
        severity: severities,
        htmlOutput: opts.html,
        jsonOutput: opts.json,
        strict: opts.strict,
      };

      const result = await runScan(scanOptions);
      spinner.succeed(chalk.green(`Đã quét xong dự án ${chalk.bold(result.project.name)} trong ${result.durationMs}ms!`));

      // Render CLI Table
      renderConsoleTable(result);

      // Export HTML if requested
      if (opts.html) {
        generateHtmlReport(result, opts.html);
        console.log(chalk.green(`📄 Đã xuất báo cáo HTML thành công: ${chalk.bold(path.resolve(opts.html))}`));
      }

      // Export JSON if requested
      if (opts.json) {
        generateJsonReport(result, opts.json);
        console.log(chalk.green(`📦 Đã xuất file JSON thành công: ${chalk.bold(path.resolve(opts.json))}`));
      }

      // Exit code for CI / strict mode
      if (opts.strict && result.summary.critical > 0) {
        process.exit(1);
      }
    } catch (err: unknown) {
      spinner.fail(chalk.red('Quá trình kiểm tra thất bại!'));
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program.parse(process.argv);
