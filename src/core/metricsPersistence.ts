import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveDataDir } from './brand.js';
import type { MetricsCollector, MetricsSummary } from './observability.js';

const DEFAULT_MAX_SNAPSHOTS = 20;

export interface MetricsPersistenceOptions {
  directory?: string;
  includeRawData?: boolean;
  maxSnapshots?: number;
}

export interface MetricsSnapshotInfo {
  path: string;
  savedAt: string;
  sessionId: string;
  summary: MetricsSummary;
}

export interface MetricsSnapshotMetadata {
  path: string;
  savedAt: string;
  sessionId?: string;
}

export interface LoadedMetricsSnapshot extends MetricsSnapshotMetadata {
  summary?: MetricsSummary;
}

export function resolveMetricsDirectory(directory?: string): string {
  return directory ?? join(resolveDataDir(), 'metrics');
}

/**
  Persist the current metrics snapshot to disk and prune old snapshots.
 */
export function persistMetricsSnapshot(
  collector: MetricsCollector,
  options: MetricsPersistenceOptions = {},
): MetricsSnapshotInfo {
  const metricsDir = resolveMetricsDirectory(options.directory);
  mkdirSync(metricsDir, { recursive: true });

  const savedAt = new Date().toISOString();
  const sessionId = collector.getSessionId();
  const timestamp = savedAt.replace(/[:.]/g, '-');
  const fileName = `session-${sessionId}-${timestamp}.json`;
  const targetPath = join(metricsDir, fileName);
  const summary = collector.getSummary();

  const payload =
    options.includeRawData === false
      ? {
          savedAt,
          session: collector.getSessionMetrics(),
          summary,
        }
      : {
          savedAt,
          ...(JSON.parse(collector.exportMetrics()) as Record<
            string,
            unknown
          >),
        };

  writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
  pruneOldSnapshots(metricsDir, options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS);

  return {
    path: targetPath,
    savedAt,
    sessionId,
    summary,
  };
}

export function listMetricsSnapshots(
  directory?: string,
): MetricsSnapshotMetadata[] {
  const metricsDir = resolveMetricsDirectory(directory);
  if (!existsSync(metricsDir)) {
    return [];
  }

  const entries = readdirSync(metricsDir)
    .filter((name) => name.endsWith('.json'))
    .map((file) => {
      const fullPath = join(metricsDir, file);
      const stats = statSync(fullPath);
      const savedAt = extractSavedAt(fullPath, stats.mtime.toISOString());
      const sessionId = extractSessionId(file);
      return {
        path: fullPath,
        savedAt,
        sessionId,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ mtimeMs, ...entry }) => entry);

  return entries;
}

export function loadLatestMetricsSnapshot(
  directory?: string,
): LoadedMetricsSnapshot | null {
  const entries = listMetricsSnapshots(directory);
  if (!entries.length) {
    return null;
  }

  for (const entry of entries) {
    try {
      const parsed = parseMetricsFile(entry.path);
      if (!parsed) {
        continue;
      }
      const summary = coerceMetricsSummary(parsed['summary']);
      const savedAtValue = parsed['savedAt'];
      const savedAt =
        typeof savedAtValue === 'string' ? savedAtValue : entry.savedAt;
      const sessionId = pickSessionId(parsed['session']) ?? entry.sessionId;
      return {
        path: entry.path,
        savedAt,
        sessionId,
        summary,
      };
    } catch {
      // Try the next snapshot
    }
  }

  return null;
}

function pruneOldSnapshots(dir: string, maxSnapshots: number): void {
  if (maxSnapshots <= 0 || !existsSync(dir)) {
    return;
  }

  const snapshots = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((file) => {
      const fullPath = join(dir, file);
      const stats = statSync(fullPath);
      return {
        path: fullPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const stale = snapshots.slice(maxSnapshots);
  for (const entry of stale) {
    try {
      rmSync(entry.path, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function extractSavedAt(path: string, fallback: string): string {
  try {
    const parsed = parseMetricsFile(path);
    if (parsed && typeof parsed['savedAt'] === 'string') {
      return parsed['savedAt'];
    }
  } catch {
    // ignore
  }
  return fallback;
}

function extractSessionId(fileName: string): string | undefined {
  const match = fileName.match(/^session-([^-]+)-/);
  return match?.[1];
}

function parseMetricsFile(
  path: string,
): Record<string, unknown> | null {
  const content = readFileSync(path, 'utf8');
  const parsed = JSON.parse(content);
  return isRecord(parsed) ? parsed : null;
}

function pickSessionId(value: unknown): string | undefined {
  const record = isRecord(value) ? value : null;
  const candidate = record?.['sessionId'];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate
    : undefined;
}

function coerceMetricsSummary(value: unknown): MetricsSummary | undefined {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return undefined;
  }

  const tools = isRecord(record['tools']) ? record['tools'] : null;
  const providers = isRecord(record['providers']) ? record['providers'] : null;
  const system = isRecord(record['system']) ? record['system'] : null;

  if (!tools || !providers || !system) {
    return undefined;
  }

  const numberOrZero = (input: unknown): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : 0;

  const summary: MetricsSummary = {
    tools: {
      total: numberOrZero(tools['total']),
      successful: numberOrZero(tools['successful']),
      failed: numberOrZero(tools['failed']),
      averageDurationMs: numberOrZero(tools['averageDurationMs']),
      slowestTool:
        typeof tools['slowestTool'] === 'string'
          ? tools['slowestTool']
          : undefined,
      fastestTool:
        typeof tools['fastestTool'] === 'string'
          ? tools['fastestTool']
          : undefined,
    },
    providers: {
      total: numberOrZero(providers['total']),
      successful: numberOrZero(providers['successful']),
      failed: numberOrZero(providers['failed']),
      averageDurationMs: numberOrZero(providers['averageDurationMs']),
      totalTokens: numberOrZero(providers['totalTokens']),
      totalCost: numberOrZero(providers['totalCost']),
      averageTokensPerCall: numberOrZero(providers['averageTokensPerCall']),
    },
    system: {
      uptime: numberOrZero(system['uptime']),
      peakMemoryMb: numberOrZero(system['peakMemoryMb']),
      averageMemoryMb: numberOrZero(system['averageMemoryMb']),
      cacheHitRate: numberOrZero(system['cacheHitRate']),
      errorRate: numberOrZero(system['errorRate']),
    },
  };

  return summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
