import { execSync } from 'node:child_process';
import path from 'node:path';

export interface GitDiffInfo {
  changedFiles: string[];
  baseBranch?: string;
  targetBranch?: string;
}

export function getChangedFiles(repoPath: string, targetBranch?: string, baseBranch = 'main'): string[] {
  try {
    let command = '';
    if (targetBranch) {
      // Compare target branch with base branch
      command = `git diff --name-only ${baseBranch}...${targetBranch}`;
    } else {
      // Compare current uncommitted changes or difference with base
      command = `git diff --name-only ${baseBranch}...HEAD`;
    }

    const output = execSync(command, { cwd: repoPath, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const files = output
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)
      .map(f => path.resolve(repoPath, f));

    // If git diff returned nothing (e.g. no base branch or already up to date), check uncommitted changes
    if (files.length === 0 && !targetBranch) {
      const statusOutput = execSync('git status --porcelain', { cwd: repoPath, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const statusFiles = statusOutput
        .split('\n')
        .map(line => line.substring(3).trim())
        .filter(f => f.length > 0)
        .map(f => path.resolve(repoPath, f));
      return statusFiles;
    }

    return files;
  } catch {
    // If baseBranch failed, try 'master'
    if (baseBranch === 'main') {
      try {
        return getChangedFiles(repoPath, targetBranch, 'master');
      } catch {
        return [];
      }
    }
    return [];
  }
}
