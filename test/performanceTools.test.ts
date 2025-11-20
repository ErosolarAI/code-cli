import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceTools } from '../src/tools/performanceTools.js';

test('ParallelExecute summarizes successful commands', async () => {
  const [tool] = createPerformanceTools();
  if (!tool) {
    throw new Error('ParallelExecute tool is not registered');
  }
  const output = await tool.handler({
    commands: [
      `node -e "console.log('one')"`,
      `node -e "console.log('two')"`,
    ],
    timeout: 10000,
    maxConcurrency: 2,
  });

  assert.match(output, /Overall: 2\/2 commands succeeded/);
  assert.match(output, /one/);
  assert.match(output, /two/);
});

test('ParallelExecute can fail fast and skip remaining commands', async () => {
  const [tool] = createPerformanceTools();
  if (!tool) {
    throw new Error('ParallelExecute tool is not registered');
  }
  const output = await tool.handler({
    commands: [
      `node -e "console.error('fail'); process.exit(1)"`,
      `node -e "console.log('should skip')"`,
    ],
    timeout: 10000,
    maxConcurrency: 1,
    failFast: true,
  });

  assert.match(output, /Overall: 0\/2 commands succeeded/);
  assert.match(output, /skipped/);
});
