import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const { scripts } = JSON.parse(await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'));

test('publicação dos anexos executa as duas funções em etapas e para se a primeira falhar', { skip: process.platform === 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-media-deploy-'));
  try {
    const calls = path.join(dir, 'calls');
    // Substitui somente npx: o script real do package.json roda sem rede,
    // credenciais ou qualquer publicação no servidor.
    await fs.writeFile(path.join(dir, 'npx'), '#!/bin/sh\nprintf "%s\\n" "$4" >> "$TASK_DEPLOY_CALLS"\nif [ "$TASK_DEPLOY_FAIL" = "$4" ]; then exit 1; fi\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, TASK_DEPLOY_CALLS: calls, TASK_DEPLOY_FAIL: '' };
    await exec('/bin/sh', ['-c', scripts['deploy:functions:report-media']], { cwd: dir, env });
    assert.deepEqual((await fs.readFile(calls, 'utf8')).trim().split('\n'), ['report-media', 'create-anonymous-report']);
    await fs.writeFile(calls, '');
    await assert.rejects(exec('/bin/sh', ['-c', scripts['deploy:functions:report-media']], { cwd: dir, env: { ...env, TASK_DEPLOY_FAIL: 'report-media' } }));
    assert.equal((await fs.readFile(calls, 'utf8')).trim(), 'report-media');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
