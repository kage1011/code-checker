import fs from 'node:fs';
import path from 'node:path';
export function generateJsonReport(result, outputPath) {
    const json = JSON.stringify(result, null, 2);
    fs.writeFileSync(path.resolve(outputPath), json, 'utf-8');
}
