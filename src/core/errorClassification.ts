/**
 * Error Classification Module
 *
 * Classifies errors as transient (retryable) or permanent (non-retryable)
 * to enable intelligent retry strategies.
 *
 * Based on 2025 AI agent best practices for error handling.
 */

export enum ErrorType {
  /** Transient errors that may succeed on retry */
  TRANSIENT = 'transient',
  /** Permanent errors that won't succeed on retry */
  PERMANENT = 'permanent',
  /** Rate limit errors that need backoff */
  RATE_LIMIT = 'rate_limit',
  /** Authentication/authorization errors */
  AUTH = 'auth',
  /** Timeout errors */
  TIMEOUT = 'timeout',
  /** Network connectivity errors */
  NETWORK = 'network',
  /** Resource not found */
  NOT_FOUND = 'not_found',
  /** Invalid input/validation errors */
  VALIDATION = 'validation',
  /** Unknown error type */
  UNKNOWN = 'unknown',
}

export interface ClassifiedError {
  type: ErrorType;
  isRetryable: boolean;
  error: Error;
  context?: Record<string, unknown>;
}

/**
 * Patterns for transient errors that should be retried
 */
const TRANSIENT_ERROR_PATTERNS = [
  // Network errors
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /network timeout/i,
  /connection timeout/i,

  // HTTP errors
  /502 Bad Gateway/i,
  /503 Service Unavailable/i,
  /504 Gateway Timeout/i,
  /429 Too Many Requests/i,
  /408 Request Timeout/i,

  // Provider-specific transient errors
  /overloaded/i,
  /capacity/i,
  /temporarily unavailable/i,
  /internal server error/i,
  /service unavailable/i,
  /connection refused/i,
  /EADDRINUSE/i,
];

/**
 * Patterns for rate limit errors
 */
const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /429/,
  /quota exceeded/i,
  /throttle/i,
];

/**
 * Patterns for authentication errors
 */
const AUTH_ERROR_PATTERNS = [
  /unauthorized/i,
  /unauthenticated/i,
  /invalid.*api.*key/i,
  /invalid.*token/i,
  /authentication failed/i,
  /401/,
  /403/,
  /forbidden/i,
];

/**
 * Patterns for timeout errors
 */
const TIMEOUT_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /ETIMEDOUT/i,
  /deadline exceeded/i,
];

/**
 * Patterns for not found errors
 */
const NOT_FOUND_PATTERNS = [
  /not found/i,
  /404/,
  /ENOENT/i,
  /does not exist/i,
];

/**
 * Patterns for validation errors
 */
const VALIDATION_PATTERNS = [
  /validation/i,
  /invalid.*input/i,
  /invalid.*parameter/i,
  /invalid.*argument/i,
  /400/,
  /bad request/i,
];

/**
 * Check if error message matches any pattern
 */
function matchesPattern(message: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message));
}

/**
 * Classify error by type and determine if retryable
 */
export function classifyError(error: unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message;

  // Check rate limits first (special case of transient)
  if (matchesPattern(message, RATE_LIMIT_PATTERNS)) {
    return {
      type: ErrorType.RATE_LIMIT,
      isRetryable: true,
      error: err,
      context: { needsBackoff: true },
    };
  }

  // Check authentication errors (not retryable without fixing auth)
  if (matchesPattern(message, AUTH_ERROR_PATTERNS)) {
    return {
      type: ErrorType.AUTH,
      isRetryable: false,
      error: err,
      context: { requiresAuth: true },
    };
  }

  // Check timeout errors (retryable)
  if (matchesPattern(message, TIMEOUT_PATTERNS)) {
    return {
      type: ErrorType.TIMEOUT,
      isRetryable: true,
      error: err,
    };
  }

  // Check not found errors (not retryable)
  if (matchesPattern(message, NOT_FOUND_PATTERNS)) {
    return {
      type: ErrorType.NOT_FOUND,
      isRetryable: false,
      error: err,
    };
  }

  // Check validation errors (not retryable without changing input)
  if (matchesPattern(message, VALIDATION_PATTERNS)) {
    return {
      type: ErrorType.VALIDATION,
      isRetryable: false,
      error: err,
      context: { requiresInputChange: true },
    };
  }

  // Check general transient errors
  if (matchesPattern(message, TRANSIENT_ERROR_PATTERNS)) {
    return {
      type: ErrorType.TRANSIENT,
      isRetryable: true,
      error: err,
    };
  }

  // Default to permanent for unknown errors
  return {
    type: ErrorType.UNKNOWN,
    isRetryable: false,
    error: err,
    context: { needsInvestigation: true },
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const classified = classifyError(error);
  return classified.isRetryable;
}

/**
 * Get recommended retry delay based on error type
 */
export function getRecommendedRetryDelay(error: unknown): number {
  const classified = classifyError(error);

  switch (classified.type) {
    case ErrorType.RATE_LIMIT:
      return 5000; // 5 seconds for rate limits
    case ErrorType.TIMEOUT:
      return 2000; // 2 seconds for timeouts
    case ErrorType.NETWORK:
      return 1000; // 1 second for network issues
    case ErrorType.TRANSIENT:
      return 1000; // 1 second for general transient
    default:
      return 0; // No retry for permanent errors
  }
}

/**
 * Error statistics tracker for observability
 */
export class ErrorStatistics {
  private stats = new Map<ErrorType, number>();
  private totalErrors = 0;

  recordError(error: unknown): void {
    const classified = classifyError(error);
    this.totalErrors++;

    const count = this.stats.get(classified.type) ?? 0;
    this.stats.set(classified.type, count + 1);
  }

  getStatistics(): Record<string, number> {
    const result: Record<string, number> = { total: this.totalErrors };

    for (const [type, count] of this.stats.entries()) {
      result[type] = count;
    }

    return result;
  }

  getRetryablePercentage(): number {
    let retryableCount = 0;

    for (const [type, count] of this.stats.entries()) {
      if (type === ErrorType.TRANSIENT ||
          type === ErrorType.RATE_LIMIT ||
          type === ErrorType.TIMEOUT ||
          type === ErrorType.NETWORK) {
        retryableCount += count;
      }
    }

    return this.totalErrors > 0 ? (retryableCount / this.totalErrors) * 100 : 0;
  }

  reset(): void {
    this.stats.clear();
    this.totalErrors = 0;
  }
}