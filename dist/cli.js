#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import { runScan } from './core/scanner.js';
import { recordConfirmedIssue } from './core/learningCases.js';
import { renderConsoleTable } from './formatters/tableFormatter.js';
import { generateHtmlReport } from './formatters/htmlFormatter.js';
import { generateJsonReport } from './formatters/jsonFormatter.js';
const program = new Command();
program
    .name('code-check')
    .description('Công cụ CLI kiểm tra chất lượng mã nguồn & phát hiện lỗi trước khi release (Hỗ trợ C# & TypeScript)')
    .version('1.0.0')
    .option('-p, --path <path>', 'Đường dẫn thư mục dự án cần kiểm tra (mặc định: thư mục hiện tại)', '.')
    .option('-P, --project <name>', 'Chỉ định tên project cụ thể trong solution (.sln) cần kiểm tra (VD: OrderApi)')
    .option('-b, --branch <branch>', 'Chỉ kiểm tra các file thay đổi trên branch này')
    .option('--base <baseBranch>', 'Branch gốc để so sánh diff (mặc định: main/master)', 'main')
    .option('--focus <file>', 'Tập trung AI review file này và lần theo code liên quan trong project')
    .option('-s, --severity <levels>', 'Lọc theo mức độ (VD: critical,warning,info)')
    .option('--html <file>', 'Xuất báo cáo kết quả ra file HTML (VD: report.html)')
    .option('--json <file>', 'Xuất dữ liệu kết quả ra file JSON')
    .option('--strict', 'Trả về exit code 1 nếu phát hiện bất kỳ lỗi Critical nào (dùng cho CI/CD hoặc pre-commit hook)')
    .option('--ai', 'Kích hoạt AI DeepSeek (Ollama Local) để phân tích Logic nghiệp vụ & Semantic Bugs', true)
    .option('--no-ai', 'Tắt tính năng AI DeepSeek')
    .option('--ai-model <model>', 'Tên model DeepSeek trên Ollama (mặc định: deepseek-r1:8b hoặc deepseek-coder:6.7b)', 'deepseek-r1:8b')
    .option('--ai-endpoint <url>', 'Endpoint máy chủ Ollama (mặc định: http://localhost:11434)', 'http://localhost:11434')
    .option('--ai-num-ctx <size>', 'Kích thước Context window cho Ollama (mặc định: 16384; với --focus: 100000)')
    .action(async (opts) => {
    const targetPath = path.resolve(opts.path);
    let spinner = null;
    if (!opts.ai) {
        spinner = ora({
            text: chalk.cyan(`Đang phân tích dự án tại: ${chalk.bold(targetPath)}...`),
            color: 'cyan',
        }).start();
    }
    else {
        console.log(chalk.bold.cyan(`\n🔍 Bắt đầu kiểm tra dự án: ${chalk.white(targetPath)}`));
    }
    try {
        const severities = opts.severity
            ? opts.severity.split(',').map((s) => s.trim().toUpperCase())
            : undefined;
        const scanOptions = {
            projectPath: targetPath,
            subProject: opts.project,
            branch: opts.branch,
            baseBranch: opts.base,
            focusFile: opts.focus,
            severity: severities,
            htmlOutput: opts.html,
            jsonOutput: opts.json,
            strict: opts.strict,
            ai: opts.ai,
            aiModel: opts.aiModel,
            aiEndpoint: opts.aiEndpoint,
            aiNumCtx: opts.aiNumCtx
                ? parseInt(opts.aiNumCtx, 10)
                : opts.focus ? 100000 : 16384,
        };
        const result = await runScan(scanOptions);
        if (spinner) {
            spinner.succeed(chalk.green(`Đã quét xong dự án ${chalk.bold(result.project.name)} trong ${result.durationMs}ms!`));
        }
        // Render CLI Table
        if (!opts.html) {
            renderConsoleTable(result);
        }
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
    }
    catch (err) {
        spinner.fail(chalk.red('Quá trình kiểm tra thất bại!'));
        console.error(chalk.red(err.message));
        process.exit(1);
    }
});
program
    .command('learn')
    .description('Lưu một issue đã xác minh và cách sửa để AI tham khảo ở các lần quét sau')
    .requiredOption('--from <file>', 'File báo cáo JSON được tạo bằng --json')
    .requiredOption('--issue <number>', 'Số thứ tự issue trong báo cáo (bắt đầu từ 1)')
    .requiredOption('--root-cause <text>', 'Nguyên nhân thực tế đã xác minh')
    .requiredOption('--fix <text>', 'Cách sửa đã được xác nhận')
    .option('--tags <tags>', 'Từ khóa phân loại, cách nhau bằng dấu phẩy')
    .action((opts) => {
    try {
        const reportPath = path.resolve(opts.from);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        if (!isScanReport(report)) {
            throw new Error('Báo cáo không đúng định dạng hoặc không chứa project/issues hợp lệ.');
        }
        const issueNumber = Number(opts.issue);
        if (!Number.isInteger(issueNumber) || issueNumber < 1 || issueNumber > report.issues.length) {
            throw new Error(`Số issue phải nằm trong khoảng 1-${report.issues.length}.`);
        }
        const issue = report.issues[issueNumber - 1];
        const projectRoot = path.resolve(report.project.rootPath);
        const learningCase = recordConfirmedIssue(projectRoot, issue, opts.rootCause, opts.fix, opts.tags ? opts.tags.split(',') : []);
        console.log(chalk.green(`✅ Đã lưu case ${learningCase.id} cho issue #${issueNumber}.`));
        console.log(chalk.gray(`   Kho case: ${path.resolve(projectRoot, '.code-checker', 'learning-cases.json')}`));
        console.log(chalk.gray('   Case chỉ chứa thông tin issue và phản hồi; không lưu source code.'));
    }
    catch (error) {
        console.error(chalk.red(`❌ Không thể lưu learning case: ${error.message}`));
        process.exitCode = 1;
    }
});
program.parse(process.argv);
function isScanReport(value) {
    if (!value || typeof value !== 'object')
        return false;
    const report = value;
    return typeof report.project?.rootPath === 'string' &&
        Array.isArray(report.issues) &&
        report.issues.every(isIssue);
}
function isIssue(value) {
    if (!value || typeof value !== 'object')
        return false;
    const issue = value;
    const categories = [
        'RUNTIME_CRASH',
        'TYPE_ERROR',
        'RESOURCE_LEAK',
        'SECURITY_RISK',
        'PERFORMANCE',
        'CODE_SMELL',
        'LOGIC_BUG',
        'INCOMPLETE_MAPPING',
        'DUPLICATE_CONSTANT',
        'EXCEL_TEMPLATE_STYLE',
    ];
    return typeof issue.page === 'string' &&
        typeof issue.file === 'string' &&
        typeof issue.line === 'number' &&
        typeof issue.category === 'string' &&
        categories.includes(issue.category) &&
        (issue.severity === 'CRITICAL' || issue.severity === 'WARNING' || issue.severity === 'INFO') &&
        typeof issue.title === 'string' &&
        typeof issue.runtimeImpact === 'string' &&
        typeof issue.suggestion === 'string';
}
