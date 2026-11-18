import fs from 'node:fs';
import path from 'node:path';
import type { ScanResult } from '../types.js';

export function generateHtmlReport(result: ScanResult, outputPath: string): void {
  const { project, issues, summary, durationMs } = result;

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Release Code Inspection Report - ${escapeHtml(project.name)}</title>
  <style>
    :root {
      --bg: #12141a;
      --card-bg: #1a1d26;
      --border: #2a2e3d;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --critical: #f43f5e;
      --warning: #f59e0b;
      --info: #3b82f6;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem; }
    .container { max-width: 1500px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; color: #fff; }
    .meta { display: flex; gap: 1.5rem; font-size: 0.9rem; color: var(--text-muted); flex-wrap: wrap; margin-top: 0.5rem; }
    .meta span strong { color: var(--text); }
    .badge { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.65rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .badge-critical { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid var(--critical); }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid var(--warning); }
    .badge-info { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid var(--info); }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
    .stat-value { font-size: 1.8rem; font-weight: bold; margin-top: 0.25rem; }
    .controls { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 250px; background: var(--card-bg); border: 1px solid var(--border); color: var(--text); padding: 0.6rem 1rem; border-radius: 6px; }
    .filter-select { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); padding: 0.6rem 1rem; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 1.1rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
    th { background: #151821; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:hover { background: rgba(255,255,255,0.02); }
    .file-path { color: #f59e0b; font-family: monospace; font-size: 0.9rem; line-height: 1.5; font-weight: 500; }
    .page-tag { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
    .risk-type { font-weight: 600; color: #f1f5f9; font-size: 0.95rem; }
    .problem-impact { color: #e2e8f0; font-size: 0.9rem; line-height: 1.6; margin-bottom: 0.5rem; }
    .solution-box { background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 0.5rem 0.75rem; border-radius: 0 4px 4px 0; font-size: 0.85rem; color: #a7f3d0; line-height: 1.5; }
    .status-banner { padding: 1rem 1.5rem; border-radius: 8px; margin-bottom: 2rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; }
    .status-blocked { background: rgba(244, 63, 94, 0.15); border: 1px solid var(--critical); color: #fb7185; }
    .status-caution { background: rgba(245, 158, 11, 0.15); border: 1px solid var(--warning); color: #fbbf24; }
    .status-ready { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); color: #34d399; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🔍 Pre-Release Code Inspection Report</h1>
      <div class="meta">
        <span>Dự án: <strong>${escapeHtml(project.name)}</strong></span>
        <span>Công nghệ: <strong>${escapeHtml(project.kind)}</strong></span>
        ${project.framework ? `<span>Framework: <strong>${escapeHtml(project.framework)}</strong></span>` : ''}
        ${project.selectedProjectFile ? `<span>Target: <strong>${escapeHtml(project.selectedProjectFile)}</strong></span>` : ''}
        ${project.currentBranch ? `<span>Branch: <strong>${escapeHtml(project.currentBranch)}</strong></span>` : ''}
        <span>Thời gian quét: <strong>${durationMs}ms</strong></span>
      </div>
    </header>

    ${
      summary.critical > 0
        ? `<div class="status-banner status-blocked">❌ RELEASE STATUS: BLOCKED — Có ${summary.critical} rủi ro High cần khắc phục trước khi release!</div>`
        : summary.warning > 0
        ? `<div class="status-banner status-caution">⚠️ RELEASE STATUS: CAUTION — Cần rà soát các cảnh báo trước khi release.</div>`
        : `<div class="status-banner status-ready">✅ RELEASE STATUS: READY — Mã nguồn sạch sẽ, sẵn sàng release lên production!</div>`
    }

    <div class="stats-grid">
      <div class="stat-card">
        <div style="color: var(--text-muted); font-size: 0.85rem;">Tổng số vấn đề</div>
        <div class="stat-value">${summary.total}</div>
      </div>
      <div class="stat-card">
        <div style="color: #fb7185; font-size: 0.85rem;">Rủi ro High</div>
        <div class="stat-value" style="color: #fb7185;">${summary.critical}</div>
      </div>
      <div class="stat-card">
        <div style="color: #fbbf24; font-size: 0.85rem;">Cảnh báo Warning</div>
        <div class="stat-value" style="color: #fbbf24;">${summary.warning}</div>
      </div>
      <div class="stat-card">
        <div style="color: #38bdf8; font-size: 0.85rem;">Page/Module bị ảnh hưởng</div>
        <div class="stat-value" style="color: #38bdf8;">${summary.affectedPagesCount}</div>
      </div>
    </div>

    <div class="controls">
      <input type="text" id="searchInput" class="search-box" placeholder="Tìm kiếm theo File, Loại Risk hoặc Nội dung lỗi..." oninput="filterTable()">
      <select id="severityFilter" class="filter-select" onchange="filterTable()">
        <option value="ALL">Tất cả mức độ</option>
        <option value="CRITICAL">🔴 High</option>
        <option value="WARNING">🟡 Warning</option>
        <option value="INFO">🔵 Info</option>
      </select>
    </div>

    <table id="issuesTable">
      <thead>
        <tr>
          <th style="width: 320px;">File & Dòng</th>
          <th style="width: 240px;">Loại Risk / Quy tắc</th>
          <th style="width: 120px;">Mức Độ</th>
          <th>Vấn đề & Hướng Khắc Phục</th>
        </tr>
      </thead>
      <tbody>
        ${issues
          .map(
            issue => `
          <tr data-severity="${issue.severity}" data-search="${escapeHtml((issue.file + ' ' + (issue.riskType || '') + ' ' + issue.title + ' ' + issue.runtimeImpact).toLowerCase())}">
            <td>
              <div class="file-path">${escapeHtml(issue.file)}:${issue.lineEnd ? `L${issue.line}-${issue.lineEnd}` : `L${issue.line}`}</div>
              <div class="page-tag">${escapeHtml(issue.page)}</div>
            </td>
            <td><div class="risk-type">${escapeHtml(issue.riskType || issue.code || issue.category)}</div></td>
            <td>
              <span class="badge badge-${issue.severity.toLowerCase()}">
                ${issue.severity === 'CRITICAL' ? '🔴 High' : issue.severity === 'WARNING' ? '🟡 Warning' : '🔵 Info'}
              </span>
            </td>
            <td>
              <div class="problem-impact">${escapeHtml(issue.runtimeImpact || issue.title)}</div>
              ${issue.suggestion ? `<div class="solution-box"><strong>👉 Hướng khắc phục:</strong> ${escapeHtml(issue.suggestion)}</div>` : ''}
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <script>
    function filterTable() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const severity = document.getElementById('severityFilter').value;
      const rows = document.querySelectorAll('#issuesTable tbody tr');

      rows.forEach(row => {
        const rowSeverity = row.getAttribute('data-severity');
        const text = row.getAttribute('data-search') || '';
        const matchSearch = !search || text.includes(search);
        const matchSeverity = severity === 'ALL' || rowSeverity === severity;
        row.style.display = (matchSearch && matchSeverity) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(path.resolve(outputPath), html, 'utf-8');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
