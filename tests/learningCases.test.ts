import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findRelevantLearningCases, getLearningCasePath, recordConfirmedIssue } from '../src/core/learningCases.js';
import type { Issue } from '../src/types.js';

test('records a confirmed case and retrieves it for matching source context', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-checker-learning-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const issue: Issue = {
    page: 'Export',
    file: 'Report.cs',
    line: 42,
    code: 'EXCEL_BORDER_RANGE_MISMATCH',
    severity: 'WARNING',
    category: 'EXCEL_TEMPLATE_STYLE',
    title: 'Excel border range may not match template columns',
    runtimeImpact: 'The range may exceed the actual data columns.',
    suggestion: 'Verify the range against each template.',
  };

  const recorded = recordConfirmedIssue(
    projectRoot,
    issue,
    'The CompanyCode branch writes different column counts.',
    'Derive the border range from the actual columns written by the selected template.',
    ['excel', 'template', 'CompanyCode'],
  );
  const stored = JSON.parse(fs.readFileSync(getLearningCasePath(projectRoot), 'utf-8'));
  const relevant = findRelevantLearningCases(
    projectRoot,
    'worksheet borderRange CompanyCode selects template and writes columns',
  );

  assert.equal(stored.cases[0].id, recorded.id);
  assert.equal(relevant.length, 1);
  assert.equal(relevant[0].acceptedFix, recorded.acceptedFix);
});

test('does not return cases with insufficient lexical overlap', (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-checker-learning-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const issue: Issue = {
    page: 'Export',
    file: 'Report.cs',
    line: 42,
    severity: 'WARNING',
    category: 'EXCEL_TEMPLATE_STYLE',
    title: 'Excel border range mismatch',
    runtimeImpact: 'Wrong border range.',
    suggestion: 'Verify template columns.',
  };
  recordConfirmedIssue(projectRoot, issue, 'Different template column counts.', 'Calculate the range dynamically.', []);

  assert.deepEqual(findRelevantLearningCases(projectRoot, 'database transaction isolation concurrency'), []);
});
