import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyError,
  isRetryableError,
  getRecommendedRetryDelay,
  ErrorType,
  ErrorStatistics,
} from '../src/core/errorClassification.js';

describe('ErrorClassification', () => {
  describe('classifyError', () => {
    it('should classify network errors as transient', () => {
      const errors = [
        new Error('ECONNREFUSED connection refused'),
        new Error('ETIMEDOUT timeout'),
        new Error('socket hang up'),
        new Error('502 Bad Gateway'),
        new Error('503 Service Unavailable'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.ok(classified.isRetryable, `Expected retryable: ${error.message}`);
        assert.ok(
          classified.type === ErrorType.TRANSIENT ||
          classified.type === ErrorType.TIMEOUT,
        );
      }
    });

    it('should classify rate limit errors', () => {
      const errors = [
        new Error('Rate limit exceeded'),
        new Error('429 Too Many Requests'),
        new Error('API quota exceeded'),
        new Error('Request throttled'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.equal(classified.type, ErrorType.RATE_LIMIT);
        assert.equal(classified.isRetryable, true);
        assert.equal(classified.context?.needsBackoff, true);
      }
    });

    it('should classify authentication errors as non-retryable', () => {
      const errors = [
        new Error('401 Unauthorized'),
        new Error('403 Forbidden'),
        new Error('Invalid API key'),
        new Error('Authentication failed'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.equal(classified.type, ErrorType.AUTH);
        assert.equal(classified.isRetryable, false);
        assert.equal(classified.context?.requiresAuth, true);
      }
    });

    it('should classify not found errors as non-retryable', () => {
      const errors = [
        new Error('404 Not Found'),
        new Error('File ENOENT does not exist'),
        new Error('Resource not found'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.equal(classified.type, ErrorType.NOT_FOUND);
        assert.equal(classified.isRetryable, false);
      }
    });

    it('should classify validation errors as non-retryable', () => {
      const errors = [
        new Error('400 Bad Request'),
        new Error('Invalid input parameter'),
        new Error('Validation failed'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.equal(classified.type, ErrorType.VALIDATION);
        assert.equal(classified.isRetryable, false);
        assert.equal(classified.context?.requiresInputChange, true);
      }
    });

    it('should classify timeout errors', () => {
      const errors = [
        new Error('Request timeout'),
        new Error('Operation timed out'),
        new Error('ETIMEDOUT'),
        new Error('Deadline exceeded'),
      ];

      for (const error of errors) {
        const classified = classifyError(error);
        assert.equal(classified.type, ErrorType.TIMEOUT);
        assert.equal(classified.isRetryable, true);
      }
    });

    it('should classify unknown errors as non-retryable by default', () => {
      const error = new Error('Something completely unexpected');
      const classified = classifyError(error);

      assert.equal(classified.type, ErrorType.UNKNOWN);
      assert.equal(classified.isRetryable, false);
      assert.equal(classified.context?.needsInvestigation, true);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      assert.equal(isRetryableError(new Error('ECONNREFUSED')), true);
      assert.equal(isRetryableError(new Error('Rate limit exceeded')), true);
      assert.equal(isRetryableError(new Error('Timeout')), true);
    });

    it('should return false for non-retryable errors', () => {
      assert.equal(isRetryableError(new Error('401 Unauthorized')), false);
      assert.equal(isRetryableError(new Error('404 Not Found')), false);
      assert.equal(isRetryableError(new Error('Invalid input')), false);
    });
  });

  describe('getRecommendedRetryDelay', () => {
    it('should recommend longer delay for rate limits', () => {
      const delay = getRecommendedRetryDelay(new Error('Rate limit exceeded'));
      assert.equal(delay, 5000);
    });

    it('should recommend moderate delay for timeouts', () => {
      const delay = getRecommendedRetryDelay(new Error('Request timeout'));
      assert.equal(delay, 2000);
    });

    it('should recommend short delay for network errors', () => {
      const delay = getRecommendedRetryDelay(new Error('ECONNREFUSED'));
      assert.ok(delay >= 1000);
    });

    it('should recommend no delay for permanent errors', () => {
      const delay = getRecommendedRetryDelay(new Error('401 Unauthorized'));
      assert.equal(delay, 0);
    });
  });

  describe('ErrorStatistics', () => {
    it('should track error counts by type', () => {
      const stats = new ErrorStatistics();

      stats.recordError(new Error('ECONNREFUSED'));
      stats.recordError(new Error('Rate limit exceeded'));
      stats.recordError(new Error('401 Unauthorized'));
      stats.recordError(new Error('ECONNREFUSED'));

      const statistics = stats.getStatistics();
      assert.equal(statistics.total, 4);
      assert.equal(statistics[ErrorType.TRANSIENT], 2);
      assert.equal(statistics[ErrorType.RATE_LIMIT], 1);
      assert.equal(statistics[ErrorType.AUTH], 1);
    });

    it('should calculate retryable percentage', () => {
      const stats = new ErrorStatistics();

      stats.recordError(new Error('ECONNREFUSED')); // retryable
      stats.recordError(new Error('Timeout')); // retryable
      stats.recordError(new Error('401 Unauthorized')); // not retryable
      stats.recordError(new Error('404 Not Found')); // not retryable

      const percentage = stats.getRetryablePercentage();
      assert.equal(percentage, 50); // 2 out of 4
    });

    it('should reset statistics', () => {
      const stats = new ErrorStatistics();

      stats.recordError(new Error('ECONNREFUSED'));
      stats.reset();

      const statistics = stats.getStatistics();
      assert.equal(statistics.total, 0);
    });
  });
});
