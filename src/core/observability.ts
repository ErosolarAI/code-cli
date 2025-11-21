/**
 * Observability & Metrics Module
 *
 * Comprehensive monitoring system for tracking performance, usage,
 * and health metrics for production AI agent operations.
 *
 * Implements 2025 best practices for observability and telemetry.
 */

import { randomUUID } from 'node:crypto';
import { memoryUsage } from 'node:process';

export interface CacheMetricsSnapshot {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  bytesStored: number;
  hitRate: number;
}

/**
 * Lightweight metrics tracker for cache usage across the runtime.
 */
export class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;
  private bytesStored = 0;

  recordHit(): void {
    this.hits += 1;
  }

  recordMiss(): void {
    this.misses += 1;
  }

  recordWrite(bytes: number): void {
    this.writes += 1;
    if (Number.isFinite(bytes) && bytes > 0) {
      this.bytesStored += bytes;
    }
  }

  recordEviction(bytes?: number): void {
    this.evictions += 1;
    if (typeof bytes === 'number' && Number.isFinite(bytes) && bytes > 0) {
      this.bytesStored = Math.max(0, this.bytesStored - bytes);
    }
  }

  getHitRate(): number {
    const lookups = this.hits + this.misses;
    return lookups > 0 ? (this.hits / lookups) * 100 : 0;
  }

  snapshot(): CacheMetricsSnapshot {
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      bytesStored: this.bytesStored,
      hitRate: this.getHitRate(),
    };
  }
}

const sharedCacheMetrics = new CacheMetrics();

export function getSharedCacheMetrics(): CacheMetrics {
  return sharedCacheMetrics;
}

export interface ToolExecutionMetrics {
  toolName: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  retryCount: number;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
}

export interface ProviderMetrics {
  /** Canonical provider identifier (accepts providerId or provider) */
  provider?: string;
  providerId?: string;
  model: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  /** Token accounting (accepts tokensInput/inputTokens) */
  tokensInput?: number;
  inputTokens?: number;
  /** Token accounting (accepts tokensOutput/outputTokens) */
  tokensOutput?: number;
  outputTokens?: number;
  /** Total tokens (accepts tokensTotal/totalTokens) */
  tokensTotal?: number;
  totalTokens?: number;
  cost?: number;
  retryCount?: number;
}

interface NormalizedProviderMetrics {
  provider: string;
  providerId?: string;
  model: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  success: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  retryCount: number;
}

export interface SessionMetrics {
  sessionId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  totalTools: number;
  successfulTools: number;
  failedTools: number;
  totalProviderCalls: number;
  totalTokens: number;
  totalCost: number;
}

export interface SystemMetrics {
  timestamp: number;
  memoryUsageMb: number;
  cpuUsagePercent?: number;
  activeToolExecutions: number;
  activeProviderCalls: number;
  cacheHitRate: number;
  errorRate: number;
}

export interface MetricsSummary {
  tools: {
    total: number;
    successful: number;
    failed: number;
    averageDurationMs: number;
    slowestTool?: string;
    fastestTool?: string;
  };
  providers: {
    total: number;
    successful: number;
    failed: number;
    averageDurationMs: number;
    totalTokens: number;
    totalCost: number;
    averageTokensPerCall: number;
  };
  system: {
    uptime: number;
    peakMemoryMb: number;
    averageMemoryMb: number;
    cacheHitRate: number;
    errorRate: number;
  };
}

export interface PerformanceSnapshot {
  uptime: number;
  activeTools: number;
  activeProviders: number;
  averageMemoryMb: number;
  peakMemoryMb: number;
  cacheHitRate: number;
  errorRate: number;
}

/**
 * Central metrics collector for all observability data
 */
export class MetricsCollector {
  private toolMetrics: ToolExecutionMetrics[] = [];
  private providerMetrics: NormalizedProviderMetrics[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private sessionStartTime: number;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionStartTime = Date.now();
  }

  /**
   * Expose the stable session identifier for persistence/diagnostics.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Return a shallow copy of collected tool metrics.
   */
  getToolMetrics(): ToolExecutionMetrics[] {
    return [...this.toolMetrics];
  }

  /**
   * Return a shallow copy of collected provider metrics.
   */
  getProviderMetrics(): ProviderMetrics[] {
    return [...this.providerMetrics];
  }

  /**
   * Return a shallow copy of collected system metrics.
   */
  getSystemMetrics(): SystemMetrics[] {
    return [...this.systemMetrics];
  }

  /**
   * Record tool execution metrics
   */
  recordToolExecution(metrics: ToolExecutionMetrics): void {
    this.toolMetrics.push(metrics);
  }

  /**
   * Record provider call metrics
   */
  recordProviderCall(metrics: ProviderMetrics): void {
    this.providerMetrics.push(normalizeProviderMetrics(metrics));
  }

  /**
   * Record system metrics snapshot
   */
  recordSystemMetrics(metrics: SystemMetrics): void {
    this.systemMetrics.push(metrics);
  }

  /**
   * Get comprehensive metrics summary
   */
  getSummary(): MetricsSummary {
    return {
      tools: this.getToolsSummary(),
      providers: this.getProvidersSummary(),
      system: this.getSystemSummary(),
    };
  }

  private getToolsSummary() {
    const total = this.toolMetrics.length;
    const successful = this.toolMetrics.filter(m => m.success).length;
    const failed = total - successful;

    const durations = this.toolMetrics
      .filter(m => m.durationMs !== undefined)
      .map(m => m.durationMs!);

    const averageDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    // Find slowest and fastest tools
    const toolsByDuration = this.toolMetrics
      .filter(m => m.durationMs !== undefined)
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));

    return {
      total,
      successful,
      failed,
      averageDurationMs,
      slowestTool: toolsByDuration[0]?.toolName,
      fastestTool: toolsByDuration[toolsByDuration.length - 1]?.toolName,
    };
  }

  private getProvidersSummary() {
    const total = this.providerMetrics.length;
    const successful = this.providerMetrics.filter(m => m.success).length;
    const failed = total - successful;

    const durations = this.providerMetrics
      .filter(m => m.durationMs !== undefined)
      .map(m => m.durationMs!);

    const averageDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const totalTokens = this.providerMetrics
      .filter(m => m.totalTokens !== undefined)
      .reduce((sum, m) => sum + (m.totalTokens ?? 0), 0);

    const totalCost = this.providerMetrics
      .filter(m => m.cost !== undefined)
      .reduce((sum, m) => sum + (m.cost ?? 0), 0);

    const averageTokensPerCall = total > 0 ? totalTokens / total : 0;

    return {
      total,
      successful,
      failed,
      averageDurationMs,
      totalTokens,
      totalCost,
      averageTokensPerCall,
    };
  }

  private getSystemSummary() {
    const uptime = Math.max(1, Date.now() - this.sessionStartTime);

    const memoryValues = this.systemMetrics.length > 0
      ? this.systemMetrics.map(m => m.memoryUsageMb)
      : [this.getProcessMemoryMb()];
    const peakMemoryMb = memoryValues.length > 0
      ? Math.max(...memoryValues)
      : 0;
    const averageMemoryMb = memoryValues.length > 0
      ? memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length
      : 0;

    const recentMetrics = this.systemMetrics.slice(-10);
    const cacheHitRate = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / recentMetrics.length
      : 0;

    const errorRate = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length
      : 0;

    return {
      uptime,
      peakMemoryMb,
      averageMemoryMb,
      cacheHitRate,
      errorRate,
    };
  }

  private getProcessMemoryMb(): number {
    try {
      const stats = memoryUsage();
      return stats.rss / (1024 * 1024);
    } catch {
      return 0;
    }
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(): SessionMetrics {
    const toolsSummary = this.getToolsSummary();
    const providersSummary = this.getProvidersSummary();
    const now = Date.now();
    const duration = Math.max(1, now - this.sessionStartTime);

    return {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      endTime: now,
      durationMs: duration,
      totalTools: toolsSummary.total,
      successfulTools: toolsSummary.successful,
      failedTools: toolsSummary.failed,
      totalProviderCalls: providersSummary.total,
      totalTokens: providersSummary.totalTokens,
      totalCost: providersSummary.totalCost,
    };
  }

  /**
   * Export metrics as JSON for external analysis
   */
  exportMetrics(): string {
    return JSON.stringify({
      session: this.getSessionMetrics(),
      summary: this.getSummary(),
      tools: this.toolMetrics,
      providers: this.providerMetrics,
      system: this.systemMetrics,
    }, null, 2);
  }

  /**
   * Clear all metrics (for testing or reset)
   */
  clear(): void {
    this.toolMetrics = [];
    this.providerMetrics = [];
    this.systemMetrics = [];
  }
}

function normalizeProviderMetrics(
  metrics: ProviderMetrics,
): NormalizedProviderMetrics {
  const provider =
    pickString(metrics.provider) ??
    pickString(metrics.providerId) ??
    'unknown';
  const model = pickString(metrics.model) ?? 'unknown';
  const startTime = pickNumber(metrics.startTime) ?? Date.now();
  const endTime = pickNumber(metrics.endTime);
  const durationMs =
    pickNumber(metrics.durationMs) ??
    (endTime !== undefined ? Math.max(0, endTime - startTime) : undefined);

  const inputTokens = pickNumber(
    metrics.inputTokens,
    metrics.tokensInput,
  );
  const outputTokens = pickNumber(
    metrics.outputTokens,
    metrics.tokensOutput,
  );
  const totalTokens =
    pickNumber(metrics.totalTokens, metrics.tokensTotal) ??
    (inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined);

  return {
    provider,
    providerId: provider,
    model,
    startTime,
    endTime,
    durationMs,
    success: Boolean(metrics.success),
    error:
      typeof metrics.error === 'string' && metrics.error.trim()
        ? metrics.error
        : undefined,
    inputTokens,
    outputTokens,
    totalTokens,
    cost: pickNumber(metrics.cost),
    retryCount: pickNumber(metrics.retryCount) ?? 0,
  };
}

function pickNumber(...values: Array<unknown>): number | undefined {
  for (const value of values) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : undefined;
    if (parsed !== undefined && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Performance monitor for tracking system health
 */
export class PerformanceMonitor {
  private readonly collector: MetricsCollector;
  private monitoringInterval?: NodeJS.Timeout;
  private activeToolExecutions = 0;
  private activeProviderCalls = 0;
  private recentErrors = 0;
  private recentOperations = 0;
  private cacheMetrics: CacheMetrics | null;
  private readonly startTime: number;

  constructor(
    collector: MetricsCollector | null = null,
    cacheMetrics: CacheMetrics | null = null,
  ) {
    this.collector = collector ?? new MetricsCollector(createMonitorSessionId());
    this.cacheMetrics = cacheMetrics ?? getSharedCacheMetrics();
    this.startTime = Date.now();
  }

  /**
   * Start monitoring system metrics
   */
  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      return;
    }

    this.captureSystemMetrics();
    this.monitoringInterval = setInterval(() => {
      this.captureSystemMetrics();
    }, intervalMs);
    this.monitoringInterval.unref?.();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Capture current system metrics
   */
  private captureSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const memoryUsageMb = memUsage.heapUsed / 1024 / 1024;

    const errorRate = this.recentOperations > 0
      ? (this.recentErrors / this.recentOperations) * 100
      : 0;

    const cacheHitRate = this.cacheMetrics?.getHitRate() ?? 0;

    this.collector.recordSystemMetrics({
      timestamp: Date.now(),
      memoryUsageMb,
      activeToolExecutions: this.activeToolExecutions,
      activeProviderCalls: this.activeProviderCalls,
      cacheHitRate,
      errorRate,
    });

    // Reset error/operation counters
    this.recentErrors = 0;
    this.recentOperations = 0;
  }

  /**
   * Track tool execution start
   */
  trackToolStart(): void {
    this.activeToolExecutions++;
    this.recentOperations++;
  }

  /**
   * Track tool execution end
   */
  trackToolEnd(success: boolean): void {
    this.activeToolExecutions = Math.max(0, this.activeToolExecutions - 1);
    if (!success) {
      this.recentErrors++;
    }
  }

  /**
   * Track provider call start
   */
  trackProviderStart(): void {
    this.activeProviderCalls++;
    this.recentOperations++;
  }

  /**
   * Track provider call end
   */
  trackProviderEnd(success: boolean): void {
    this.activeProviderCalls = Math.max(0, this.activeProviderCalls - 1);
    if (!success) {
      this.recentErrors++;
    }
  }

  /**
   * Capture a system snapshot immediately and return a summarized view.
   */
  snapshot(): PerformanceSnapshot {
    this.captureSystemMetrics();
    const summary = this.collector.getSummary();

    return {
      activeTools: this.activeToolExecutions,
      activeProviders: this.activeProviderCalls,
      uptime: summary.system.uptime || Date.now() - this.startTime,
      cacheHitRate: summary.system.cacheHitRate,
      errorRate: summary.system.errorRate,
      averageMemoryMb: summary.system.averageMemoryMb,
      peakMemoryMb: summary.system.peakMemoryMb,
    };
  }
}

/**
 * Structured logger for observability
 */
export class StructuredLogger {
  constructor(
    private readonly sessionId: string,
    private readonly component: string,
  ) {}

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      sessionId: this.sessionId,
      component: this.component,
      message,
      ...context,
    };

    const logLine = JSON.stringify(logEntry);

    switch (level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      default:
        console.log(logLine);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }
}

function createMonitorSessionId(): string {
  try {
    return randomUUID();
  } catch {
    return `monitor-${Date.now()}`;
  }
}
