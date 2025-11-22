import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  withRetry,
  FAST_RETRY_CONFIG,
  RetryMetricsTracker,
  CircuitBreaker,
} from '../src/core/retryStrategy.js';

describe('RetryStrategy', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        return 'success';
      };

      const result = await withRetry(
        operation,
        () => true,
        { ...FAST_RETRY_CONFIG, maxAttempts: 3 },
      );

      assert.equal(result.success, true);
      assert.equal(result.result, 'success');
      assert.equal(result.attempts, 1);
      assert.equal(attempts, 1);
    });

    it('should retry transient failures', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Transient error');
        }
        return 'success';
      };

      const result = await withRetry(
        operation,
        () => true,
        { ...FAST_RETRY_CONFIG, maxAttempts: 3 },
      );

      assert.equal(result.success, true);
      assert.equal(result.result, 'success');
      assert.equal(result.attempts, 3);
      assert.equal(attempts, 3);
    });

    it('should fail after max attempts', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('Persistent error');
      };

      const result = await withRetry(
        operation,
        () => true,
        { ...FAST_RETRY_CONFIG, maxAttempts: 3 },
      );

      assert.equal(result.success, false);
      assert.equal(result.error?.message, 'Persistent error');
      assert.equal(result.attempts, 3);
      assert.equal(attempts, 3);
    });

    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('Permanent error');
      };

      const result = await withRetry(
        operation,
        () => false, // Never retry
        { ...FAST_RETRY_CONFIG, maxAttempts: 3 },
      );

      assert.equal(result.success, false);
      assert.equal(result.attempts, 1);
      assert.equal(attempts, 1);
    });

    it('should call onRetry callback', async () => {
      let attempts = 0;
      let retryCallbacks = 0;

      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Retry me');
        }
        return 'success';
      };

      await withRetry(
        operation,
        () => true,
        { ...FAST_RETRY_CONFIG, maxAttempts: 3 },
        (attempt, error, delayMs) => {
          retryCallbacks++;
          assert.equal(error.message, 'Retry me');
          assert.ok(delayMs > 0);
        },
      );

      assert.equal(retryCallbacks, 1);
    });

    it('should timeout long-running operations', async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'too slow';
      };

      const result = await withRetry(
        operation,
        () => true,
        { ...FAST_RETRY_CONFIG, maxAttempts: 1, timeoutMs: 100 },
      );

      assert.equal(result.success, false);
      assert.ok(result.error?.message.includes('timed out'));
    });
  });

  describe('RetryMetricsTracker', () => {
    it('should track successful operations', () => {
      const tracker = new RetryMetricsTracker();

      tracker.recordAttempt({
        success: true,
        result: 'test',
        attempts: 1,
        totalDurationMs: 100,
      });

      const metrics = tracker.getMetrics();
      assert.equal(metrics.successfulAttempts, 1);
      assert.equal(metrics.failedAttempts, 0);
      assert.equal(metrics.totalAttempts, 1);
      assert.equal(metrics.averageRetries, 0);
    });

    it('should track failed operations', () => {
      const tracker = new RetryMetricsTracker();

      tracker.recordAttempt({
        success: false,
        error: new Error('test'),
        attempts: 3,
        totalDurationMs: 300,
      });

      const metrics = tracker.getMetrics();
      assert.equal(metrics.successfulAttempts, 0);
      assert.equal(metrics.failedAttempts, 1);
      assert.equal(metrics.totalAttempts, 3);
      assert.equal(metrics.averageRetries, 2); // 3 attempts = 2 retries
    });

    it('should calculate average retries correctly', () => {
      const tracker = new RetryMetricsTracker();

      tracker.recordAttempt({ success: true, attempts: 1, totalDurationMs: 100 });
      tracker.recordAttempt({ success: true, attempts: 3, totalDurationMs: 300 });
      tracker.recordAttempt({ success: true, attempts: 2, totalDurationMs: 200 });

      const metrics = tracker.getMetrics();
      assert.equal(metrics.averageRetries, 1); // (0 + 2 + 1) / 3 = 1
    });

    it('should reset metrics', () => {
      const tracker = new RetryMetricsTracker();

      tracker.recordAttempt({ success: true, attempts: 1, totalDurationMs: 100 });
      tracker.reset();

      const metrics = tracker.getMetrics();
      assert.equal(metrics.totalAttempts, 0);
      assert.equal(metrics.successfulAttempts, 0);
    });
  });

  describe('CircuitBreaker', () => {
    it('should allow operations when closed', async () => {
      const breaker = new CircuitBreaker(3, 1000);

      const result = await breaker.execute(async () => 'success');

      assert.equal(result, 'success');
      assert.equal(breaker.getState(), 'closed');
    });

    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker(3, 1000);

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      assert.equal(breaker.getState(), 'open');
      assert.equal(breaker.getFailureCount(), 3);

      // Should reject immediately when open
      await assert.rejects(
        breaker.execute(async () => 'should not run'),
        /Circuit breaker is OPEN/,
      );
    });

    it('should transition to half-open after reset time', async () => {
      const breaker = new CircuitBreaker(2, 100); // 100ms reset time

      // Trigger failures to open
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // Expected
        }
      }

      assert.equal(breaker.getState(), 'open');

      // Wait for reset time
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next call should attempt (half-open)
      const result = await breaker.execute(async () => 'recovered');
      assert.equal(result, 'recovered');
      assert.equal(breaker.getState(), 'closed');
    });
  });
});