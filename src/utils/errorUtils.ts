/**
 * Enhanced error utilities for better debugging and error reporting
 */

import type { ErrorContext } from '../core/errors.js';

export interface ErrorDetails {
  message: string;
  code?: string;
  context?: ErrorContext;
  stack?: string;
  timestamp: string;
}

// Centralized configuration for retryable error patterns
const RETRYABLE_ERROR_PATTERNS = [
  'timeout',
  'network',
  'rate limit',
  'too many requests',
  'service unavailable',
  'gateway timeout',
  'bad gateway',
  'internal server error',
] as const;

export function createErrorDetails(
  error: unknown,
  context?: ErrorContext,
  code?: string,
): ErrorDetails {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return {
    message,
    code,
    context,
    stack,
    timestamp: new Date().toISOString(),
  };
}

export function formatErrorForLogging(
  error: unknown,
  context?: ErrorContext,
): string {
  const details = createErrorDetails(error, context);

  const parts = [
    `[${details.timestamp}]`,
    details.code ? `[${details.code}]` : '',
    details.message,
  ];

  if (details.context && Object.keys(details.context).length > 0) {
    parts.push(`Context: ${JSON.stringify(details.context)}`);
  }

  if (details.stack) {
    parts.push(`Stack: ${details.stack}`);
  }

  return parts.filter(Boolean).join(' ');
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  return withExponentialBackoff(operation, {
    maxRetries,
    initialDelayMs: delayMs,
    backoffFactor: 2,
    jitter: 0, // preserve deterministic waits for legacy helper
    shouldRetry: isRetryableError,
  });
}

export interface BackoffRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Retries an async operation with exponential backoff and jitter.
 * Defaults to retrying transient network/rate limit errors and common HTTP 5xx/429 statuses.
 */
export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  options: BackoffRetryOptions = {},
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? 3);
  const initialDelay = Math.max(0, options.initialDelayMs ?? 500);
  const maxDelay = Math.max(initialDelay, options.maxDelayMs ?? 30_000);
  const backoffFactor = options.backoffFactor ?? 2;
  const jitter = clamp(options.jitter ?? 0.25, 0, 1);
  const shouldRetry =
    options.shouldRetry ??
    ((error: unknown) =>
      isRetryableError(error) ||
      isRetryableHttpError(error) ||
      isAbortError(error));

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(
        maxDelay,
        initialDelay * Math.pow(backoffFactor, attempt),
      );
      const delayWithJitter = applyJitter(delay, jitter);
      options.onRetry?.(error, attempt + 1, delayWithJitter);
      await sleep(delayWithJitter);
      attempt += 1;
    }
  }
}

export function isRetryableHttpError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status === null) {
    return false;
  }

  if (status === 408 || status === 425 || status === 429) {
    return true;
  }

  // Retry on transient 5xx responses
  return status >= 500 && status < 600;
}

function extractStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const statusCandidates = [
    (error as { status?: unknown }).status,
    (error as { statusCode?: unknown }).statusCode,
    (error as { response?: { status?: unknown } }).response?.status,
  ];

  for (const candidate of statusCandidates) {
    const numeric = typeof candidate === 'string' ? Number(candidate) : candidate;
    if (typeof numeric === 'number' && Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  if ((error as { name?: string }).name === 'AbortError') {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.toLowerCase().includes('aborted');
}

function applyJitter(delayMs: number, jitterRatio: number): number {
  if (jitterRatio <= 0) {
    return delayMs;
  }
  const jitter = delayMs * jitterRatio;
  const randomized = delayMs + (Math.random() * 2 * jitter - jitter);
  return clamp(Math.round(randomized), 0, Number.MAX_SAFE_INTEGER);
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
