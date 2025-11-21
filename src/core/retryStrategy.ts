/**
 * Retry Strategy Module
 *
 * Implements intelligent retry mechanisms with exponential backoff and jitter
 * for handling transient failures in AI agent operations.
 *
 * Based on 2025 best practices for AI agent reliability.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd (0-1) */
  jitterFactor: number;
  /** Timeout for each attempt in milliseconds */
  timeoutMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDurationMs: number;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  averageRetries: number;
  totalDurationMs: number;
}

/**
 * Default retry configuration with best practices
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  timeoutMs: 120000, // 2 minutes
};

/**
 * Retry configuration for fast operations (file reads, etc.)
 */
export const FAST_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  timeoutMs: 10000,
};

/**
 * Retry configuration for LLM provider calls
 */
export const PROVIDER_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 3,
  jitterFactor: 0.3,
  timeoutMs: 180000, // 3 minutes
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter to prevent thundering herd problem
  const jitter = cappedDelay * config.jitterFactor * (Math.random() - 0.5) * 2;

  return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute operation with retry logic and exponential backoff
 *
 * @param operation - Async operation to retry
 * @param shouldRetry - Function to determine if error is retryable
 * @param config - Retry configuration
 * @param onRetry - Optional callback on retry attempt
 * @returns RetryResult with success status and result/error
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error, delayMs: number) => void,
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const clearTimer = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // Execute with timeout if configured
      const result = config.timeoutMs
        ? await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(
                  new Error(
                    `Operation timed out after ${config.timeoutMs}ms`,
                  ),
                );
              }, config.timeoutMs);
              timeoutId.unref?.();
            }),
          ])
        : await operation();

      clearTimer();

      return {
        success: true,
        result,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      // If it's the last attempt or error is not retryable, fail
      if (attempt >= config.maxAttempts || !shouldRetry(err)) {
        return {
          success: false,
          error: err,
          attempts: attempt,
          totalDurationMs: Date.now() - startTime,
        };
      }

      // Calculate delay and retry
      const delayMs = calculateDelay(attempt, config);

      // Notify callback if provided
      if (onRetry) {
        onRetry(attempt, err, delayMs);
      }

      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs this
  return {
    success: false,
    error: lastError ?? new Error('Unknown error'),
    attempts: config.maxAttempts,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Retry metrics tracker for observability
 */
export class RetryMetricsTracker {
  private metrics: RetryMetrics = {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    averageRetries: 0,
    totalDurationMs: 0,
  };

  private retryCountSum = 0;
  private operationCount = 0;

  recordAttempt(result: RetryResult<unknown>): void {
    this.operationCount++;
    this.metrics.totalAttempts += result.attempts;
    this.metrics.totalDurationMs += result.totalDurationMs;

    if (result.success) {
      this.metrics.successfulAttempts++;
    } else {
      this.metrics.failedAttempts++;
    }

    this.retryCountSum += (result.attempts - 1); // Don't count initial attempt
    this.metrics.averageRetries = this.operationCount > 0
      ? this.retryCountSum / this.operationCount
      : 0;
  }

  getMetrics(): Readonly<RetryMetrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      averageRetries: 0,
      totalDurationMs: 0,
    };
    this.retryCountSum = 0;
    this.operationCount = 0;
  }
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeMs: number = 60000,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN - too many failures');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'half-open') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}
