/**
 * Tests for metrics tools
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetricsTools } from '../src/tools/metricsTools.js';
import { MetricsCollector } from '../src/core/observability.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('view_metrics_summary returns message when collector is null', () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const viewSummaryTool = tools.find((t) => t.name === 'view_metrics_summary');
  assert.ok(viewSummaryTool, 'view_metrics_summary tool should exist');

  const result = viewSummaryTool.handler({});
  assert.ok(
    typeof result === 'string' &&
      result.includes('Metrics collection is not enabled'),
    'Should return message about metrics not being enabled',
  );
});

test('view_metrics_summary returns formatted text by default', () => {
  const collector = new MetricsCollector('test-session');

  // Record some test metrics
  collector.recordToolExecution({
    toolName: 'TestTool',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    durationMs: 1000,
    success: true,
    retryCount: 0,
  });

  const tools = createMetricsTools({
    metricsCollector: collector,
    workingDir: process.cwd(),
  });

  const viewSummaryTool = tools.find((t) => t.name === 'view_metrics_summary');
  assert.ok(viewSummaryTool);

  const result = viewSummaryTool.handler({});
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('Session Metrics Summary'));
  assert.ok(result.includes('Tool Execution'));
  assert.ok(result.includes('Total: 1'));
});

test('view_metrics_summary returns JSON when format is json', () => {
  const collector = new MetricsCollector('test-session');

  collector.recordToolExecution({
    toolName: 'TestTool',
    startTime: Date.now() - 500,
    endTime: Date.now(),
    durationMs: 500,
    success: true,
    retryCount: 0,
  });

  const tools = createMetricsTools({
    metricsCollector: collector,
    workingDir: process.cwd(),
  });

  const viewSummaryTool = tools.find((t) => t.name === 'view_metrics_summary');
  assert.ok(viewSummaryTool);

  const result = viewSummaryTool.handler({ format: 'json' });
  assert.ok(typeof result === 'string');

  const parsed = JSON.parse(result);
  assert.ok(parsed.tools);
  assert.strictEqual(parsed.tools.total, 1);
  assert.strictEqual(parsed.tools.successful, 1);
});

test('export_metrics returns error when collector is null', async () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const exportTool = tools.find((t) => t.name === 'export_metrics');
  assert.ok(exportTool);

  const result = await exportTool.handler({});
  assert.ok(
    typeof result === 'string' &&
      result.includes('Metrics collection is not enabled'),
  );
});

test('export_metrics creates file with metrics data', async () => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'metrics-test-'));

  try {
    const collector = new MetricsCollector('test-export-session');

    collector.recordToolExecution({
      toolName: 'TestTool',
      startTime: Date.now() - 200,
      endTime: Date.now(),
      durationMs: 200,
      success: true,
      retryCount: 0,
    });

    const tools = createMetricsTools({
      metricsCollector: collector,
      workingDir: tmpDir,
    });

    const exportTool = tools.find((t) => t.name === 'export_metrics');
    assert.ok(exportTool);

    const outputPath = join(tmpDir, 'test-metrics.json');
    const result = await exportTool.handler({ outputPath });

    assert.ok(typeof result === 'string');
    assert.ok(result.includes('Metrics exported successfully'));
    assert.ok(result.includes(outputPath));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('view_tool_performance returns message when collector is null', () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const perfTool = tools.find((t) => t.name === 'view_tool_performance');
  assert.ok(perfTool);

  const result = perfTool.handler({});
  assert.ok(
    typeof result === 'string' &&
      result.includes('Metrics collection is not enabled'),
  );
});

test('view_tool_performance shows tool statistics', () => {
  const collector = new MetricsCollector('test-perf-session');

  // Record multiple tool executions
  for (let i = 0; i < 5; i++) {
    collector.recordToolExecution({
      toolName: 'FastTool',
      startTime: Date.now() - 100,
      endTime: Date.now(),
      durationMs: 100,
      success: true,
      retryCount: 0,
    });
  }

  for (let i = 0; i < 3; i++) {
    collector.recordToolExecution({
      toolName: 'SlowTool',
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      durationMs: 1000,
      success: true,
      retryCount: 0,
    });
  }

  const tools = createMetricsTools({
    metricsCollector: collector,
    workingDir: process.cwd(),
  });

  const perfTool = tools.find((t) => t.name === 'view_tool_performance');
  assert.ok(perfTool);

  const result = perfTool.handler({ limit: 10, sortBy: 'duration' });
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('Tool Performance Metrics'));
  assert.ok(result.includes('SlowTool')); // Should show slower tool first
  assert.ok(result.includes('FastTool'));
});

test('view_provider_usage returns message when collector is null', () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const providerTool = tools.find((t) => t.name === 'view_provider_usage');
  assert.ok(providerTool);

  const result = providerTool.handler({});
  assert.ok(
    typeof result === 'string' &&
      result.includes('Metrics collection is not enabled'),
  );
});

test('view_provider_usage shows provider statistics', () => {
  const collector = new MetricsCollector('test-provider-session');

  collector.recordProviderCall({
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    startTime: Date.now() - 2000,
    endTime: Date.now(),
    durationMs: 2000,
    success: true,
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    cost: 0.001,
  });

  const tools = createMetricsTools({
    metricsCollector: collector,
    workingDir: process.cwd(),
  });

  const providerTool = tools.find((t) => t.name === 'view_provider_usage');
  assert.ok(providerTool);

  const result = providerTool.handler({ format: 'text' });
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('Provider Usage Statistics'));
  assert.ok(result.includes('Total Calls: 1'));
  assert.ok(result.includes('Total tokens:'));
});

test('clear_metrics requires confirmation', () => {
  const collector = new MetricsCollector('test-clear-session');

  collector.recordToolExecution({
    toolName: 'TestTool',
    startTime: Date.now() - 100,
    endTime: Date.now(),
    durationMs: 100,
    success: true,
    retryCount: 0,
  });

  const tools = createMetricsTools({
    metricsCollector: collector,
    workingDir: process.cwd(),
  });

  const clearTool = tools.find((t) => t.name === 'clear_metrics');
  assert.ok(clearTool);

  // Without confirmation
  const resultWithoutConfirm = clearTool.handler({});
  assert.ok(
    typeof resultWithoutConfirm === 'string' &&
      resultWithoutConfirm.includes('Must set confirm=true'),
  );

  // With confirmation
  const resultWithConfirm = clearTool.handler({ confirm: true });
  assert.ok(typeof resultWithConfirm === 'string');
  assert.ok(resultWithConfirm.includes('Metrics cleared successfully'));

  // Verify metrics were actually cleared
  const summary = collector.getSummary();
  assert.strictEqual(summary.tools.total, 0, 'Metrics should be cleared');
});

test('load_historical_metrics handles missing file', async () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const loadTool = tools.find((t) => t.name === 'load_historical_metrics');
  assert.ok(loadTool);

  const result = await loadTool.handler({ filePath: '/nonexistent/file.json' });
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('not found'));
});

test('all metrics tools exist and have required properties', () => {
  const tools = createMetricsTools({
    metricsCollector: null,
    workingDir: process.cwd(),
  });

  const expectedTools = [
    'view_metrics_summary',
    'export_metrics',
    'view_tool_performance',
    'view_provider_usage',
    'clear_metrics',
    'load_historical_metrics',
  ];

  assert.strictEqual(
    tools.length,
    expectedTools.length,
    `Should have ${expectedTools.length} tools`,
  );

  for (const toolName of expectedTools) {
    const tool = tools.find((t) => t.name === toolName);
    assert.ok(tool, `Tool ${toolName} should exist`);
    assert.ok(tool.description, `Tool ${toolName} should have description`);
    assert.ok(tool.parameters, `Tool ${toolName} should have parameters`);
    assert.ok(
      typeof tool.handler === 'function',
      `Tool ${toolName} should have handler function`,
    );
  }
});
