import fs from 'node:fs';
import path from 'node:path';

const MAX_RELATED_FILES = 40;
const MAX_DEPENDENCY_DEPTH = 4;
const TEXT_ASSET_EXTENSIONS = new Set([
  '.sql', '.json', '.xml', '.config', '.rdlc', '.resx', '.html', '.htm', '.txt', '.csv',
]);
const BINARY_TEMPLATE_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xls']);

export interface DiscoveredProjectFile {
  relativePath: string;
  fullPath: string;
}

export interface RelatedProjectFile extends DiscoveredProjectFile {
  content: string;
  depth: number;
  reason: string;
}

export interface RelatedProjectContext {
  files: RelatedProjectFile[];
  referencedBinaryAssets: string[];
  omittedFileCount: number;
}

export function resolveRelatedProjectFiles(
  rootDir: string,
  focusFilePath: string,
  sourceFiles: DiscoveredProjectFile[],
  supportingFiles: DiscoveredProjectFile[],
): RelatedProjectContext {
  const resolvedFocusPath = path.resolve(rootDir, focusFilePath);
  const relativeFocusPath = path.relative(rootDir, resolvedFocusPath);
  if (
    !relativeFocusPath ||
    relativeFocusPath === '..' ||
    relativeFocusPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeFocusPath)
  ) {
    throw new Error(`File focus phải nằm trong project: ${focusFilePath}`);
  }

  const normalizedFocusPath = normalizePath(resolvedFocusPath);
  const sourceByPath = new Map(sourceFiles.map((file) => [normalizePath(file.fullPath), file]));
  const focusFile = sourceByPath.get(normalizedFocusPath);
  if (!focusFile) {
    throw new Error(`Không tìm thấy file focus trong project hoặc định dạng không được hỗ trợ: ${focusFilePath}`);
  }

  const loadedSources: RelatedProjectFile[] = sourceFiles.map((file) => ({
    ...file,
    content: fs.readFileSync(file.fullPath, 'utf-8'),
    depth: 0,
    reason: 'Project source',
  }));
  const loadedSourceByPath = new Map(loadedSources.map((file) => [normalizePath(file.fullPath), file]));
  const declarations = indexDeclaredTypes(loadedSources);
  const typeUsers = indexTypeUsers(loadedSources);
  const sourcesByName = indexBasenames(loadedSources);
  const supportingByName = indexBasenames(supportingFiles);
  const selected = new Map<string, RelatedProjectFile>();
  const pending: RelatedProjectFile[] = [];
  const referencedBinaryAssets = new Set<string>();
  let omittedFileCount = 0;

  const addSource = (file: DiscoveredProjectFile, depth: number, reason: string): void => {
    const key = normalizePath(file.fullPath);
    if (selected.has(key)) return;
    if (selected.size >= MAX_RELATED_FILES) {
      omittedFileCount++;
      return;
    }

    const loadedFile = loadedSourceByPath.get(key);
    if (!loadedFile) return;
    const relatedFile = { ...loadedFile, depth, reason };
    selected.set(key, relatedFile);
    pending.push(relatedFile);
  };

  addSource(focusFile, 0, 'File được chọn để phân tích');

  while (pending.length > 0) {
    const current = pending.shift()!;
    const nextDepth = current.depth + 1;

    for (const assetName of findReferencedAssets(current.content)) {
      const assetCandidates = supportingByName.get(assetName.toLowerCase()) || [];
      const binaryCandidates = assetCandidates.filter((file) =>
        BINARY_TEMPLATE_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()),
      );
      for (const asset of binaryCandidates) {
        referencedBinaryAssets.add(asset.relativePath);
      }

      const textCandidates = assetCandidates.filter((file) =>
        TEXT_ASSET_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()),
      );
      for (const asset of textCandidates) {
        const key = normalizePath(asset.fullPath);
        if (selected.has(key)) continue;
        if (selected.size >= MAX_RELATED_FILES) {
          omittedFileCount++;
          continue;
        }
        const relatedFile: RelatedProjectFile = {
          ...asset,
          content: fs.readFileSync(asset.fullPath, 'utf-8'),
          depth: nextDepth,
          reason: 'Tài nguyên văn bản được tham chiếu từ source',
        };
        selected.set(key, relatedFile);
      }
    }

    if (current.depth >= MAX_DEPENDENCY_DEPTH) continue;

    for (const reference of findSourceReferences(current, declarations, sourcesByName)) {
      addSource(reference.file, nextDepth, reference.reason);
    }

    for (const user of findTypeUsers(current, typeUsers)) {
      addSource(user.file, nextDepth, user.reason);
    }

    for (const viewFile of findRelatedViews(current, loadedSources)) {
      addSource(viewFile, nextDepth, 'View/template MVC liên quan');
    }

    for (const importPath of findRelativeImports(current.content, current.fullPath)) {
      const importedFile = loadedSourceByPath.get(normalizePath(importPath));
      if (importedFile) {
        addSource(importedFile, nextDepth, 'Module được import trực tiếp');
      }
    }
  }

  return {
    files: [...selected.values()].sort((a, b) =>
      a.depth - b.depth || a.relativePath.localeCompare(b.relativePath),
    ),
    referencedBinaryAssets: [...referencedBinaryAssets].sort(),
    omittedFileCount,
  };
}

function indexDeclaredTypes(files: RelatedProjectFile[]): Map<string, RelatedProjectFile[]> {
  const declarations = new Map<string, RelatedProjectFile[]>();
  const declarationRegex = /\b(?:class|interface|record|struct|enum)\s+([A-Za-z_]\w*)/g;
  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = declarationRegex.exec(file.content)) !== null) {
      const typeName = match[1].toLowerCase();
      const matches = declarations.get(typeName) || [];
      matches.push(file);
      declarations.set(typeName, matches);
    }
  }
  return declarations;
}

function indexTypeUsers(files: RelatedProjectFile[]): Map<string, RelatedProjectFile[]> {
  const users = new Map<string, RelatedProjectFile[]>();
  for (const file of files) {
    const identifiers = new Set((file.content.match(/[A-Za-z_$][\w$]*/g) || []).map((name) => name.toLowerCase()));
    for (const identifier of identifiers) {
      const matches = users.get(identifier) || [];
      matches.push(file);
      users.set(identifier, matches);
    }
  }
  return users;
}

function indexBasenames<T extends DiscoveredProjectFile>(files: T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const file of files) {
    const key = path.basename(file.relativePath).toLowerCase();
    const matches = index.get(key) || [];
    matches.push(file);
    index.set(key, matches);
  }
  return index;
}

function findSourceReferences(
  current: RelatedProjectFile,
  declarations: Map<string, RelatedProjectFile[]>,
  filesByName: Map<string, RelatedProjectFile[]>,
): Array<{ file: RelatedProjectFile; reason: string }> {
  const results = new Map<string, { file: RelatedProjectFile; reason: string }>();
  const identifiers = new Set(current.content.match(/[A-Za-z_$][\w$]*/g) || []);

  for (const identifier of identifiers) {
    const declaredFiles = declarations.get(identifier.toLowerCase()) || [];
    for (const file of declaredFiles) {
      if (normalizePath(file.fullPath) === normalizePath(current.fullPath)) continue;
      results.set(normalizePath(file.fullPath), { file, reason: `Source tham chiếu kiểu ${identifier}` });
    }
  }

  for (const fileName of findReferencedSourceFilenames(current.content)) {
    for (const file of filesByName.get(fileName.toLowerCase()) || []) {
      if (normalizePath(file.fullPath) === normalizePath(current.fullPath)) continue;
      results.set(normalizePath(file.fullPath), { file, reason: `Source tham chiếu file ${fileName}` });
    }
  }

  return [...results.values()];
}

function findTypeUsers(
  current: RelatedProjectFile,
  usersByType: Map<string, RelatedProjectFile[]>,
): Array<{ file: RelatedProjectFile; reason: string }> {
  const declaredNames = new Set(
    [...current.content.matchAll(/\b(?:class|interface|record|struct|enum)\s+([A-Za-z_]\w*)/g)]
      .map((match) => match[1].toLowerCase()),
  );
  if (declaredNames.size === 0) return [];

  const results = new Map<string, { file: RelatedProjectFile; reason: string }>();
  for (const declaredName of declaredNames) {
    for (const file of usersByType.get(declaredName) || []) {
      if (normalizePath(file.fullPath) === normalizePath(current.fullPath)) continue;
      results.set(normalizePath(file.fullPath), {
        file,
        reason: `Source tham chiếu kiểu ${declaredName} được khai báo tại file liên quan`,
      });
    }
  }
  return [...results.values()];
}

function findRelatedViews(
  current: RelatedProjectFile,
  files: RelatedProjectFile[],
): RelatedProjectFile[] {
  if (!/Controller\.cs$/i.test(current.relativePath)) return [];

  const controllerName = path.basename(current.relativePath, path.extname(current.relativePath))
    .replace(/Controller$/i, '')
    .toLowerCase();
  const viewNames = new Set<string>();
  const viewCallRegex = /\b(?:View|PartialView)\s*\(\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = viewCallRegex.exec(current.content)) !== null) {
    viewNames.add(path.basename(match[1]).replace(/\.cshtml$/i, '').toLowerCase());
  }

  return files.filter((file) => {
    if (!/\.cshtml$/i.test(file.relativePath)) return false;
    const normalized = file.relativePath.replace(/\\/g, '/').toLowerCase();
    const viewFolderPattern = new RegExp(`(?:^|/)views/${escapeRegExp(controllerName)}/`);
    const inControllerFolder = viewFolderPattern.test(normalized);
    const nameMatches = viewNames.has(path.basename(file.relativePath, '.cshtml').toLowerCase());
    const inSharedFolder = /(?:^|\/)views\/shared\//i.test(normalized) && nameMatches;
    return inControllerFolder || inSharedFolder;
  });
}

function findReferencedSourceFilenames(content: string): string[] {
  const names = new Set<string>();
  const pattern = /["']([^"'\\/\r\n]+?\.(?:cs|cshtml|ts|tsx))["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

function findReferencedAssets(content: string): string[] {
  const names = new Set<string>();
  const pattern = /["']([^"'\\/\r\n]+?\.(?:sql|json|xml|config|rdlc|resx|html?|txt|csv|xlsx|xlsm|xls))["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

function findRelativeImports(content: string, sourcePath: string): string[] {
  const imports = new Set<string>();
  const pattern = /(?:from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const basePath = path.resolve(path.dirname(sourcePath), match[1]);
    imports.add(basePath);
    const extension = path.extname(basePath).toLowerCase();
    if (!extension || ['.js', '.mjs', '.cjs'].includes(extension)) {
      const sourceBasePath = extension ? basePath.slice(0, -extension.length) : basePath;
      imports.add(`${sourceBasePath}.ts`);
      imports.add(`${sourceBasePath}.tsx`);
      imports.add(path.join(sourceBasePath, 'index.ts'));
      imports.add(path.join(sourceBasePath, 'index.tsx'));
    }
  }
  return [...imports];
}

function normalizePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
