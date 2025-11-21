import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MetricsCollector } from '../src/core/observability.js';
import {
  listMetricsSnapshots,
  loadLatestMetricsSnapshot,
  persistMetricsSnapshot,
} from '../src/core/metricsPersistence.js';

test('persistMetricsSnapshot writes snapshot with summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'metrics-persist-'));
  try {
    const collector = new MetricsCollector('snapshot-session');
    collector.recordToolExecution({
      toolName: 'Demo',
      startTime: Date.now(),
      durationMs: 10,
      success: true,
      retryCount: 0,
    });

    const snapshot = persistMetricsSnapshot(collector, {
      directory: dir,
      includeRawData: true,
    });

    assert.ok(snapshot.path.startsWith(dir));
    assert.equal(snapshot.summary.tools.total, 1);

    const loaded = loadLatestMetricsSnapshot(dir);
    assert.ok(loaded);
    assert.equal(loaded?.summary?.tools.total, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('persistMetricsSnapshot prunes old snapshots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'metrics-prune-'));
  try {
    const collector = new MetricsCollector('prune-session');
    collector.recordToolExecution({
      toolName: 'Demo',
      startTime: Date.now(),
      durationMs: 5,
      success: true,
      retryCount: 0,
    });

    for (let index = 0; index < 5; index += 1) {
      persistMetricsSnapshot(collector, {
        directory: dir,
        includeRawData: false,
        maxSnapshots: 3,
      });
      // Ensure unique timestamps across files
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const snapshots = listMetricsSnapshots(dir);
    assert.ok(
      snapshots.length <= 3,
      `expected at most 3 snapshots, found ${snapshots.length}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadLatestMetricsSnapshot returns newest snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'metrics-latest-'));
  try {
    const collector = new MetricsCollector('load-session');
    collector.recordToolExecution({
      toolName: 'First',
      startTime: Date.now(),
      durationMs: 5,
      success: true,
      retryCount: 0,
    });

    persistMetricsSnapshot(collector, {
      directory: dir,
      includeRawData: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    collector.recordToolExecution({
      toolName: 'Second',
      startTime: Date.now(),
      durationMs: 7,
      success: true,
      retryCount: 0,
    });

    persistMetricsSnapshot(collector, {
      directory: dir,
      includeRawData: false,
    });

    const latest = loadLatestMetricsSnapshot(dir);
    assert.ok(latest);
    assert.equal(latest?.summary?.tools.total, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
