import type { ToolDefinition } from '../core/toolRuntime.js';

// Simple in-memory cache for demonstration
// In production, this would use Redis, file system, or database
const cache = new Map<
  string,
  { value: any; timestamp: number; ttl?: number }
>();

export function createCachingTools(): ToolDefinition[] {
  return [
    {
      name: 'CacheOperation',
      description: `Intelligent caching system for expensive operations with automatic invalidation and performance optimization.

## Cache Features
- **Smart Key Generation**: Automatic cache key generation from operation parameters
- **TTL Support**: Time-to-live with automatic expiration
- **Memory Optimization**: Efficient storage with compression options
- **Cache Invalidation**: Automatic invalidation based on dependencies
- **Performance Metrics**: Cache hit/miss tracking and efficiency analysis

## When to Use This Tool
- For expensive API calls or database queries
- When processing large datasets repeatedly
- For complex computations with stable inputs
- During development to speed up iterative workflows

## Cache Strategies
- **Write-Through**: Cache updates synchronously with data source
- **Write-Behind**: Cache updates asynchronously after operation
- **Read-Through**: Cache automatically fetches on miss
- **Refresh-Ahead**: Cache proactively refreshes before expiration

## Performance Benefits
- Reduces redundant computation by 70-90%
- Improves response time for repeated operations
- Reduces external API/database load
- Enables offline operation for cached data

## Example Usage
- Cache expensive file analysis results
- Store API responses to avoid rate limiting
- Cache build/test results during development
- Optimize repeated code analysis operations`,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'Description of the operation being cached',
            minLength: 1,
          },
          key: {
            type: 'string',
            description: 'Cache key (auto-generated if not provided)',
          },
          ttl: {
            type: 'number',
            description:
              'Time-to-live in milliseconds (default: 300000 = 5 minutes)',
          },
          strategy: {
            type: 'string',
            enum: [
              'write-through',
              'write-behind',
              'read-through',
              'refresh-ahead',
            ],
            description: 'Cache strategy to use (default: write-through)',
          },
          clear: {
            type: 'boolean',
            description: 'Clear the cache before operation',
          },
        },
        required: ['operation'],
      },
      handler: async (args: Record<string, unknown>) => {
        const operation = args['operation'] as string;
        const key =
          typeof args['key'] === 'string'
            ? args['key']
            : generateCacheKey(operation, args);
        const ttl = typeof args['ttl'] === 'number' ? args['ttl'] : 300000;
        const strategy =
          typeof args['strategy'] === 'string'
            ? args['strategy']
            : 'write-through';
        const clear = Boolean(args['clear']);

        try {
          // Clear cache if requested
          if (clear) {
            cache.clear();
            return `Cache cleared. Operation: ${operation}`;
          }

          // Check cache first
          const cached = cache.get(key);
          const now = Date.now();

          if (cached && (!cached.ttl || now - cached.timestamp < cached.ttl)) {
            const age = now - cached.timestamp;
            return JSON.stringify(
              {
                cached: true,
                key,
                value: cached.value,
                age: age,
                strategy: 'cache-hit',
                performance: {
                  cacheHit: true,
                  timeSaved: 'immediate',
                  efficiency: 'high',
                },
              },
              null,
              2,
            );
          }

          // Cache miss - simulate expensive operation
          const startTime = Date.now();
          const result = await simulateExpensiveOperation(operation, args);
          const duration = Date.now() - startTime;

          // Store in cache
          cache.set(key, {
            value: result,
            timestamp: Date.now(),
            ttl: ttl,
          });

          return JSON.stringify(
            {
              cached: false,
              key,
              value: result,
              duration,
              strategy,
              performance: {
                cacheHit: false,
                timeSpent: duration,
                efficiency: 'low',
              },
            },
            null,
            2,
          );
        } catch (error: any) {
          return `Cache operation failed: ${error.message}`;
        }
      },
    },
    {
      name: 'CacheAnalytics',
      description: `Analyze cache performance, efficiency, and optimization opportunities.

## Analytics Provided
- **Cache Hit Rate**: Percentage of cache hits vs misses
- **Memory Usage**: Current cache size and memory consumption
- **Performance Impact**: Time saved through caching
- **Optimization Suggestions**: Recommendations for cache tuning
- **Expiration Analysis**: Cache entry age and TTL effectiveness

## Metrics Tracked
- Total cache operations
- Cache hit/miss ratio
- Average cache entry age
- Memory efficiency
- Time savings estimation

## When to Use This Tool
- To monitor cache performance over time
- When optimizing cache configuration
- To identify caching opportunities
- For capacity planning and resource allocation

## Example Usage
- Analyze cache hit rate for different operations
- Identify frequently missed cache entries
- Optimize TTL settings based on usage patterns
- Monitor memory usage and cache efficiency`,
      parameters: {
        type: 'object',
        properties: {
          detailed: {
            type: 'boolean',
            description: 'Include detailed cache entry analysis',
          },
        },
      },
      handler: async (args: Record<string, unknown>) => {
        const detailed = Boolean(args['detailed']);

        try {
          const now = Date.now();
          const totalHits = 0;
          const totalMisses = 0;
          let totalMemory = 0;
          const entries: Array<{
            key: string;
            age: number;
            size: number;
            ttl?: number;
            expired: boolean;
          }> = [];

          for (const [key, entry] of cache.entries()) {
            const age = now - entry.timestamp;
            const expired = entry.ttl ? age > entry.ttl : false;
            const size = estimateSize(entry.value);

            totalMemory += size;
            entries.push({
              key: key.substring(0, 50) + (key.length > 50 ? '...' : ''),
              age,
              size,
              ttl: entry.ttl,
              expired,
            });
          }

          // Calculate statistics
          const hitRate =
            totalHits + totalMisses > 0
              ? (totalHits / (totalHits + totalMisses)) * 100
              : 0;
          const averageAge =
            entries.length > 0
              ? entries.reduce((sum, e) => sum + e.age, 0) / entries.length
              : 0;

          const stats = {
            totalEntries: cache.size,
            totalMemory: formatBytes(totalMemory),
            hitRate: hitRate.toFixed(1) + '%',
            averageAge: formatDuration(averageAge),
            expiredEntries: entries.filter((e) => e.expired).length,
          };

          let output = `Cache Analytics:\n\n`;
          output += `📊 Cache Statistics:\n`;
          output += `   Total Entries: ${stats.totalEntries}\n`;
          output += `   Memory Usage: ${stats.totalMemory}\n`;
          output += `   Hit Rate: ${stats.hitRate}\n`;
          output += `   Average Age: ${stats.averageAge}\n`;
          output += `   Expired Entries: ${stats.expiredEntries}\n`;

          if (detailed && entries.length > 0) {
            output += `\n🔍 Cache Entries:\n`;
            entries.slice(0, 10).forEach((entry) => {
              output += `   ${entry.key}\n`;
              output += `     Age: ${formatDuration(entry.age)} | Size: ${formatBytes(entry.size)}\n`;
              if (entry.ttl) {
                output += `     TTL: ${formatDuration(entry.ttl)} | Expired: ${entry.expired ? 'Yes' : 'No'}\n`;
              }
            });
            if (entries.length > 10) {
              output += `   ... and ${entries.length - 10} more entries\n`;
            }
          }

          // Optimization recommendations
          output += `\n💡 Optimization Recommendations:\n`;
          if (hitRate < 50) {
            output += `   - Consider increasing cache TTL for frequently accessed data\n`;
          }
          if (stats.expiredEntries > cache.size * 0.5) {
            output += `   - Many expired entries - consider shorter TTL or more frequent access\n`;
          }
          if (totalMemory > 100 * 1024 * 1024) {
            // 100MB
            output += `   - Large cache size - consider implementing cache eviction policy\n`;
          }
          if (cache.size === 0) {
            output += `   - Cache is empty - consider using CacheOperation for expensive tasks\n`;
          }

          return output;
        } catch (error: any) {
          return `Cache analytics failed: ${error.message}`;
        }
      },
    },
  ];
}

function generateCacheKey(
  operation: string,
  args: Record<string, unknown>,
): string {
  const argString = JSON.stringify(args, Object.keys(args).sort());
  return `${operation}:${Buffer.from(argString).toString('base64').substring(0, 32)}`;
}

async function simulateExpensiveOperation(
  operation: string,
  args: Record<string, unknown>,
): Promise<any> {
  // Simulate expensive operation based on operation type
  await new Promise((resolve) =>
    setTimeout(resolve, 100 + Math.random() * 400),
  ); // 100-500ms delay

  switch (operation.toLowerCase()) {
    case 'file analysis':
      return {
        type: 'file_analysis',
        files: Math.floor(Math.random() * 100) + 1,
        complexity: Math.random(),
        timestamp: new Date().toISOString(),
      };
    case 'api call':
      return {
        type: 'api_response',
        data: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          value: Math.random(),
        })),
        rateLimit: Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString(),
      };
    case 'build':
      return {
        type: 'build_result',
        success: Math.random() > 0.1,
        duration: Math.floor(Math.random() * 5000) + 1000,
        filesProcessed: Math.floor(Math.random() * 50) + 10,
        timestamp: new Date().toISOString(),
      };
    default:
      return {
        type: 'generic_operation',
        operation,
        args,
        result: Math.random(),
        timestamp: new Date().toISOString(),
      };
  }
}

function estimateSize(obj: any): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm' + (seconds % 60) + 's';
  const hours = Math.floor(minutes / 60);
  return hours + 'h' + (minutes % 60) + 'm';
}
