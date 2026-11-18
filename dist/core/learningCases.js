import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const STORE_VERSION = 1;
const STORE_DIRECTORY = '.code-checker';
const STORE_FILE = 'learning-cases.json';
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'when', 'then', 'else',
    'return', 'string', 'public', 'private', 'class', 'method', 'value', 'data',
    'file', 'code', 'using', 'var', 'const', 'true', 'false', 'null', 'async',
    'await', 'các', 'trong', 'được', 'những', 'không', 'này', 'khi', 'với',
    'cho', 'của', 'một', 'sau', 'trước', 'hoặc', 'nếu', 'thì', 'tại',
]);
export function getLearningCasePath(projectRoot) {
    return path.join(projectRoot, STORE_DIRECTORY, STORE_FILE);
}
export function recordConfirmedIssue(projectRoot, issue, rootCause, acceptedFix, tags) {
    const normalizedRootCause = rootCause.trim();
    const normalizedFix = acceptedFix.trim();
    if (!normalizedRootCause || !normalizedFix) {
        throw new Error('Nguyên nhân và cách sửa đã xác nhận không được để trống.');
    }
    if (normalizedRootCause.length > 1500 || normalizedFix.length > 1500) {
        throw new Error('Nguyên nhân và cách sửa tối đa 1500 ký tự mỗi trường.');
    }
    const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    if (normalizedTags.length > 10 || normalizedTags.some((tag) => tag.length > 60)) {
        throw new Error('Tối đa 10 tag, mỗi tag không quá 60 ký tự.');
    }
    const storePath = getLearningCasePath(projectRoot);
    const store = readStore(storePath);
    const learningCase = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        issue: {
            code: issue.code,
            category: issue.category,
            severity: issue.severity,
            riskType: issue.riskType,
            title: issue.title,
            file: issue.file,
        },
        rootCause: normalizedRootCause,
        acceptedFix: normalizedFix,
        tags: normalizedTags,
    };
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    const nextStore = {
        version: STORE_VERSION,
        cases: [...store.cases, learningCase],
    };
    fs.writeFileSync(storePath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf-8');
    return learningCase;
}
export function findRelevantLearningCases(projectRoot, sourceContext, limit = 3) {
    const store = readStore(getLearningCasePath(projectRoot));
    if (store.cases.length === 0 || !sourceContext.trim() || limit <= 0) {
        return [];
    }
    const queryTerms = tokenize(sourceContext);
    const caseTerms = store.cases.map((learningCase) => tokenize([
        learningCase.issue.code,
        learningCase.issue.category,
        learningCase.issue.riskType,
        learningCase.issue.title,
        learningCase.rootCause,
        learningCase.acceptedFix,
        learningCase.tags.join(' '),
    ].filter(Boolean).join(' ')));
    const documentFrequency = new Map();
    for (const terms of caseTerms) {
        for (const term of terms) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
    }
    return store.cases
        .map((learningCase, index) => {
        const terms = caseTerms[index];
        const matchedTerms = [...terms].filter((term) => queryTerms.has(term));
        const score = matchedTerms.reduce((total, term) => {
            const frequency = documentFrequency.get(term) || 0;
            return total + Math.log(1 + (store.cases.length + 1) / (frequency + 1));
        }, 0) / Math.sqrt(Math.max(terms.size, 1));
        return { learningCase, score, matchedTerms: matchedTerms.length };
    })
        .filter((match) => match.matchedTerms >= 2)
        .sort((a, b) => b.score - a.score || b.learningCase.createdAt.localeCompare(a.learningCase.createdAt))
        .slice(0, limit)
        .map((match) => match.learningCase);
}
function tokenize(text) {
    const normalized = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    const tokens = normalized.match(/[\p{L}\p{N}_]{3,}/gu) || [];
    return new Set(tokens.filter((token) => !STOP_WORDS.has(token)));
}
function readStore(storePath) {
    if (!fs.existsSync(storePath)) {
        return { version: STORE_VERSION, cases: [] };
    }
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    }
    catch (error) {
        throw new Error(`Không thể đọc kho lỗi đã xác nhận tại ${storePath}: ${error.message}`);
    }
    if (!isLearningCaseStore(parsed)) {
        throw new Error(`Kho lỗi tại ${storePath} không đúng định dạng hoặc phiên bản không được hỗ trợ.`);
    }
    return parsed;
}
function isLearningCaseStore(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return candidate.version === STORE_VERSION &&
        Array.isArray(candidate.cases) &&
        candidate.cases.every(isLearningCase);
}
function isLearningCase(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    const rawIssue = candidate.issue;
    if (!rawIssue || typeof rawIssue !== 'object')
        return false;
    const issue = rawIssue;
    return typeof candidate.id === 'string' &&
        typeof candidate.createdAt === 'string' &&
        isIssueCategory(issue.category) &&
        isIssueSeverity(issue.severity) &&
        typeof issue.title === 'string' &&
        typeof issue.file === 'string' &&
        (issue.code === undefined || typeof issue.code === 'string') &&
        (issue.riskType === undefined || typeof issue.riskType === 'string') &&
        typeof candidate.rootCause === 'string' &&
        typeof candidate.acceptedFix === 'string' &&
        Array.isArray(candidate.tags) &&
        candidate.tags.every((tag) => typeof tag === 'string');
}
function isIssueCategory(value) {
    return value === 'RUNTIME_CRASH' ||
        value === 'TYPE_ERROR' ||
        value === 'RESOURCE_LEAK' ||
        value === 'SECURITY_RISK' ||
        value === 'PERFORMANCE' ||
        value === 'CODE_SMELL' ||
        value === 'LOGIC_BUG' ||
        value === 'INCOMPLETE_MAPPING' ||
        value === 'DUPLICATE_CONSTANT' ||
        value === 'EXCEL_TEMPLATE_STYLE';
}
function isIssueSeverity(value) {
    return value === 'CRITICAL' || value === 'WARNING' || value === 'INFO';
}
