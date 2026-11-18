import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDeepSeekAiReview } from '../src/scanners/aiReviewer.js';
import type { ProjectInfo, ScanOptions } from '../src/types.js';

test('focus review uses the larger default context and includes a large focus file without Git diff', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'code-checker-ai-focus-'));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  const focusPath = path.join(projectRoot, 'Controllers', 'QAController.cs');
  fs.mkdirSync(path.dirname(focusPath), { recursive: true });
  const focusMarker = 'FOCUS_FILE_CONTENT_INCLUDED';
  fs.writeFileSync(
    focusPath,
    `public class QAController { }\n// ${focusMarker}\n// ${'x'.repeat(35000)}`,
    'utf-8',
  );

  let chatRequest: { options?: { num_ctx?: number }; messages?: Array<{ content: string }> } | undefined;
  const server = http.createServer((request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      return;
    }

    if (request.url !== '/api/chat') {
      response.writeHead(404).end();
      return;
    }

    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      chatRequest = JSON.parse(chunks.join('')) as typeof chatRequest;
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.end(`${JSON.stringify({ message: { content: '[]' }, done: true })}\n`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address() as net.AddressInfo;
    const project: ProjectInfo = {
      kind: 'CSHARP',
      rootPath: projectRoot,
      name: 'focus-test',
      configFiles: [],
      isGitRepo: false,
    };
    const options: ScanOptions = {
      projectPath: projectRoot,
      focusFile: 'Controllers/QAController.cs',
      aiEndpoint: `http://127.0.0.1:${address.port}`,
    };

    await runDeepSeekAiReview(project, options);

    assert.equal(chatRequest?.options?.num_ctx, 100000);
    assert.ok(chatRequest?.messages?.some((message) =>
      message.content.includes('Focus file: Controllers/QAController.cs') &&
      message.content.includes(focusMarker),
    ));
    assert.ok(!chatRequest?.messages?.some((message) => message.content.includes('Git diff (change details)')));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
