import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import fg from 'fast-glob';
import type { ProjectInfo, ProjectKind } from '../types.js';

export async function detectProject(targetPath: string): Promise<ProjectInfo> {
  const resolvedPath = path.resolve(targetPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Đường dẫn project không tồn tại: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  const rootDir = stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);

  // Check config files
  const tsConfig = path.join(rootDir, 'tsconfig.json');
  const packageJson = path.join(rootDir, 'package.json');
  const csprojFiles = await fg('**/*.csproj', { cwd: rootDir, deep: 3, ignore: ['**/bin/**', '**/obj/**'] });
  const slnFiles = await fg('**/*.sln', { cwd: rootDir, deep: 2 });

  const hasTs = fs.existsSync(tsConfig) || fs.existsSync(packageJson);
  const hasCSharp = csprojFiles.length > 0 || slnFiles.length > 0;

  let kind: ProjectKind = 'UNKNOWN';
  if (hasTs && hasCSharp) {
    kind = 'HYBRID';
  } else if (hasTs) {
    kind = 'TYPESCRIPT';
  } else if (hasCSharp) {
    kind = 'CSHARP';
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
  configFiles.push(...csprojFiles.slice(0, 3));
  configFiles.push(...slnFiles);

  return {
    kind,
    rootPath: rootDir,
    name: path.basename(rootDir),
    configFiles,
    framework,
    isGitRepo,
    currentBranch,
  };
}
