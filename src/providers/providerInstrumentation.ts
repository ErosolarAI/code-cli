import type {
  ConversationMessage,
  LLMProvider,
  ProviderToolDefinition,
  ProviderUsage,
  StreamChunk,
} from '../core/types.js';
import type {
  MetricsCollector,
  PerformanceMonitor,
} from '../core/observability.js';
import { classifyError } from '../core/errorClassification.js';
import {
  PROVIDER_RETRY_CONFIG,
  type RetryConfig,
  withRetry,
} from '../core/retryStrategy.js';

interface ProviderInstrumentationOptions {
  metricsCollector?: MetricsCollector | null;
  performanceMonitor?: PerformanceMonitor | null;
  retryConfig?: RetryConfig | null;
}

/**
 * Wraps a provider with observability hooks so we capture metrics and active
 * operation counts without changing provider implementations.
 */
export function instrumentProvider(
  provider: LLMProvider,
  options: ProviderInstrumentationOptions = {},
): LLMProvider {
  const retryConfig =
    options.retryConfig === undefined
      ? PROVIDER_RETRY_CONFIG
      : options.retryConfig;

  if (
    !options.metricsCollector &&
    !options.performanceMonitor &&
    !retryConfig
  ) {
    return provider;
  }

  return new InstrumentedProvider(provider, {
    ...options,
    retryConfig,
  });
}

class InstrumentedProvider implements LLMProvider {
  readonly id: LLMProvider['id'];
  readonly model: string;

  private readonly inner: LLMProvider;
  private readonly metricsCollector: MetricsCollector | null;
  private readonly performanceMonitor: PerformanceMonitor | null;
  private readonly retryConfig: RetryConfig | null;

  // generateStream is assigned in constructor if supported by the inner provider
  generateStream?(
    messages: ConversationMessage[],
    tools: ProviderToolDefinition[],
  ): AsyncIterableIterator<StreamChunk>;

  constructor(
    provider: LLMProvider,
    options: ProviderInstrumentationOptions,
  ) {
    this.inner = provider;
    this.metricsCollector = options.metricsCollector ?? null;
    this.performanceMonitor = options.performanceMonitor ?? null;
    this.retryConfig =
      options.retryConfig === undefined
        ? PROVIDER_RETRY_CONFIG
        : options.retryConfig;
    this.id = provider.id;
    this.model = provider.model;

    if (typeof provider.generateStream === 'function') {
      const streamFn = provider.generateStream.bind(provider);
      this.generateStream = this.wrapStream(streamFn);
    }
  }

  async generate(
    messages: ConversationMessage[],
    tools: ProviderToolDefinition[],
  ) {
    const trackedByMonitor = this.performanceMonitor !== null;
    if (trackedByMonitor) {
      this.performanceMonitor!.trackProviderStart();
    }

    const startTime = Date.now();
    let success = false;
    let usage: ProviderUsage | null | undefined;
    let errorMessage: string | undefined;
    let attempts = 1;

    try {
      const retryConfig = this.retryConfig;

      if (!retryConfig || retryConfig.maxAttempts <= 1) {
        const response = await this.inner.generate(messages, tools);
        usage = response.usage ?? null;
        success = true;
        return response;
      }

      const retryResult = await withRetry(
        async () => {
          const response = await this.inner.generate(messages, tools);
          usage = response.usage ?? usage ?? null;
          return response;
        },
        (error: Error) => this.shouldRetry(error),
        retryConfig,
      );

      attempts = retryResult.attempts;

      if (!retryResult.success || !retryResult.result) {
        throw retryResult.error ?? new Error('Provider call failed');
      }

      success = true;
      return retryResult.result;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      if (trackedByMonitor) {
        this.performanceMonitor!.trackProviderEnd(success);
      }
      this.recordMetrics({
        success,
        usage,
        errorMessage,
        startTime,
        attempts,
      });
    }
  }

  getCapabilities() {
    if (typeof this.inner.getCapabilities === 'function') {
      return this.inner.getCapabilities();
    }
    // Return default capabilities if not available
    return {
      streaming: false,
      toolCalling: false,
      vision: false,
      functionCalling: false,
      maxTokens: 2048,
      supportedModalities: ['text'] as ('text' | 'image' | 'audio')[],
    };
  }

  private wrapStream(
    streamFn: (
      messages: ConversationMessage[],
      tools: ProviderToolDefinition[],
    ) => AsyncIterableIterator<StreamChunk>,
  ) {
    return async function* (
      this: InstrumentedProvider,
      messages: ConversationMessage[],
      tools: ProviderToolDefinition[],
    ): AsyncIterableIterator<StreamChunk> {
      const trackedByMonitor = this.performanceMonitor !== null;
      if (trackedByMonitor) {
        this.performanceMonitor!.trackProviderStart();
      }

      const startTime = Date.now();
      let success = false;
      let usage: ProviderUsage | null | undefined;
      let errorMessage: string | undefined;
      let attempts = 1;

      try {
        const retryConfig = this.retryConfig;
        let stream: AsyncIterableIterator<StreamChunk>;

        if (retryConfig && retryConfig.maxAttempts > 1) {
          const retryResult = await withRetry(
            async () => streamFn(messages, tools),
            (error: Error) => this.shouldRetry(error),
            retryConfig,
          );

          attempts = retryResult.attempts;

          if (!retryResult.success || !retryResult.result) {
            throw retryResult.error ?? new Error('Provider streaming failed');
          }

          stream = retryResult.result;
        } else {
          stream = streamFn(messages, tools);
        }

        for await (const chunk of stream) {
          if (chunk.type === 'usage' && chunk.usage) {
            usage = chunk.usage;
          }
          yield chunk;
        }
        success = true;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (trackedByMonitor) {
          this.performanceMonitor!.trackProviderEnd(success);
        }
        this.recordMetrics({
          success,
          usage,
          errorMessage,
          startTime,
          attempts,
        });
      }
    }.bind(this);
  }

  private recordMetrics(payload: {
    success: boolean;
    usage?: ProviderUsage | null;
    errorMessage?: string;
    startTime: number;
    attempts: number;
  }): void {
    if (!this.metricsCollector) {
      return;
    }

    const now = Date.now();
    this.metricsCollector.recordProviderCall({
      providerId: this.id,
      model: this.model,
      startTime: payload.startTime,
      endTime: now,
      durationMs: now - payload.startTime,
      success: payload.success,
      error: payload.success ? undefined : payload.errorMessage,
      retryCount: Math.max(0, (payload.attempts ?? 1) - 1),
      tokensInput: payload.usage?.inputTokens,
      tokensOutput: payload.usage?.outputTokens,
      tokensTotal: payload.usage?.totalTokens,
    });
  }

  private shouldRetry(error: Error): boolean {
    if (!this.retryConfig || this.retryConfig.maxAttempts <= 1) {
      return false;
    }
    try {
      const classified = classifyError(error);
      return classified.isRetryable;
    } catch {
      return false;
    }
  }
}
