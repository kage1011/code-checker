import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveRelatedProjectFiles, type DiscoveredProjectFile } from '../src/core/dependencyResolver.js';

test('follows controller dependencies, MVC views, text assets, and records binary template references', (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-checker-dependencies-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const sources = [
    addFile(rootDir, 'Controllers/QAController.cs', `
      public class QAController : Controller {
        private readonly IQAService service;
        public IActionResult Index() => View();
        public IActionResult Export() => File("QA.xlsx");
      }
    `),
    addFile(rootDir, 'Business/IQAService.cs', 'public interface IQAService { }'),
    addFile(rootDir, 'Business/QABusiness.cs', 'public class QABusiness : IQAService { private QADataAccess data; }'),
    addFile(rootDir, 'DataAccess/QADataAccess.cs', 'public class QADataAccess { string query = "QA.sql"; }'),
    addFile(rootDir, 'Models/QAViewModel.cs', 'public class QAViewModel { }'),
    addFile(rootDir, 'Views/QA/Index.cshtml', '@model QAViewModel'),
  ];
  const assets = [
    addFile(rootDir, 'Queries/QA.sql', 'SELECT 1'),
    addFile(rootDir, 'Templates/QA.xlsx', 'binary-placeholder'),
  ];

  const result = resolveRelatedProjectFiles(
    rootDir,
    'Controllers/QAController.cs',
    sources,
    assets,
  );
  const includedPaths = result.files.map((file) => file.relativePath.replace(/\\/g, '/'));

  assert.ok(includedPaths.includes('Controllers/QAController.cs'));
  assert.ok(includedPaths.includes('Business/IQAService.cs'));
  assert.ok(includedPaths.includes('Business/QABusiness.cs'));
  assert.ok(includedPaths.includes('DataAccess/QADataAccess.cs'));
  assert.ok(includedPaths.includes('Models/QAViewModel.cs'));
  assert.ok(includedPaths.includes('Views/QA/Index.cshtml'));
  assert.ok(includedPaths.includes('Queries/QA.sql'));
  assert.deepEqual(result.referencedBinaryAssets, ['Templates/QA.xlsx']);
});

test('rejects focus paths outside the project root', (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-checker-dependencies-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const source = addFile(rootDir, 'Controllers/QAController.cs', 'public class QAController { }');

  assert.throws(
    () => resolveRelatedProjectFiles(rootDir, '..\\outside.cs', [source], []),
    /phải nằm trong project/,
  );
});

function addFile(rootDir: string, relativePath: string, content: string): DiscoveredProjectFile {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return { relativePath, fullPath };
}
