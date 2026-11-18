import fs from 'node:fs';
import path from 'node:path';
export function generateHtmlReport(result, outputPath) {
    const { project, issues, summary, durationMs } = result;
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pre-Release Code Inspection Report - ${escapeHtml(project.name)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --critical: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 2rem; }
    .container { max-width: 1400px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .meta { display: flex; gap: 1.5rem; font-size: 0.9rem; color: var(--text-muted); flex-wrap: wrap; margin-top: 0.5rem; }
    .meta span strong { color: var(--text); }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid var(--critical); }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid var(--warning); }
    .badge-info { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid var(--info); }
    .badge-page { background: #334155; color: #38bdf8; font-weight: 600; padding: 0.3rem 0.6rem; border-radius: 4px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
    .stat-value { font-size: 1.8rem; font-weight: bold; margin-top: 0.25rem; }
    .controls { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 250px; background: var(--card-bg); border: 1px solid var(--border); color: var(--text); padding: 0.6rem 1rem; border-radius: 6px; }
    .filter-select { background: var(--card-bg); border: 1px solid var(--border); color: var(--text); padding: 0.6rem 1rem; border-radius: 6px; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 1rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
    th { background: #1a2234; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    tr:hover { background: rgba(255,255,255,0.02); }
    .impact { color: #fca5a5; font-size: 0.85rem; margin-top: 0.4rem; line-height: 1.4; }
    .suggestion { color: #86efac; font-size: 0.85rem; line-height: 1.4; }
    .file-loc { font-family: monospace; font-size: 0.85rem; color: #cbd5e1; }
    .status-banner { padding: 1rem 1.5rem; border-radius: 8px; margin-bottom: 2rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; }
    .status-blocked { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--critical); color: #f87171; }
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
        ${project.currentBranch ? `<span>Branch: <strong>${escapeHtml(project.currentBranch)}</strong></span>` : ''}
        <span>Thời gian quét: <strong>${durationMs}ms</strong></span>
      </div>
    </header>

    ${summary.critical > 0
        ? `<div class="status-banner status-blocked">❌ RELEASE STATUS: BLOCKED — Có ${summary.critical} lỗi nghiêm trọng cần khắc phục trước khi release!</div>`
        : summary.warning > 0
            ? `<div class="status-banner status-caution">⚠️ RELEASE STATUS: CAUTION — Cần rà soát các cảnh báo rủi ro trước khi release.</div>`
            : `<div class="status-banner status-ready">✅ RELEASE STATUS: READY — Mã nguồn sạch sẽ, sẵn sàng release lên production!</div>`}

    <div class="stats-grid">
      <div class="stat-card">
        <div style="color: var(--text-muted); font-size: 0.85rem;">Tổng số vấn đề</div>
        <div class="stat-value">${summary.total}</div>
      </div>
      <div class="stat-card">
        <div style="color: #f87171; font-size: 0.85rem;">Lỗi Critical</div>
        <div class="stat-value" style="color: #f87171;">${summary.critical}</div>
      </div>
      <div class="stat-card">
        <div style="color: #fbbf24; font-size: 0.85rem;">Cảnh báo Warning</div>
        <div class="stat-value" style="color: #fbbf24;">${summary.warning}</div>
      </div>
      <div class="stat-card">
        <div style="color: #38bdf8; font-size: 0.85rem;">Page bị ảnh hưởng</div>
        <div class="stat-value" style="color: #38bdf8;">${summary.affectedPagesCount}</div>
      </div>
    </div>

    <div class="controls">
      <input type="text" id="searchInput" class="search-box" placeholder="Tìm kiếm theo Page, File hoặc Tên lỗi..." oninput="filterTable()">
      <select id="severityFilter" class="filter-select" onchange="filterTable()">
        <option value="ALL">Tất cả mức độ</option>
        <option value="CRITICAL">🔴 Critical</option>
        <option value="WARNING">🟡 Warning</option>
        <option value="INFO">🔵 Info</option>
      </select>
    </div>

    <table id="issuesTable">
      <thead>
        <tr>
          <th style="width: 110px;">Mức độ</th>
          <th style="width: 180px;">Page / Module</th>
          <th style="width: 240px;">Vị trí (File:Line)</th>
          <th>Lỗi & Nguy cơ khi vận hành</th>
          <th>Gợi ý khắc phục</th>
        </tr>
      </thead>
      <tbody>
        ${issues
        .map(issue => `
          <tr data-severity="${issue.severity}" data-page="${escapeHtml(issue.page.toLowerCase())}" data-file="${escapeHtml(issue.file.toLowerCase())}">
            <td><span class="badge badge-${issue.severity.toLowerCase()}">${issue.severity}</span></td>
            <td><span class="badge-page">${escapeHtml(issue.page)}</span></td>
            <td><div class="file-loc">${escapeHtml(issue.file)}:${issue.line}</div></td>
            <td>
              <strong>${escapeHtml(issue.title)}</strong>
              <div class="impact">⚠️ <strong>Hậu quả:</strong> ${escapeHtml(issue.runtimeImpact)}</div>
            </td>
            <td><div class="suggestion">${escapeHtml(issue.suggestion)}</div></td>
          </tr>
        `)
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
        const text = row.innerText.toLowerCase();
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
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
