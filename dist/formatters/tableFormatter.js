import Table from 'cli-table3';
import chalk from 'chalk';
export function renderConsoleTable(result) {
    const { project, issues, summary, durationMs } = result;
    console.log('\n' + chalk.bold.cyan('========================================================================================'));
    console.log(chalk.bold.cyan(`  🔍 BÁO CÁO KIỂM TRA MÃ NGUỒN TRƯỚC KHI RELEASE`));
    console.log(chalk.bold.cyan('========================================================================================'));
    console.log(`📁 Dự án:      ${chalk.bold.white(project.name)} (${chalk.yellow(project.kind)})`);
    if (project.selectedProjectFile) {
        console.log(`🎯 Target:     ${chalk.bold.green(project.selectedProjectFile)}`);
    }
    else if (project.availableProjects && project.availableProjects.length > 1) {
        console.log(`📦 Projects:   ${chalk.gray(project.availableProjects.join(', '))} ${chalk.dim('(dùng -P <name> để quét riêng)')}`);
    }
    console.log(`📍 Đường dẫn:  ${chalk.gray(project.rootPath)}`);
    if (project.framework) {
        console.log(`⚡ Framework:  ${chalk.magenta(project.framework)}`);
    }
    if (project.isGitRepo) {
        console.log(`🌿 Branch:     ${chalk.green(project.currentBranch || 'N/A')}`);
    }
    console.log(`⏱️  Thời gian:   ${durationMs}ms\n`);
    if (issues.length === 0) {
        console.log(chalk.green.bold('🎉 CHÚC MỪNG! Không phát hiện lỗi hoặc rủi ro nghiêm trọng nào. Sẵn sàng Release! 🚀\n'));
        return;
    }
    // Create table matching user's desired columns: File & Dòng | Loại Risk / Quy tắc | Mức Độ | Vấn đề & Hướng Khắc Phục
    const table = new Table({
        head: [
            chalk.bold.white('File & Dòng'),
            chalk.bold.white('Loại Risk / Quy tắc'),
            chalk.bold.white('Mức Độ'),
            chalk.bold.white('Vấn đề & Hướng Khắc Phục'),
        ],
        colWidths: [36, 26, 12, 68],
        wordWrap: true,
        style: {
            head: [],
            border: ['gray'],
        },
    });
    // Sort: CRITICAL first, then WARNING, then INFO
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    const sortedIssues = [...issues].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    for (const issue of sortedIssues) {
        let severityBadge = '';
        switch (issue.severity) {
            case 'CRITICAL':
                severityBadge = chalk.red.bold('🔴 High');
                break;
            case 'WARNING':
                severityBadge = chalk.yellow.bold('🟡 Warning');
                break;
            case 'INFO':
                severityBadge = chalk.blue('🔵 Info');
                break;
        }
        const lineFormatted = issue.lineEnd ? `L${issue.line}-${issue.lineEnd}` : `L${issue.line}`;
        const fileAndLine = `${chalk.cyan(issue.file)}:${chalk.yellow(lineFormatted)}\n${chalk.dim('(' + issue.page + ')')}`;
        const riskType = chalk.bold.white(issue.riskType || issue.code || formatCategory(issue.category));
        const problemAndFix = `${issue.runtimeImpact}\n` +
            `${chalk.green('👉 Bổ sung / Khắc phục:')} ${issue.suggestion}`;
        table.push([fileAndLine, riskType, severityBadge, problemAndFix]);
    }
    console.log(table.toString());
    // Print Summary Stats
    console.log('\n' + chalk.bold('📊 THỐNG KÊ TỔNG KẾT:'));
    console.log(`  • Tổng số vấn đề:      ${chalk.bold.white(summary.total.toString())}`);
    console.log(`  • 🔴 Lỗi nghiêm trọng (High):  ${summary.critical > 0 ? chalk.red.bold(summary.critical.toString()) : chalk.green('0')}`);
    console.log(`  • 🟡 Cảnh báo rủi ro (Warning): ${summary.warning > 0 ? chalk.yellow.bold(summary.warning.toString()) : chalk.green('0')}`);
    console.log(`  • 🔵 Thông tin / Smell:         ${chalk.blue(summary.info.toString())}`);
    console.log(`  • 📄 Số Page/Module bị ảnh hưởng: ${chalk.bold.magenta(summary.affectedPagesCount.toString())}\n`);
    // Release Decision Banner
    if (summary.critical > 0) {
        console.log(chalk.bgRed.white.bold(' ❌ RELEASE STATUS: BLOCKED ') + chalk.red(` Có ${summary.critical} rủi ro High cần sửa trước khi release để tránh sập luồng vận hành trên production!\n`));
    }
    else if (summary.warning > 0) {
        console.log(chalk.bgYellow.black.bold(' ⚠️  RELEASE STATUS: CAUTION ') + chalk.yellow(' Không có lỗi critical nhưng có cảnh báo cần xem xét kỹ trước khi release.\n'));
    }
    else {
        console.log(chalk.bgGreen.white.bold(' ✅ RELEASE STATUS: APPROVED ') + chalk.green(' Code sạch sẽ, đạt chuẩn để release lên production!\n'));
    }
}
function formatCategory(category) {
    switch (category) {
        case 'LOGIC_BUG': return 'Logic Bug';
        case 'INCOMPLETE_MAPPING': return 'Incomplete Mapping';
        case 'DUPLICATE_CONSTANT': return 'Duplicate Constant & Typo';
        case 'RUNTIME_CRASH': return 'Runtime Crash Risk';
        case 'TYPE_ERROR': return 'Type Error';
        case 'SECURITY_RISK': return 'Security Vulnerability';
        case 'PERFORMANCE': return 'Performance Risk';
        default: return category;
    }
}
