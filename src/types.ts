export type IssueSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type IssueCategory =
  | 'RUNTIME_CRASH'
  | 'TYPE_ERROR'
  | 'RESOURCE_LEAK'
  | 'SECURITY_RISK'
  | 'PERFORMANCE'
  | 'CODE_SMELL'
  | 'LOGIC_BUG'
  | 'INCOMPLETE_MAPPING'
  | 'DUPLICATE_CONSTANT'
  | 'EXCEL_TEMPLATE_STYLE';

export interface Issue {
  page: string;
  file: string;
  line: number;
  lineEnd?: number;
  column?: number;
  code?: string;
  riskType?: string;
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
  availableProjects?: string[];
  selectedProjectFile?: string;
}

export interface ScanOptions {
  projectPath: string;
  subProject?: string;
  branch?: string;
  baseBranch?: string;
  focusFile?: string;
  severity?: IssueSeverity[];
  htmlOutput?: string;
  jsonOutput?: string;
  strict?: boolean;
  ai?: boolean;
  aiModel?: string;
  aiEndpoint?: string;
  aiNumCtx?: number;
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
