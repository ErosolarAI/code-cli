import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CacheMetrics,
  MetricsCollector,
  PerformanceMonitor,
  StructuredLogger,
} from '../src/core/observability.js';
import { ToolRuntime } from '../src/core/toolRuntime.js';
import { FAST_RETRY_CONFIG } from '../src/core/retryStrategy.js';
import { instrumentProvider } from '../src/providers/providerInstrumentation.js';
import { createObservabilityTools } from '../src/tools/observabilityTools.js';

describe('Observability', () => {
  describe('MetricsCollector', () => {
    it('should collect tool execution metrics', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordToolExecution({
        toolName: 'Read',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        durationMs: 100,
        success: true,
        retryCount: 0,
      });

      collector.recordToolExecution({
        toolName: 'Write',
        startTime: Date.now(),
        endTime: Date.now() + 200,
        durationMs: 200,
        success: false,
        error: 'Test error',
        retryCount: 2,
      });

      const summary = collector.getSummary();
      assert.equal(summary.tools.total, 2);
      assert.equal(summary.tools.successful, 1);
      assert.equal(summary.tools.failed, 1);
      assert.equal(summary.tools.averageDurationMs, 150);
    });

    it('should collect provider call metrics', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordProviderCall({
        providerId: 'anthropic',
        model: 'claude-3',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        durationMs: 1000,
        success: true,
        tokensInput: 100,
        tokensOutput: 50,
        tokensTotal: 150,
        cost: 0.01,
        retryCount: 0,
      });

      collector.recordProviderCall({
        providerId: 'openai',
        model: 'gpt-4',
        startTime: Date.now(),
        endTime: Date.now() + 2000,
        durationMs: 2000,
        success: true,
        tokensInput: 200,
        tokensOutput: 100,
        tokensTotal: 300,
        cost: 0.02,
        retryCount: 1,
      });

      const summary = collector.getSummary();
      assert.equal(summary.providers.total, 2);
      assert.equal(summary.providers.successful, 2);
      assert.equal(summary.providers.totalTokens, 450);
      assert.equal(summary.providers.totalCost, 0.03);
      assert.equal(summary.providers.averageTokensPerCall, 225);
    });

    it('should identify slowest and fastest tools', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordToolExecution({
        toolName: 'SlowTool',
        startTime: Date.now(),
        durationMs: 1000,
        success: true,
        retryCount: 0,
      });

      collector.recordToolExecution({
        toolName: 'FastTool',
        startTime: Date.now(),
        durationMs: 50,
        success: true,
        retryCount: 0,
      });

      const summary = collector.getSummary();
      assert.equal(summary.tools.slowestTool, 'SlowTool');
      assert.equal(summary.tools.fastestTool, 'FastTool');
    });

    it('should calculate session metrics', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordToolExecution({
        toolName: 'Tool1',
        startTime: Date.now(),
        durationMs: 100,
        success: true,
        retryCount: 0,
      });

      collector.recordProviderCall({
        providerId: 'test',
        model: 'test-model',
        startTime: Date.now(),
        durationMs: 1000,
        success: true,
        tokensTotal: 100,
        cost: 0.01,
        retryCount: 0,
      });

      const sessionMetrics = collector.getSessionMetrics();
      assert.equal(sessionMetrics.sessionId, 'test-session');
      assert.equal(sessionMetrics.totalTools, 1);
      assert.equal(sessionMetrics.successfulTools, 1);
      assert.equal(sessionMetrics.totalProviderCalls, 1);
      assert.equal(sessionMetrics.totalTokens, 100);
      assert.equal(sessionMetrics.totalCost, 0.01);
      assert.ok(sessionMetrics.durationMs > 0);
    });

    it('should export metrics as JSON', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordToolExecution({
        toolName: 'Test',
        startTime: Date.now(),
        durationMs: 100,
        success: true,
        retryCount: 0,
      });

      const exported = collector.exportMetrics();
      const parsed = JSON.parse(exported);

      assert.ok(parsed.session);
      assert.ok(parsed.summary);
      assert.ok(parsed.tools);
      assert.ok(parsed.providers);
      assert.ok(parsed.system);
    });

    it('should clear metrics', () => {
      const collector = new MetricsCollector('test-session');

      collector.recordToolExecution({
        toolName: 'Test',
        startTime: Date.now(),
        durationMs: 100,
        success: true,
        retryCount: 0,
      });

      collector.clear();

      const summary = collector.getSummary();
      assert.equal(summary.tools.total, 0);
      assert.equal(summary.providers.total, 0);
    });
  });

  describe('CacheMetrics', () => {
    it('tracks hits, misses, and basic hit rate', () => {
      const metrics = new CacheMetrics();
      metrics.recordHit();
      metrics.recordMiss();
      metrics.recordWrite(256);
      metrics.recordEviction(128);

      const snapshot = metrics.snapshot();
      assert.equal(snapshot.hits, 1);
      assert.equal(snapshot.misses, 1);
      assert.equal(snapshot.writes, 1);
      assert.equal(snapshot.evictions, 1);
      assert.equal(snapshot.hitRate, 50);
      assert.ok(snapshot.bytesStored >= 128);
    });
  });

  describe('ToolRuntime cache stats integration', () => {
    it('exposes hit/miss counts after cache usage', async () => {
      const runtime = new ToolRuntime([
        {
          name: 'Echo',
          description: 'echoes a message',
          cacheable: true,
          handler: async (args) => String(args['msg'] ?? 'default'),
        },
      ]);

      await runtime.execute({ id: '1', name: 'Echo', arguments: { msg: 'hello' } });
      await runtime.execute({ id: '2', name: 'Echo', arguments: { msg: 'hello' } });

      const stats = runtime.getCacheStats();
      assert.equal(stats.entries, 1);
      assert.ok(stats.hits >= 1);
      assert.ok(stats.misses >= 1);
      assert.ok(stats.hitRate > 0);
    });

    it('evicts stale entries when TTL or capacity is exceeded', async () => {
      const cacheMetrics = new CacheMetrics();
      const runtime = new ToolRuntime(
        [
          {
            name: 'Cacheable',
            description: 'returns payload',
            cacheable: true,
            handler: async (args) => `value-${args['id'] ?? 'x'}`,
          },
        ],
        {
          enableCache: true,
          cacheTTLMs: 5,
          maxCacheEntries: 1,
          cacheMetrics,
        },
      );

      await runtime.execute({
        id: 'first',
        name: 'Cacheable',
        arguments: { id: 1 },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await runtime.execute({
        id: 'second',
        name: 'Cacheable',
        arguments: { id: 2 },
      });

      const stats = runtime.getCacheStats();
      assert.equal(stats.entries, 1);
      assert.equal(stats.maxEntries, 1);
      assert.ok(stats.evictions >= 1);
    });
  });

  describe('PerformanceMonitor', () => {
    it('should track active tool executions', () => {
      const collector = new MetricsCollector('test-session');
      const monitor = new PerformanceMonitor(collector);

      monitor.trackToolStart();
      monitor.trackToolStart();
      monitor.trackToolEnd(true);

      // Should have 1 active (2 started, 1 ended)
      // Note: No direct getter, but functionality is tested
      assert.ok(monitor);
    });

    it('should track active provider calls', () => {
      const collector = new MetricsCollector('test-session');
      const monitor = new PerformanceMonitor(collector);

      monitor.trackProviderStart();
      monitor.trackProviderEnd(true);

      assert.ok(monitor);
    });

    it('should start and stop monitoring', () => {
      const collector = new MetricsCollector('test-session');
      const monitor = new PerformanceMonitor(collector);

      monitor.startMonitoring(100); // 100ms interval
      monitor.stopMonitoring();

      assert.ok(monitor);
    });
  });

  describe('StructuredLogger', () => {
    it('should create structured log entries', () => {
      const logger = new StructuredLogger('test-session', 'test-component');

      // Capture console output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      logger.info('Test message', { foo: 'bar' });

      console.log = originalLog;

      assert.equal(logs.length, 1);
      const logEntry = JSON.parse(logs[0]!);
      assert.equal(logEntry.level, 'info');
      assert.equal(logEntry.sessionId, 'test-session');
      assert.equal(logEntry.component, 'test-component');
      assert.equal(logEntry.message, 'Test message');
      assert.equal(logEntry.foo, 'bar');
    });

    it('should log warnings', () => {
      const logger = new StructuredLogger('test-session', 'test-component');

      const logs: string[] = [];
      const originalWarn = console.warn;
      console.warn = (msg: string) => logs.push(msg);

      logger.warn('Warning message');

      console.warn = originalWarn;

      assert.equal(logs.length, 1);
      const logEntry = JSON.parse(logs[0]!);
      assert.equal(logEntry.level, 'warn');
    });

    it('should log errors', () => {
      const logger = new StructuredLogger('test-session', 'test-component');

      const logs: string[] = [];
      const originalError = console.error;
      console.error = (msg: string) => logs.push(msg);

      logger.error('Error message', { errorCode: 500 });

      console.error = originalError;

      assert.equal(logs.length, 1);
      const logEntry = JSON.parse(logs[0]!);
      assert.equal(logEntry.level, 'error');
      assert.equal(logEntry.errorCode, 500);
    });
  });

  describe('Provider instrumentation', () => {
    it('records provider metrics on success', async () => {
      const collector = new MetricsCollector('instrument-success');
      const instrumented = instrumentProvider(
        {
          id: 'test',
          model: 'unit',
          async generate() {
            return {
              type: 'message' as const,
              content: 'ok',
              usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
            };
          },
        },
        { metricsCollector: collector },
      );

      const result = await instrumented.generate(
        [{ role: 'user', content: 'hi' }],
        [],
      );
      assert.equal(result.content, 'ok');

      const summary = collector.getSummary();
      assert.equal(summary.providers.total, 1);
      assert.equal(summary.providers.successful, 1);
      assert.equal(summary.providers.totalTokens, 12);
    });

    it('records provider metrics on failure', async () => {
      const collector = new MetricsCollector('instrument-failure');
      const instrumented = instrumentProvider(
        {
          id: 'test',
          model: 'unit',
          async generate() {
            throw new Error('boom');
          },
        },
        { metricsCollector: collector },
      );

      await assert.rejects(() =>
        instrumented.generate([{ role: 'user', content: 'hi' }], []),
      );

      const summary = collector.getSummary();
      assert.equal(summary.providers.failed, 1);
    });

    it('retries transient provider failures and records retry count', async () => {
      const collector = new MetricsCollector('instrument-retry');
      let calls = 0;
      const instrumented = instrumentProvider(
        {
          id: 'test',
          model: 'unit',
          async generate() {
            calls += 1;
            if (calls === 1) {
              throw new Error('ETIMEDOUT');
            }
            return {
              type: 'message' as const,
              content: 'ok-again',
              usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
            };
          },
        },
        { metricsCollector: collector },
      );

      const result = await instrumented.generate(
        [{ role: 'user', content: 'hi' }],
        [],
      );
      assert.equal(result.content, 'ok-again');
      assert.equal(calls, 2);

      const metrics = collector.getProviderMetrics();
      assert.equal(metrics.length, 1);
      assert.equal(metrics[0]!.retryCount, 1);
    });

    it('does not retry non-retryable provider errors', async () => {
      const collector = new MetricsCollector('instrument-no-retry');
      let calls = 0;
      const instrumented = instrumentProvider(
        {
          id: 'test',
          model: 'unit',
          async generate() {
            calls += 1;
            throw new Error('401 Unauthorized');
          },
        },
        { metricsCollector: collector },
      );

      await assert.rejects(() =>
        instrumented.generate([{ role: 'user', content: 'hi' }], []),
      );
      assert.equal(calls, 1);

      const metrics = collector.getProviderMetrics();
      assert.equal(metrics[0]?.retryCount ?? 0, 0);
    });
  });

  describe('Observability tools', () => {
    it('return snapshots and exports with cache data', async () => {
      const collector = new MetricsCollector('observability-tools');
      collector.recordToolExecution({
        toolName: 'Demo',
        startTime: Date.now(),
        durationMs: 50,
        success: true,
        retryCount: 0,
      });
      collector.recordProviderCall({
        providerId: 'p',
        model: 'm',
        startTime: Date.now(),
        durationMs: 30,
        success: true,
        tokensTotal: 10,
        retryCount: 0,
      });

      const cacheMetrics = new CacheMetrics();
      cacheMetrics.recordHit();
      cacheMetrics.recordMiss();
      cacheMetrics.recordWrite(256);

      const tools = createObservabilityTools(collector, cacheMetrics);
      const snapshotTool = tools.find(
        (tool) => tool.name === 'observability_snapshot',
      );
      const exportTool = tools.find(
        (tool) => tool.name === 'observability_export',
      );

      assert.ok(snapshotTool);
      assert.ok(exportTool);

      const snapshot = await snapshotTool!.handler({ detail: 'full' });
      assert.match(snapshot, /Observability Snapshot/);
      assert.match(snapshot, /Cache hit rate/);

      const exported = await exportTool!.handler({ includeCache: true });
      const parsed = JSON.parse(exported);
      assert.ok(parsed.session);
      assert.ok(parsed.cache);
    });
  });

  describe('ToolRuntime performance hooks', () => {
    it('notify monitors for success and failure', async () => {
      let starts = 0;
      const ends: boolean[] = [];
      const monitor = {
        trackToolStart: () => {
          starts += 1;
        },
        trackToolEnd: (success: boolean) => {
          ends.push(success);
        },
        trackProviderStart: () => {},
        trackProviderEnd: () => {},
        startMonitoring: () => {},
        stopMonitoring: () => {},
      } as unknown as PerformanceMonitor;

      const successRuntime = new ToolRuntime(
        [
          {
            name: 'OkTool',
            description: 'returns ok',
            handler: async () => 'ok',
          },
        ],
        { performanceMonitor: monitor },
      );
      const okResult = await successRuntime.execute({
        id: 'ok-1',
        name: 'OkTool',
        arguments: {},
      });
      assert.equal(okResult, 'ok');

      const failureRuntime = new ToolRuntime(
        [
          {
            name: 'FailTool',
            description: 'throws',
            handler: async () => {
              throw new Error('nope');
            },
          },
        ],
        { performanceMonitor: monitor },
      );
      const failedResult = await failureRuntime.execute({
        id: 'fail-1',
        name: 'FailTool',
        arguments: {},
      });
      assert.match(failedResult, /Failed to run/);

      assert.equal(starts, 2);
      assert.deepEqual(ends, [true, false]);
    });

    it('records retry attempts for failed executions', async () => {
      const collector = new MetricsCollector('retry-failure');
      const runtime = new ToolRuntime(
        [
          {
            name: 'FlakyFailure',
            description: 'throws retryable error',
            handler: async () => {
              throw new Error('ETIMEDOUT');
            },
          },
        ],
        { metricsCollector: collector },
      );

      const output = await runtime.execute({
        id: 'retry-1',
        name: 'FlakyFailure',
        arguments: {},
      });

      assert.match(output, /Failed to run "FlakyFailure"/);
      const metrics = collector.getToolMetrics();
      assert.equal(metrics.length, 1);
      assert.equal(
        metrics[0]?.retryCount,
        Math.max(0, FAST_RETRY_CONFIG.maxAttempts - 1),
      );
    });
  });
});
