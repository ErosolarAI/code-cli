import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevTools } from '../src/tools/devTools.js';

test('repo_engineering_snapshot surfaces stack and recommendations', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-snapshot-'));
  try {
    const packageJson = {
      name: 'sample-app',
      version: '1.0.0',
      scripts: {
        'health-check': 'node scripts/health-check.mjs',
        test: 'vitest run',
        lint: 'eslint src --max-warnings=0',
        'type-check': 'tsc --noEmit',
        coverage: 'vitest run --coverage',
        build: 'tsc -b',
      },
      dependencies: {
        react: '^18.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
        vitest: '^1.0.0',
        eslint: '^9.0.0',
        prettier: '^3.0.0',
      },
    };

    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    writeFileSync(join(dir, 'tsconfig.json'), '{}');
    writeFileSync(join(dir, '.eslintrc.json'), '{"extends": ["eslint:recommended"]}');
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'test'));

    const tools = createDevTools(dir);
    const snapshotTool = tools.find(
      (tool) => tool.name === 'repo_engineering_snapshot',
    );
    assert.ok(snapshotTool, 'repo_engineering_snapshot tool should be registered');

    const output = await snapshotTool!.handler({});
    assert.match(output, /Repository Engineering Snapshot/);
    assert.match(output, /Package manager: npm/);
    assert.match(output, /Stack: .*TypeScript/);
    assert.match(output, /Quality signals: .*tests/);
    assert.match(output, /Key configs: .*tsconfig\.json/);
    assert.match(output, /Notable dirs: .*src/);
    assert.match(output, /Recommended commands/);
    assert.match(output, /npm run health-check/);
    assert.match(output, /npm test/);
    assert.match(output, /npm run lint/);
    assert.match(output, /npm run type-check/);
    assert.match(output, /npm run coverage/);
    assert.match(output, /npm run build/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run_validation_suite executes provided commands and reports summary', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'validation-suite-'));
  try {
    const tools = createDevTools(dir);
    const runner = tools.find((tool) => tool.name === 'run_validation_suite');
    assert.ok(runner, 'run_validation_suite tool should be registered');

    const successCommand = "node -e \"console.log('ok')\"";
    const failureCommand =
      "node -e \"console.error('boom'); process.exit(1)\"";

    const output = await runner!.handler({
      commands: [successCommand, failureCommand],
      maxParallel: 2,
      timeout: 10000,
      stopOnFailure: false,
    });

    assert.match(output, /Validation Suite Results/);
    assert.match(output, /Summary: 1\/2 commands succeeded/);
    assert.match(output, /console\.log/);
    assert.match(output, /Error:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
