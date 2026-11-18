import Table from 'cli-table3';
import chalk from 'chalk';
export function renderConsoleTable(result) {
    const { project, issues, summary, durationMs } = result;
    console.log('\n' + chalk.bold.cyan('========================================================================================'));
    console.log(chalk.bold.cyan(`  🔍 BÁO CÁO KIỂM TRA MÃ NGUỒN TRƯỚC KHI RELEASE`));
    console.log(chalk.bold.cyan('========================================================================================'));
    console.log(`📁 Dự án:      ${chalk.bold.white(project.name)} (${chalk.yellow(project.kind)})`);
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
    // Create table
    const table = new Table({
        head: [
            chalk.bold.white('Mức độ'),
            chalk.bold.white('Page / Module'),
            chalk.bold.white('Vị trí (File:Line)'),
            chalk.bold.white('Rủi ro khi vận hành (Runtime Impact)'),
            chalk.bold.white('Gợi ý xử lý'),
        ],
        colWidths: [13, 24, 38, 48, 38],
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
                severityBadge = chalk.red.bold('🔴 CRITICAL');
                break;
            case 'WARNING':
                severityBadge = chalk.yellow.bold('🟡 WARNING');
                break;
            case 'INFO':
                severityBadge = chalk.blue('🔵 INFO');
                break;
        }
        const pageText = chalk.cyan.bold(issue.page);
        const locationText = `${chalk.gray(issue.file)}:${chalk.yellow(issue.line)}`;
        const detailText = `${chalk.bold.white(issue.title)}\n${chalk.italic.gray('→ Hậu quả: ')}${issue.runtimeImpact}`;
        const suggestionText = chalk.green(issue.suggestion);
        table.push([severityBadge, pageText, locationText, detailText, suggestionText]);
    }
    console.log(table.toString());
    // Print Summary Stats
    console.log('\n' + chalk.bold('📊 THỐNG KÊ TỔNG KẾT:'));
    console.log(`  • Tổng số vấn đề:      ${chalk.bold.white(summary.total.toString())}`);
    console.log(`  • 🔴 Lỗi nghiêm trọng:  ${summary.critical > 0 ? chalk.red.bold(summary.critical.toString()) : chalk.green('0')}`);
    console.log(`  • 🟡 Cảnh báo rủi ro:   ${summary.warning > 0 ? chalk.yellow.bold(summary.warning.toString()) : chalk.green('0')}`);
    console.log(`  • 🔵 Thông tin / Smell:  ${chalk.blue(summary.info.toString())}`);
    console.log(`  • 📄 Số Page bị ảnh hưởng: ${chalk.bold.magenta(summary.affectedPagesCount.toString())}\n`);
    // Release Decision Banner
    if (summary.critical > 0) {
        console.log(chalk.bgRed.white.bold(' ❌ RELEASE STATUS: BLOCKED ') + chalk.red(` Có ${summary.critical} lỗi nghiêm trọng cần sửa trước khi release để tránh crash trên production!\n`));
    }
    else if (summary.warning > 0) {
        console.log(chalk.bgYellow.black.bold(' ⚠️  RELEASE STATUS: CAUTION ') + chalk.yellow(' Không có lỗi critical nhưng có cảnh báo cần xem xét kỹ trước khi release.\n'));
    }
    else {
        console.log(chalk.bgGreen.white.bold(' ✅ RELEASE STATUS: APPROVED ') + chalk.green(' Code sạch sẽ, đạt chuẩn để release lên production!\n'));
    }
}
