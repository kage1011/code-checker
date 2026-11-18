import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fg from 'fast-glob';
import type { ProjectInfo, ProjectKind } from '../types.js';

export async function detectProject(targetPath: string, subProjectName?: string): Promise<ProjectInfo> {
  const resolvedPath = path.resolve(targetPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Đường dẫn project không tồn tại: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  let isDirectCsproj = false;
  let directCsprojPath: string | undefined;

  if (!stat.isDirectory()) {
    if (resolvedPath.endsWith('.csproj')) {
      isDirectCsproj = true;
      directCsprojPath = resolvedPath;
    } else if (resolvedPath.endsWith('.sln')) {
      // It's a solution file
    }
  }

  const rootDir = stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  // Check config files
  const tsConfig = path.join(rootDir, 'tsconfig.json');
  const packageJson = path.join(rootDir, 'package.json');
  const csprojFiles = await fg('**/*.csproj', { cwd: rootDir, deep: 4, ignore: ['**/bin/**', '**/obj/**'] });
  const slnFiles = await fg('**/*.sln', { cwd: rootDir, deep: 2 });

  const hasTs = fs.existsSync(tsConfig) || fs.existsSync(packageJson);
  const hasCSharp = isDirectCsproj || csprojFiles.length > 0 || slnFiles.length > 0;

  let kind: ProjectKind = 'UNKNOWN';
  if (hasTs && hasCSharp) {
    kind = 'HYBRID';
  } else if (hasTs) {
    kind = 'TYPESCRIPT';
  } else if (hasCSharp) {
    kind = 'CSHARP';
  }

  // Handle Solution & Sub-project selection
  const availableProjects = csprojFiles.map(f => path.basename(f, '.csproj'));
  let selectedProjectFile: string | undefined = directCsprojPath;
  let projectName = path.basename(rootDir);

  if (isDirectCsproj && directCsprojPath) {
    projectName = path.basename(directCsprojPath, '.csproj');
  } else if (subProjectName) {
    const cleanSub = subProjectName.replace(/\.csproj$/i, '').toLowerCase();
    const matched = csprojFiles.find(f => {
      const base = path.basename(f, '.csproj').toLowerCase();
      return base === cleanSub || f.toLowerCase().includes(cleanSub);
    });

    if (matched) {
      selectedProjectFile = path.resolve(rootDir, matched);
      projectName = path.basename(matched, '.csproj');
    } else {
      const list = availableProjects.length > 0 ? availableProjects.join(', ') : 'Không tìm thấy project .csproj nào';
      throw new Error(`Không tìm thấy project "${subProjectName}" trong solution!\n👉 Các project khả dụng gồm: ${list}`);
    }
  }

  // Detect Framework
  let framework: string | undefined;
  if (hasTs && fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['next']) framework = 'Next.js';
      else if (deps['react']) framework = 'React';
      else if (deps['vue']) framework = 'Vue';
      else if (deps['@angular/core']) framework = 'Angular';
      else if (deps['nuxt']) framework = 'Nuxt';
      else if (deps['express']) framework = 'Express.js';
      else if (deps['@nestjs/core']) framework = 'NestJS';
    } catch {
      // ignore
    }
  }

  if (hasCSharp && !framework) {
    if (csprojFiles.some(f => f.toLowerCase().includes('web') || f.toLowerCase().includes('api'))) {
      framework = 'ASP.NET Core Web/API';
    } else {
      framework = '.NET Application';
    }
  }

  // Check Git
  let isGitRepo = false;
  let currentBranch: string | undefined;
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (gitDir) {
      isGitRepo = true;
      currentBranch = execSync('git branch --show-current', { cwd: rootDir, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    }
  } catch {
    isGitRepo = false;
  }

  const configFiles: string[] = [];
  if (fs.existsSync(tsConfig)) configFiles.push('tsconfig.json');
  if (fs.existsSync(packageJson)) configFiles.push('package.json');
  if (selectedProjectFile) {
    configFiles.push(path.basename(selectedProjectFile));
  } else {
    configFiles.push(...csprojFiles.slice(0, 5));
  }
  configFiles.push(...slnFiles);

  return {
    kind,
    rootPath: rootDir,
    name: projectName,
    configFiles,
    framework,
    isGitRepo,
    currentBranch,
    availableProjects,
    selectedProjectFile,
  };
}
