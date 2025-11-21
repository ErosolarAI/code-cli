/**
 * Integration Tests
 *
 * Tests for critical end-to-end workflows and component integration.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRuntime, type ToolDefinition } from '../src/core/toolRuntime.js';
import {
  MetricsCollector,
  PerformanceMonitor,
  getSharedCacheMetrics,
} from '../src/core/observability.js';
import { TimelineRecorder } from '../src/core/timeline.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../src/core/retryStrategy.js';
import { classifyError } from '../src/core/errorClassification.js';

test('ToolRuntime integrates with MetricsCollector correctly', async () => {
  const collector = new MetricsCollector('integration-test');
  const timeline = new TimelineRecorder();

  const testTool: ToolDefinition = {
    name: 'TestTool',
    description: 'A test tool for integration testing',
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'Test result';
    },
  };

  const runtime = new ToolRuntime([testTool], {
    metricsCollector: collector,
    timeline,
    enableCache: true,
  });

  // Execute tool
  const result = await runtime.execute({
    id: 'test-call-1',
    name: 'TestTool',
    arguments: {},
  });

  assert.ok(result.includes('Test result'), 'Tool should execute successfully');

  // Verify metrics were collected
  const summary = collector.getSummary();
  assert.strictEqual(summary.tools.total, 1, 'Should record one tool execution');
  assert.strictEqual(
    summary.tools.successful,
    1,
    'Should record successful execution',
  );
  assert.ok(
    summary.tools.averageDurationMs >= 10,
    'Should record execution time',
  );

  // Verify timeline was updated
  const events = timeline.list();
  assert.ok(events.length >= 2, 'Should have at least start and end events');
  assert.ok(
    events.some((e) => e.status === 'started'),
    'Should have started event',
  );
  assert.ok(
    events.some((e) => e.status === 'succeeded'),
    'Should have succeeded event',
  );
});

test('ToolRuntime caching works with cache metrics', async () => {
  const collector = new MetricsCollector('cache-test');
  const cacheMetrics = getSharedCacheMetrics();

  const callCount = { count: 0 };
  const cacheableTool: ToolDefinition = {
    name: 'Read',
    description: 'Cacheable tool',
    cacheable: true,
    handler: async () => {
      callCount.count++;
      return `Result ${callCount.count}`;
    },
  };

  const runtime = new ToolRuntime([cacheableTool], {
    metricsCollector: collector,
    cacheMetrics,
    enableCache: true,
    cacheTTLMs: 5000,
  });

  // First call - should execute handler
  const result1 = await runtime.execute({
    id: 'call-1',
    name: 'Read',
    arguments: { test: 'same' },
  });
  assert.strictEqual(callCount.count, 1, 'Handler should be called once');
  assert.ok(result1.includes('Result 1'), 'Should get first result');

  // Second call with same arguments - should hit cache
  const result2 = await runtime.execute({
    id: 'call-2',
    name: 'Read',
    arguments: { test: 'same' },
  });
  assert.strictEqual(callCount.count, 1, 'Handler should not be called again');
  assert.strictEqual(
    result2,
    result1,
    'Should get cached result (same as first)',
  );

  // Verify cache metrics
  const snapshot = cacheMetrics.snapshot();
  assert.ok(snapshot.hits >= 1, 'Should record at least one cache hit');
  assert.ok(snapshot.hitRate > 0, 'Hit rate should be positive');
});

test('Error recovery integrates with retry strategy and classification', async () => {
  let attempts = 0;
  const maxAttempts = 3;

  const retryableError = new Error('ECONNREFUSED');
  const nonRetryableError = new Error('Authentication failed');

  // Test retryable error
  const retryableOperation = async () => {
    attempts++;
    if (attempts < maxAttempts) {
      throw retryableError;
    }
    return 'Success after retries';
  };

  const result = await withRetry(
    retryableOperation,
    (error: Error) => {
      const classification = classifyError(error);
      return classification.isRetryable;
    },
    DEFAULT_RETRY_CONFIG,
  );

  assert.ok(result.success, 'Should succeed after retries');
  assert.strictEqual(result.attempts, maxAttempts, 'Should retry correct times');
  assert.ok(result.result?.includes('Success'), 'Should return success result');

  // Test non-retryable error
  attempts = 0;
  const nonRetryableOperation = async () => {
    attempts++;
    throw nonRetryableError;
  };

  const result2 = await withRetry(
    nonRetryableOperation,
    (error: Error) => {
      const classification = classifyError(error);
      return classification.isRetryable;
    },
    DEFAULT_RETRY_CONFIG,
  );

  assert.ok(!result2.success, 'Should fail without retry');
  assert.strictEqual(attempts, 1, 'Should not retry non-retryable errors');
});

test('PerformanceMonitor tracks system metrics correctly', async () => {
  const monitor = new PerformanceMonitor();

  monitor.startMonitoring();

  // Simulate some operations
  monitor.trackToolStart();
  await new Promise((resolve) => setTimeout(resolve, 50));
  monitor.trackToolEnd(true);

  monitor.trackProviderStart();
  await new Promise((resolve) => setTimeout(resolve, 100));
  monitor.trackProviderEnd(true);

  // Get snapshot
  const snapshot = monitor.snapshot();

  assert.ok(snapshot.activeTools === 0, 'Should have no active tools');
  assert.ok(snapshot.activeProviders === 0, 'Should have no active providers');
  assert.ok(
    snapshot.averageMemoryMb > 0,
    'Should track memory usage',
  );
  assert.ok(snapshot.uptime >= 150, 'Should track uptime');

  monitor.stopMonitoring();
});

test('Full workflow: Tool execution with retry, metrics, and caching', async () => {
  const collector = new MetricsCollector('full-workflow-test');
  const timeline = new TimelineRecorder();
  const cacheMetrics = getSharedCacheMetrics();

  let executionCount = 0;
  const unreliableTool: ToolDefinition = {
    name: 'UnreliableRead',
    description: 'Tool that fails occasionally',
    cacheable: true,
    handler: async (args) => {
      executionCount++;

      // Fail on first attempt (simulating transient error)
      if (executionCount === 1) {
        throw new Error('ETIMEDOUT');
      }

      return `Data for ${args['key'] || 'unknown'}`;
    },
  };

  const runtime = new ToolRuntime([unreliableTool], {
    metricsCollector: collector,
    timeline,
    cacheMetrics,
    enableCache: true,
  });

  // Execute tool (will retry and succeed)
  const result = await runtime.execute({
    id: 'workflow-1',
    name: 'UnreliableRead',
    arguments: { key: 'test-key' },
  });

  assert.ok(
    result.includes('Data for test-key'),
    'Should succeed after retry',
  );
  assert.ok(executionCount >= 2, 'Should have retried after failure');

  // Verify metrics captured the retry
  const summary = collector.getSummary();
  assert.strictEqual(summary.tools.total, 1, 'Should record one tool execution');
  assert.strictEqual(
    summary.tools.successful,
    1,
    'Should record as successful',
  );

  // Verify timeline shows retry events
  const events = timeline.list();
  const retryEvents = events.filter((e) => e.status === 'retrying');
  assert.ok(retryEvents.length > 0, 'Should have retry events in timeline');

  // Execute again with same arguments - should hit cache
  executionCount = 0; // Reset counter
  const cachedResult = await runtime.execute({
    id: 'workflow-2',
    name: 'UnreliableRead',
    arguments: { key: 'test-key' },
  });

  assert.strictEqual(
    cachedResult,
    result,
    'Should return cached result',
  );
  assert.strictEqual(
    executionCount,
    0,
    'Handler should not execute (cache hit)',
  );

  // Verify cache hit was recorded
  const cacheSnapshot = cacheMetrics.snapshot();
  assert.ok(cacheSnapshot.hits > 0, 'Should record cache hit');
});

test('MetricsCollector aggregates data correctly', () => {
  const collector = new MetricsCollector('aggregation-test');

  // Record multiple tool executions
  for (let i = 0; i < 10; i++) {
    collector.recordToolExecution({
      toolName: 'Tool' + (i % 3), // 3 different tools
      startTime: Date.now() - 100,
      endTime: Date.now(),
      durationMs: 100 + i * 10,
      success: i % 5 !== 0, // 80% success rate
      retryCount: i % 4 === 0 ? 1 : 0,
    });
  }

  // Record provider calls
  for (let i = 0; i < 5; i++) {
    collector.recordProviderCall({
      providerId: 'anthropic',
      model: 'claude-3-sonnet',
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      durationMs: 1000 + i * 100,
      success: true,
      tokensInput: 100 + i * 10,
      tokensOutput: 50 + i * 5,
      tokensTotal: 150 + i * 15,
      cost: 0.001 + i * 0.0001,
      retryCount: 0,
    });
  }

  const summary = collector.getSummary();

  // Verify tool aggregation
  assert.strictEqual(summary.tools.total, 10, 'Should record 10 tool executions');
  assert.strictEqual(summary.tools.successful, 8, 'Should record 8 successful (80%)');
  assert.strictEqual(summary.tools.failed, 2, 'Should record 2 failed (20%)');

  // Verify provider aggregation
  assert.strictEqual(summary.providers.total, 5, 'Should record 5 provider calls');
  assert.ok(summary.providers.totalTokens > 0, 'Should aggregate token usage');
  assert.ok(summary.providers.totalCost > 0, 'Should aggregate costs');
  assert.ok(
    summary.providers.averageTokensPerCall > 0,
    'Should calculate average tokens',
  );

  // Verify system metrics
  assert.ok(summary.system.uptime > 0, 'Should track uptime');
  assert.ok(summary.system.peakMemoryMb > 0, 'Should track memory');
});

test('Timeline recorder maintains event order and structure', () => {
  const timeline = new TimelineRecorder();

  // Record various events
  timeline.record({
    action: 'tool_execution',
    status: 'started',
    tool: 'TestTool',
    message: 'Starting execution',
  });

  timeline.record({
    action: 'tool_execution',
    status: 'retrying',
    tool: 'TestTool',
    message: 'Retry attempt 1',
  });

  timeline.record({
    action: 'tool_execution',
    status: 'succeeded',
    tool: 'TestTool',
    message: 'Completed successfully',
  });

  const events = timeline.list();
  assert.strictEqual(events.length, 3, 'Should have 3 events');

  // Verify chronological order
  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1]!.timestamp).getTime();
    const curr = new Date(events[i]!.timestamp).getTime();
    assert.ok(
      curr >= prev,
      'Events should be in chronological order',
    );
  }

  // Verify all events have required fields
  for (const event of events) {
    assert.ok(event.eventId, 'Event should have ID');
    assert.ok(event.timestamp, 'Event should have timestamp');
    assert.ok(event.action, 'Event should have action');
    assert.ok(event.status, 'Event should have status');
  }

  // Test latest() method
  const latest = timeline.latest(2);
  assert.strictEqual(latest.length, 2, 'Should return last 2 events');
  assert.strictEqual(
    latest[0]!.status,
    'retrying',
    'Should be second-to-last event',
  );
  assert.strictEqual(
    latest[1]!.status,
    'succeeded',
    'Should be last event',
  );
});
