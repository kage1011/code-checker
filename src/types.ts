export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type IssueCategory =
  | 'RUNTIME_CRASH'
  | 'TYPE_ERROR'
  | 'RESOURCE_LEAK'
  | 'SECURITY_RISK'
  | 'PERFORMANCE'
  | 'CODE_SMELL';

export interface Issue {
  page: string;
  file: string;
  line: number;
  column?: number;
  code?: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  runtimeImpact: string;
  suggestion: string;
}

export type ProjectKind = 'TYPESCRIPT' | 'CSHARP' | 'HYBRID' | 'UNKNOWN';

export interface ProjectInfo {
  kind: ProjectKind;
  rootPath: string;
  name: string;
  configFiles: string[];
  framework?: string;
  isGitRepo: boolean;
  currentBranch?: string;
}

export interface ScanOptions {
  projectPath: string;
  branch?: string;
  baseBranch?: string;
  severity?: IssueSeverity[];
  htmlOutput?: string;
  jsonOutput?: string;
  strict?: boolean;
}

export interface ScanResult {
  project: ProjectInfo;
  issues: Issue[];
  durationMs: number;
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    affectedPagesCount: number;
  };
}
