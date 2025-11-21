import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

test('bo --version prints the package version and exits cleanly', () => {
  const cliPath = resolve(ROOT, 'src/bin/bo.ts');
  const packagePath = resolve(ROOT, 'package.json');
  const expected = JSON.parse(readFileSync(packagePath, 'utf8')).version;

  const result = spawnSync(
    process.execPath,
    ['--loader', 'ts-node/esm', cliPath, '--version'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        TS_NODE_PROJECT: resolve(ROOT, 'tsconfig.test.json'),
        TS_NODE_TRANSPILE_ONLY: '1',
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), expected);
});
