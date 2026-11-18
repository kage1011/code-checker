import { performance } from 'node:perf_hooks';
import { detectProject } from './detector.js';
import { getChangedFiles } from './gitHelper.js';
import { scanTypeScriptProject } from '../scanners/typeScriptScanner.js';
import { scanCSharpProject } from '../scanners/csharpScanner.js';
import type { Issue, ScanOptions, ScanResult } from '../types.js';

export async function runScan(options: ScanOptions): Promise<ScanResult> {
  const startTime = performance.now();
  const project = await detectProject(options.projectPath);

  let rawIssues: Issue[] = [];

  if (project.kind === 'TYPESCRIPT' || project.kind === 'HYBRID') {
    const tsIssues = await scanTypeScriptProject(project, options);
    rawIssues.push(...tsIssues);
  }

  if (project.kind === 'CSHARP' || project.kind === 'HYBRID') {
    const csIssues = await scanCSharpProject(project, options);
    rawIssues.push(...csIssues);
  }

  // Deduplicate issues on same file, line, and code/title
  const seen = new Set<string>();
  rawIssues = rawIssues.filter(issue => {
    const normalizedFile = issue.file.replace(/\\/g, '/').toLowerCase();
    const key = `${normalizedFile}:${issue.line}:${issue.code || issue.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // If user specified branch or only wants changed files in git
  if (options.branch || options.baseBranch) {
    const changedFiles = getChangedFiles(project.rootPath, options.branch, options.baseBranch || 'main');
    if (changedFiles.length > 0) {
      const normalizedChanged = new Set(changedFiles.map(f => f.replace(/\\/g, '/').toLowerCase()));
      rawIssues = rawIssues.filter(issue => {
        const norm = issue.file.replace(/\\/g, '/').toLowerCase();
        return Array.from(normalizedChanged).some(cf => cf.endsWith(norm) || norm.endsWith(cf));
      });
    }
  }

  // Filter by severity if specified
  if (options.severity && options.severity.length > 0) {
    rawIssues = rawIssues.filter(issue => options.severity!.includes(issue.severity));
  }

  const durationMs = Math.round(performance.now() - startTime);

  const critical = rawIssues.filter(i => i.severity === 'CRITICAL').length;
  const warning = rawIssues.filter(i => i.severity === 'WARNING').length;
  const info = rawIssues.filter(i => i.severity === 'INFO').length;

  const affectedPages = new Set(rawIssues.map(i => i.page));

  return {
    project,
    issues: rawIssues,
    durationMs,
    summary: {
      total: rawIssues.length,
      critical,
      warning,
      info,
      affectedPagesCount: affectedPages.size,
    },
  };
}
