import fs from 'node:fs';
import path from 'node:path';
import type { ScanResult } from '../types.js';

export function generateJsonReport(result: ScanResult, outputPath: string): void {
  const json = JSON.stringify(result, null, 2);
  fs.writeFileSync(path.resolve(outputPath), json, 'utf-8');
}
