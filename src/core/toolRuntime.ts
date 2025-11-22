import {
  type JSONSchemaObject,
  type ProviderId,
  type ProviderToolDefinition,
  type ToolCallRequest,
} from './types.js';
import {
  ToolArgumentValidationError,
  validateToolArguments,
} from './schemaValidator.js';
import { ContextManager } from './contextManager.js';
import type { ToolPolicy, ToolPolicyDecision } from './policyEngine.js';
import type { TimelineRecorder } from './timeline.js';
import {
  withRetry,
  FAST_RETRY_CONFIG,
  BASH_RETRY_CONFIG,
  type RetryConfig,
} from './retryStrategy.js';
import { classifyError } from './errorClassification.js';
import type {
  MetricsCollector,
  PerformanceMonitor,
} from './observability.js';
import { CacheMetrics, getSharedCacheMetrics } from './observability.js';

/**
 * Context information about the current tool execution environment.
 * Provides metadata about the active profile, provider, and workspace.
 */
export interface ToolExecutionContext {
  /** Name of the active profile (e.g., 'bo', 'general') */
  profileName: string;
  /** Provider ID (e.g., 'anthropic', 'openai') */
  provider: ProviderId;
  /** Model identifier (e.g., 'claude-3-sonnet') */
  model: string;
  /** Optional workspace context snapshot */
  workspaceContext?: string | null;
}

/**
 * Observer interface for monitoring tool execution lifecycle events.
 * Useful for logging, metrics collection, and debugging.
 */
export interface ToolRuntimeObserver {
  /** Called when a tool execution starts */
  onToolStart?(call: ToolCallRequest): void;
  /** Called when a tool execution completes successfully */
  onToolResult?(call: ToolCallRequest, output: string): void;
  /** Called when a tool execution fails */
  onToolError?(call: ToolCallRequest, error: string): void;
  /** Called when a cached result is returned */
  onCacheHit?(call: ToolCallRequest): void;
}

/**
 * Configuration options for the ToolRuntime.
 * All options are optional and have sensible defaults.
 */
interface ToolRuntimeOptions {
  /** Observer for tool execution lifecycle events */
  observer?: ToolRuntimeObserver;
  /** Context manager for token budget management and output truncation */
  contextManager?: ContextManager;
  /** Enable caching of idempotent tool results (default: true) */
  enableCache?: boolean;
  /** Cache time-to-live in milliseconds (default: 5 minutes) */
  cacheTTLMs?: number;
  /** Policy engine for access control and validation */
  policy?: ToolPolicy;
  /** Timeline recorder for execution history */
  timeline?: TimelineRecorder;
  /** Metrics collector for observability (optional) */
  metricsCollector?: MetricsCollector;
  /** Cache metrics tracker (defaults to shared instance) */
  cacheMetrics?: CacheMetrics | null;
  /** Performance monitor for system-level telemetry (optional) */
  performanceMonitor?: PerformanceMonitor | null;
  /** Maximum number of cache entries to retain (default: 200) */
  maxCacheEntries?: number;
  /** Minimum interval between cache sweeps in ms (default: 60s) */
  cacheSweepIntervalMs?: number;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: JSONSchemaObject;
  handler: ToolHandler;
  cacheable?: boolean; // Whether results can be cached
  normalizeArguments?: (
    args: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export interface ToolSuite {
  id: string;
  description?: string;
  tools: ToolDefinition[];
}

interface ToolRecord {
  suiteId: string;
  definition: ToolDefinition;
}

interface CacheEntry {
  result: string;
  timestamp: number;
}

// Idempotent tools that can be safely cached
const CACHEABLE_TOOLS = new Set([
  'Read',
  'read_file',
  'Glob',
  'glob_search',
  'Grep',
  'grep_search',
  'find_definition',
  'analyze_code_quality',
  'extract_exports',
]);

/**
 * ToolRuntime manages tool registration, execution, caching, and observability.
 *
 * Key Features:
 * - Automatic retry with intelligent error classification
 * - Result caching for idempotent operations
 * - Policy enforcement and access control
 * - Comprehensive metrics collection
 * - Timeline recording for debugging
 * - Output truncation for token budget management
 *
 * @example
 * ```typescript
 * const runtime = new ToolRuntime(baseTools, {
 *   enableCache: true,
 *   metricsCollector: collector,
 *   timeline: recorder,
 * });
 *
 * runtime.registerSuite({
 *   id: 'my-tools',
 *   tools: [myTool1, myTool2],
 * });
 *
 * const result = await runtime.execute(toolCall);
 * ```
 */
export class ToolRuntime {
  private readonly registry = new Map<string, ToolRecord>();
  private readonly registrationOrder: string[] = [];
  private readonly observer: ToolRuntimeObserver | null;
  private readonly contextManager: ContextManager | null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly enableCache: boolean;
  private readonly cacheTTLMs: number;
  private readonly policy: ToolPolicy | null;
  private readonly timeline: TimelineRecorder | null;
  private readonly metricsCollector: MetricsCollector | null;
  private readonly cacheMetrics: CacheMetrics | null;
  private readonly performanceMonitor: PerformanceMonitor | null;
  private readonly maxCacheEntries: number;
  private readonly cacheSweepIntervalMs: number;
  private lastCacheSweep = 0;

  /**
   * Create a new ToolRuntime instance.
   *
   * @param baseTools - Initial tools to register (optional)
   * @param options - Configuration options (all optional)
   */
  constructor(
    baseTools: ToolDefinition[] = [],
    options: ToolRuntimeOptions = {},
  ) {
    this.observer = options.observer ?? null;
    this.contextManager = options.contextManager ?? null;
    this.enableCache = options.enableCache ?? true;
    this.cacheTTLMs = options.cacheTTLMs ?? 5 * 60 * 1000; // 5 minutes default
    this.policy = options.policy ?? null;
    this.timeline = options.timeline ?? null;
    this.metricsCollector = options.metricsCollector ?? null;
    this.cacheMetrics =
      options.cacheMetrics === undefined
        ? getSharedCacheMetrics()
        : options.cacheMetrics;
    this.performanceMonitor = options.performanceMonitor ?? null;
    this.maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 200);
    this.cacheSweepIntervalMs = Math.max(1_000, options.cacheSweepIntervalMs ?? 60_000);
    if (baseTools.length) {
      this.registerSuite({
        id: 'runtime.core',
        description: 'Core runtime metadata tools',
        tools: baseTools,
      });
    }
  }

  /**
   * Determine the appropriate retry configuration for a tool.
   * Bash commands get longer timeouts to accommodate test suites and builds.
   */
  private getRetryConfig(toolName: string): RetryConfig {
    const isBashTool =
      toolName === 'Bash' ||
      toolName === 'bash' ||
      toolName === 'execute_bash' ||
      toolName === 'execute_bash_stream';

    return isBashTool ? BASH_RETRY_CONFIG : FAST_RETRY_CONFIG;
  }

  registerSuite(suite: ToolSuite): void {
    if (!suite?.id?.trim()) {
      throw new Error('Tool suite id cannot be blank.');
    }
    this.unregisterSuite(suite.id);
    for (const definition of suite.tools ?? []) {
      this.addTool(definition, suite.id);
    }
  }

  unregisterSuite(id: string): void {
    if (!id?.trim()) {
      return;
    }
    for (const [name, record] of this.registry.entries()) {
      if (record.suiteId === id) {
        this.registry.delete(name);
        this.removeFromOrder(name);
      }
    }
  }

  listProviderTools(): ProviderToolDefinition[] {
    return this.registrationOrder
      .map((name) => this.registry.get(name))
      .filter((record): record is ToolRecord => Boolean(record))
      .map(({ definition }) => {
        const tool: ProviderToolDefinition = {
          name: definition.name,
          description: definition.description,
        };
        if (definition.parameters) {
          tool.parameters = definition.parameters;
        }
        return tool;
      });
  }

  /**
   * Execute a tool call with automatic retry, caching, and observability.
   *
   * Execution Flow:
   * 1. Validate tool exists and arguments are correct
   * 2. Apply policy checks and sanitization
   * 3. Check cache for existing result (if cacheable)
   * 4. Execute tool handler with retry logic
   * 5. Record metrics and timeline events
   * 6. Cache result (if successful and cacheable)
   * 7. Return result or error message
   *
   * @param call - Tool call request with name, arguments, and ID
   * @returns Tool output as string, or error message on failure
   *
   * @example
   * ```typescript
   * const result = await runtime.execute({
   *   id: 'call-123',
   *   name: 'Read',
   *   arguments: { file_path: '/path/to/file.ts' }
   * });
   * ```
   */
  async execute(call: ToolCallRequest): Promise<string> {
    const record = this.registry.get(call.name);
    if (!record) {
      const message = `Tool "${call.name}" is not available.`;
      this.observer?.onToolError?.(call, message);
      return message;
    }

    const normalizedCall: ToolCallRequest = {
      ...call,
      arguments: normalizeToolArguments(call.arguments),
    };

    const coercedArgs = record.definition.normalizeArguments
      ? record.definition.normalizeArguments(normalizedCall.arguments)
      : normalizedCall.arguments;

    const normalizedExecutionCall: ToolCallRequest = {
      ...normalizedCall,
      arguments: coercedArgs,
    };

    const policyDecision = this.evaluatePolicy(
      normalizedExecutionCall,
      record.definition,
    );
    if (policyDecision?.action === 'block') {
      const message =
        policyDecision.reason ?? `Tool "${call.name}" blocked by policy.`;
      this.timeline?.record({
        action: 'policy_blocked',
        status: 'blocked',
        tool: call.name,
        message,
        metadata: { toolCallId: call.id },
      });
      this.observer?.onToolError?.(normalizedExecutionCall, message);
      return message;
    }

    const callArgs = {
      ...normalizedExecutionCall.arguments,
      ...(policyDecision?.sanitizedArguments ?? {}),
    };

    if (this.enableCache) {
      this.maybeSweepCache(Date.now());
    }

    // Check if tool is cacheable
    const isCacheable =
      record.definition.cacheable ?? CACHEABLE_TOOLS.has(call.name);

    // Try to get from cache
    if (this.enableCache && isCacheable) {
      const cacheKey = this.getCacheKey({
        ...normalizedExecutionCall,
        arguments: callArgs,
      });
      const cached = this.cache.get(cacheKey);

      if (cached) {
        if (Date.now() - cached.timestamp < this.cacheTTLMs) {
          this.cacheMetrics?.recordHit();
          this.bumpCacheEntry(cacheKey, cached);
          this.observer?.onCacheHit?.(normalizedExecutionCall);
          this.observer?.onToolResult?.(normalizedExecutionCall, cached.result);
          return cached.result;
        }
        this.deleteCacheEntry(cacheKey, cached);
      }

      this.cacheMetrics?.recordMiss();
    }

    this.observer?.onToolStart?.(normalizedExecutionCall);
    this.timeline?.record({
      action: 'tool_execution',
      status: 'started',
      tool: normalizedExecutionCall.name,
      metadata: { toolCallId: normalizedExecutionCall.id, arguments: callArgs },
    });

    const startTime = Date.now();
    const trackedByMonitor = this.performanceMonitor !== null;
    let monitorStarted = false;
    let retryAttempts = 0;

    if (policyDecision?.action === 'dry-run') {
      const preview =
        policyDecision.preview ??
        `Dry-run blocked execution of "${normalizedCall.name}".`;
      this.timeline?.record({
        action: 'tool_execution',
        status: 'skipped',
        tool: normalizedExecutionCall.name,
        message: preview,
        metadata: { toolCallId: normalizedExecutionCall.id },
      });
      this.observer?.onToolResult?.(normalizedExecutionCall, preview);
      return preview;
    }

    try {
      if (trackedByMonitor) {
        this.performanceMonitor!.trackToolStart();
        monitorStarted = true;
      }

      validateToolArguments(
        record.definition.name,
        record.definition.parameters,
        callArgs,
      );

      // Execute tool handler with retry logic for transient failures
      // Use bash-specific retry config for shell commands (longer timeout)
      const retryConfig = this.getRetryConfig(normalizedExecutionCall.name);
      const retryResult = await withRetry(
        async () => {
          return await record.definition.handler(callArgs);
        },
        (error: Error) => {
          const classification = classifyError(error);
          return classification.isRetryable;
        },
        retryConfig,
        (attempt, error, delayMs) => {
          this.timeline?.record({
            action: 'tool_execution',
            status: 'retrying',
            tool: normalizedExecutionCall.name,
            message: `Retry attempt ${attempt}: ${error.message}`,
            metadata: {
              toolCallId: normalizedExecutionCall.id,
              attempt,
              delayMs,
            },
          });
        }
      );
      retryAttempts = retryResult.attempts;

      if (!retryResult.success || !retryResult.result) {
        throw retryResult.error ?? new Error('Tool execution failed');
      }

      const result = retryResult.result;
      let output =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      // Truncate output if context manager is available
      if (this.contextManager) {
        const truncated = this.contextManager.truncateToolOutput(
          output,
          normalizedCall.name,
        );
        if (truncated.wasTruncated) {
          output = truncated.content;
          // Log truncation for debugging
          if (process.env['DEBUG_CONTEXT']) {
            console.warn(
              `[Context Manager] Truncated ${normalizedCall.name} output: ${truncated.originalLength} -> ${truncated.truncatedLength} chars`,
            );
          }
        }
      }

      // Cache the result if cacheable
      if (this.enableCache && isCacheable) {
        const cacheKey = this.getCacheKey({
          ...normalizedExecutionCall,
          arguments: callArgs,
        });
        const entry: CacheEntry = {
          result: output,
          timestamp: Date.now(),
        };
        // Move to the end of insertion order for LRU-like trimming
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, entry);
        this.cacheMetrics?.recordWrite(Buffer.byteLength(output, 'utf8'));
        this.trimCache();
      }

      this.timeline?.record({
        action: 'tool_execution',
        status: 'succeeded',
        tool: normalizedExecutionCall.name,
        message: 'completed',
        metadata: {
          toolCallId: normalizedExecutionCall.id,
          attempts: retryResult.attempts,
        },
      });

      // Record metrics if collector is available
      if (this.metricsCollector) {
        this.metricsCollector.recordToolExecution({
          toolName: normalizedExecutionCall.name,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          success: true,
          retryCount: retryResult.attempts - 1,
          inputSizeBytes: JSON.stringify(callArgs).length,
          outputSizeBytes: output.length,
        });
      }

      if (monitorStarted) {
        this.performanceMonitor!.trackToolEnd(true);
      }
      this.observer?.onToolResult?.(normalizedExecutionCall, output);
      return output;
    } catch (error) {
      let formatted: string;
      if (error instanceof ToolArgumentValidationError) {
        formatted = error.message;
      } else {
        const message = error instanceof Error ? error.message : String(error);
        formatted = `Failed to run "${call.name}": ${message}`;
      }
      this.timeline?.record({
        action: 'tool_execution',
        status: 'failed',
        tool: normalizedExecutionCall.name,
        message: formatted,
        metadata: {
          toolCallId: normalizedExecutionCall.id,
          attempts: retryAttempts || 0,
        },
      });

      // Record metrics for failed execution
      if (this.metricsCollector) {
        this.metricsCollector.recordToolExecution({
          toolName: normalizedExecutionCall.name,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          success: false,
          error: formatted,
          retryCount: Math.max(0, retryAttempts - 1),
        });
      }

      if (monitorStarted) {
        this.performanceMonitor!.trackToolEnd(false);
      }
      this.observer?.onToolError?.(normalizedExecutionCall, formatted);
      return formatted;
    }
  }

  private getCacheKey(call: ToolCallRequest): string {
    return `${call.name}:${JSON.stringify(call.arguments)}`;
  }

  private bumpCacheEntry(key: string, entry: CacheEntry): void {
    // Reinsert entry to update insertion order without extending TTL
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  private deleteCacheEntry(key: string, entry?: CacheEntry): void {
    const cached = entry ?? this.cache.get(key);
    this.cache.delete(key);
    if (cached) {
      this.cacheMetrics?.recordEviction(
        Buffer.byteLength(cached.result, 'utf8'),
      );
    }
  }

  private trimCache(): void {
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.entries().next().value as
        | [string, CacheEntry]
        | undefined;
      if (!oldest) {
        break;
      }
      const [key, entry] = oldest;
      this.deleteCacheEntry(key, entry);
    }
  }

  private evictExpiredEntries(referenceTime: number): void {
    if (this.cache.size === 0) {
      return;
    }
    for (const [key, entry] of this.cache.entries()) {
      if (referenceTime - entry.timestamp >= this.cacheTTLMs) {
        this.deleteCacheEntry(key, entry);
      }
    }
  }

  private maybeSweepCache(referenceTime: number): void {
    if (referenceTime - this.lastCacheSweep < this.cacheSweepIntervalMs) {
      return;
    }
    this.lastCacheSweep = referenceTime;
    this.evictExpiredEntries(referenceTime);
    this.trimCache();
  }

  private evaluatePolicy(
    call: ToolCallRequest,
    tool: ToolDefinition,
  ): ToolPolicyDecision | null {
    if (!this.policy) {
      return null;
    }
    try {
      return this.policy.evaluate(call, tool);
    } catch (error) {
      if (process.env['DEBUG_POLICY']) {
        console.warn('Policy evaluation failed', error);
      }
      return {
        action: 'block',
        reason: 'Policy evaluation failed; blocking to stay safe.',
        severity: 'high',
      };
    }
  }

  clearCache(): void {
    if (this.cacheMetrics && this.cache.size) {
      for (const entry of this.cache.values()) {
        this.cacheMetrics.recordEviction(
          Buffer.byteLength(entry.result, 'utf8'),
        );
      }
    }
    this.cache.clear();
  }

  getCacheStats(): {
    size: number;
    entries: number;
    hits: number;
    misses: number;
    hitRate: number;
    writes: number;
    evictions: number;
    maxEntries: number;
    ttlMs: number;
    bytesStored: number;
  } {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += Buffer.byteLength(entry.result, 'utf8');
    }
    const snapshot = this.cacheMetrics?.snapshot();
    return {
      size: totalSize,
      entries: this.cache.size,
      hits: snapshot?.hits ?? 0,
      misses: snapshot?.misses ?? 0,
      hitRate: snapshot?.hitRate ?? 0,
      writes: snapshot?.writes ?? 0,
      evictions: snapshot?.evictions ?? 0,
      maxEntries: this.maxCacheEntries,
      ttlMs: this.cacheTTLMs,
      bytesStored: snapshot?.bytesStored ?? totalSize,
    };
  }

  private addTool(definition: ToolDefinition, suiteId: string): void {
    if (!definition?.name?.trim()) {
      throw new Error(`Tool names cannot be blank (suite "${suiteId}").`);
    }
    if (this.registry.has(definition.name)) {
      const owner = this.registry.get(definition.name)?.suiteId ?? 'unknown';
      throw new Error(
        `Tool "${definition.name}" already registered by suite "${owner}".`,
      );
    }
    this.registry.set(definition.name, {
      suiteId,
      definition,
    });
    this.registrationOrder.push(definition.name);
  }

  private removeFromOrder(name: string): void {
    const index = this.registrationOrder.indexOf(name);
    if (index >= 0) {
      this.registrationOrder.splice(index, 1);
    }
  }
}

export function createDefaultToolRuntime(
  context: ToolExecutionContext,
  toolSuites: ToolSuite[] = [],
  options: ToolRuntimeOptions = {},
): ToolRuntime {
  const runtime = new ToolRuntime(
    [
      buildContextSnapshotTool(context.workspaceContext),
      buildCapabilitiesTool(context),
      buildProfileInspectorTool(context),
    ],
    options,
  );

  for (const suite of toolSuites) {
    runtime.registerSuite(suite);
  }

  return runtime;
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function buildContextSnapshotTool(
  workspaceContext?: string | null,
): ToolDefinition {
  return {
    name: 'context_snapshot',
    description:
      'Returns the repository context that was automatically captured during startup.',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          description:
            'Use "plain" for raw text or "markdown" for a fenced block.',
          enum: ['plain', 'markdown'],
        },
      },
    },
    handler: (args) => {
      if (!workspaceContext?.trim()) {
        return 'Workspace context is unavailable.';
      }

      const format = args['format'] === 'markdown' ? 'markdown' : 'plain';
      if (format === 'markdown') {
        return ['```text', workspaceContext.trim(), '```'].join('\n');
      }
      return workspaceContext.trim();
    },
  };
}

function buildCapabilitiesTool(context: ToolExecutionContext): ToolDefinition {
  return {
    name: 'capabilities_overview',
    description:
      'Summarizes the agent runtime capabilities including available tools and features.',
    parameters: {
      type: 'object',
      properties: {
        audience: {
          type: 'string',
          enum: ['developer', 'model'],
          description: 'Tailors the tone of the description.',
        },
      },
    },
    handler: (args) => {
      const audience = args['audience'];
      const adjective =
        audience === 'developer' ? 'Operator facing' : 'Model facing';
      return [
        `${adjective} capabilities summary:`,
        '- Full file system access (read, write, list, search).',
        '- Bash command execution for running scripts and tools.',
        '- Advanced code search and pattern matching.',
        '- Deterministic workspace context snapshot appended to the system prompt.',
        '- Tool invocations are logged in realtime for transparency.',
        `- Active provider: ${context.provider} (${context.model}).`,
      ].join('\n');
    },
  };
}

function buildProfileInspectorTool(
  context: ToolExecutionContext,
): ToolDefinition {
  return {
    name: 'profile_details',
    description: 'Returns the configuration of the active CLI profile.',
    parameters: {
      type: 'object',
      properties: {
        includeWorkspaceContext: {
          type: 'boolean',
          description:
            'Set true to append the workspace context snapshot if available.',
        },
      },
      additionalProperties: false,
    },
    handler: (args) => {
      const payload = {
        profile: context.profileName,
        provider: context.provider,
        model: context.model,
        workspaceContext: args['includeWorkspaceContext']
          ? (context.workspaceContext ?? null)
          : null,
      };
      return JSON.stringify(payload, null, 2);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
