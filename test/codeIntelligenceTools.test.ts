import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodeIntelligenceTools } from '../src/tools/codeIntelligenceTools.js';

test('AnalyzeCodeComplexity handles files with no functions gracefully', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'code-intel-empty-'));
  const file = join(dir, 'empty.ts');
  writeFileSync(file, 'const value = 42;');

  try {
    const [tool] = createCodeIntelligenceTools();
    if (!tool) {
      throw new Error('AnalyzeCodeComplexity tool is not registered');
    }
    const output = await tool.handler({ path: file });

    assert.match(output, /Files analyzed: 1/);
    assert.match(output, /Functions analyzed: 0/);
    assert.match(output, /No functions found in file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AnalyzeCodeComplexity highlights high-complexity functions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'code-intel-complex-'));
  const file = join(dir, 'complex.ts');
  const content = `
function simple(x: number) {
  return x + 1;
}

function hard(value: number) {
  if (value > 0) {
    for (let i = 0; i < value; i++) {
      if (i % 2 === 0) {
        value += i;
      } else {
        value -= i;
      }
    }
  }
  return value;
}
`;
  writeFileSync(file, content);

  try {
    const [tool] = createCodeIntelligenceTools();
    if (!tool) {
      throw new Error('AnalyzeCodeComplexity tool is not registered');
    }
    const output = await tool.handler({ path: file, threshold: 2 });

    assert.match(output, /High complexity functions: 1/);
    assert.match(output, /hard/);
    assert.match(output, /Hotspots:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
