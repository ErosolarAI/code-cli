# Bo CLI - Performance Optimization Guide
**Version:** 1.0
**Date:** January 20, 2025

## Table of Contents
1. [Overview](#overview)
2. [Performance Profiling](#performance-profiling)
3. [Memory Optimization](#memory-optimization)
4. [Execution Speed](#execution-speed)
5. [Caching Strategies](#caching-strategies)
6. [Provider Optimization](#provider-optimization)
7. [Tool Optimization](#tool-optimization)
8. [Context Management](#context-management)
9. [Monitoring & Metrics](#monitoring--metrics)
10. [Best Practices](#best-practices)

---

## Overview

This guide provides comprehensive strategies for optimizing the performance of the Bo CLI. Whether you're experiencing slow response times, high memory usage, or excessive API costs, this guide will help you identify and resolve performance bottlenecks.

### Performance Goals
- **Response Time:** < 100ms for cached operations
- **Memory Usage:** < 500 MB for typical sessions
- **Cache Hit Rate:** > 30% for repeated operations
- **Token Efficiency:** Minimize unnecessary context in prompts
- **Error Rate:** < 5% under normal conditions

---

## Performance Profiling

### Using Built-in Profiling Tools

The Bo CLI includes comprehensive profiling capabilities:

```typescript
// Start profiling
start_profiling(name: "my-operation", sampleIntervalMs: 100)

// ... perform operations ...

// Stop and analyze
stop_profiling(name: "my-operation", format: "text")
```

**What Gets Profiled:**
- CPU usage (user and system time)
- Memory usage (RSS, heap, external)
- Event loop metrics
- Execution duration

### Interpreting Profile Results

```
=== Profile Analysis: "my-operation" ===

📊 Overview:
   Samples: 500
   Duration: 5.0s
   Sampling Rate: 100 samples/sec

💾 Memory Usage:
   Heap Used:
      Min: 145.2 MB
      Max: 198.7 MB
      Avg: 172.3 MB
```

**Key Indicators:**
- **High Memory Growth:** If Max >> Min, investigate memory leaks
- **High CPU Average:** Indicates compute-intensive operations
- **Frequent Spikes:** Suggests periodic heavy operations

### Node.js Performance APIs

```typescript
import { performance, PerformanceObserver } from 'node:perf_hooks';

// Mark start
performance.mark('operation-start');

// ... your code ...

// Mark end and measure
performance.mark('operation-end');
performance.measure('operation', 'operation-start', 'operation-end');

const measure = performance.getEntriesByName('operation')[0];
console.log(`Duration: ${measure.duration}ms`);
```

---

## Memory Optimization

### Memory Analysis

Use the built-in memory analyzer:

```typescript
analyze_memory_usage(detailed: true, format: "text")
```

### Common Memory Issues

#### 1. Large Conversation History

**Problem:** Conversation history grows unbounded
**Solution:** Enable context manager pruning

```typescript
const contextManager = createDefaultContextManager({
  maxTokens: 100000,
  reserveTokens: 10000,
  pruningStrategy: 'adaptive',
});
```

#### 2. Tool Output Caching

**Problem:** Cache grows without bounds
**Solution:** Configure cache TTL and limits

```typescript
const runtime = new ToolRuntime(tools, {
  enableCache: true,
  cacheTTLMs: 5 * 60 * 1000, // 5 minutes
});

// Periodically clear old entries
setInterval(() => {
  runtime.clearCache();
}, 10 * 60 * 1000); // Every 10 minutes
```

#### 3. Metrics Collection

**Problem:** Metrics accumulate in memory
**Solution:** Export and clear regularly

```typescript
// Export metrics hourly
setInterval(() => {
  export_metrics();
  clear_metrics(confirm: true);
}, 60 * 60 * 1000);
```

### Memory Leak Detection

**Signs of Memory Leaks:**
- Heap usage grows steadily over time
- Process memory (RSS) keeps increasing
- Garbage collection becomes frequent

**Detection Steps:**
1. Start profiling: `start_profiling(name: "leak-check")`
2. Run operations for extended period
3. Stop profiling: `stop_profiling(name: "leak-check")`
4. Analyze memory growth pattern

**Common Causes:**
- Event listeners not removed
- Circular references
- Large objects retained in closures
- Unbounded arrays or maps

---

## Execution Speed

### Tool Execution Optimization

#### Use Parallel Execution

```typescript
// Instead of sequential
const result1 = await runtime.execute(call1);
const result2 = await runtime.execute(call2);

// Use parallel when independent
const [result1, result2] = await Promise.all([
  runtime.execute(call1),
  runtime.execute(call2),
]);
```

#### Leverage Caching

Mark tools as cacheable:

```typescript
const tool: ToolDefinition = {
  name: 'ExpensiveOperation',
  description: 'Expensive but idempotent operation',
  cacheable: true, // Enable caching
  handler: async (args) => {
    // ... expensive operation ...
    return result;
  },
};
```

#### Optimize Hot Paths

Identify frequently called tools:

```typescript
view_tool_performance(limit: 10, sortBy: "calls")
```

Optimize the most-called tools:
- Reduce unnecessary computation
- Cache intermediate results
- Use efficient algorithms
- Minimize I/O operations

### Provider Call Optimization

#### Batch Operations

```typescript
// Instead of multiple small calls
for (const item of items) {
  await provider.generate(messages, tools);
}

// Batch into single call
const batchedMessages = items.map(item => ({
  role: 'user',
  content: `Process: ${item}`
}));
await provider.generate(batchedMessages, tools);
```

#### Use Streaming for Long Responses

```typescript
// For large responses, use streaming
for await (const chunk of provider.generateStream(messages, tools)) {
  if (chunk.type === 'content') {
    // Process incrementally
    processChunk(chunk.content);
  }
}
```

---

## Caching Strategies

### Tool Result Caching

**Default Cacheable Tools:**
- `Read` - File operations
- `Glob` - File pattern matching
- `Grep` - Content search
- Code analysis tools

**Cache Configuration:**

```typescript
const runtime = new ToolRuntime(tools, {
  enableCache: true,
  cacheTTLMs: 5 * 60 * 1000, // 5 minutes TTL
  maxCacheEntries: 200, // cap cache size to prevent memory bloat
  cacheSweepIntervalMs: 60_000, // sweep stale entries every minute
});
```

### Cache Metrics Analysis

```typescript
// Get cache statistics
const stats = runtime.getCacheStats();

console.log(`Cache hit rate: ${stats.hitRate}%`);
console.log(`Cache size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`Entries: ${stats.entries}/${stats.maxEntries}`);
console.log(`Evictions: ${stats.evictions}`);
```

**Optimization Tips:**
- Aim for > 30% hit rate for read-heavy workloads
- Monitor evictions and cache size to prevent memory issues
- Clear cache when size exceeds threshold
- Adjust TTL based on data freshness requirements

### Prompt Caching (Anthropic)

Enable prompt caching for repeated contexts:

```typescript
const provider = new AnthropicMessagesProvider({
  apiKey: 'your-key',
  model: 'claude-3-sonnet',
  enablePromptCaching: true, // Enable
});
```

**Benefits:**
- 90% cost reduction for cached prompts
- Faster response times
- Better for iterative conversations

---

## Provider Optimization

### Token Usage Optimization

#### 1. Minimize Context Window

```typescript
const contextManager = createDefaultContextManager({
  maxTokens: 100000,
  reserveTokens: 10000, // Reserve for response
  pruningStrategy: 'adaptive',
});
```

#### 2. Compress Tool Results

```typescript
const runtime = new ToolRuntime(tools, {
  contextManager, // Enables automatic truncation
});
```

#### 3. Monitor Token Usage

```typescript
view_provider_usage(format: "text")

// Output shows:
// - Total tokens: 45,238
// - Avg tokens per call: 1,077
// - Total cost: $0.1243
```

### API Call Optimization

#### Reduce Call Frequency

```typescript
// Batch multiple tool calls before returning to provider
const results = await Promise.all([
  runtime.execute(call1),
  runtime.execute(call2),
  runtime.execute(call3),
]);

// Return all results at once
```

#### Use Appropriate Model

```typescript
// For simple tasks, use faster/cheaper models
const haiku = new AnthropicMessagesProvider({
  model: 'claude-3-haiku',  // Fast and cheap
});

// For complex reasoning, use sonnet
const sonnet = new AnthropicMessagesProvider({
  model: 'claude-3-sonnet', // Balanced
});
```

### Rate Limit Handling

**Built-in Retry:**
- Automatic exponential backoff
- Respects rate limit headers
- Configurable retry attempts

```typescript
const provider = new AnthropicMessagesProvider({
  rateLimitMaxRetries: 4,
  rateLimitInitialDelayMs: 1500,
});
```

---

## Tool Optimization

### Efficient Tool Design

#### 1. Minimize I/O

```typescript
// Bad: Multiple file reads
for (const file of files) {
  const content = await fs.readFile(file);
  process(content);
}

// Good: Batch reads
const contents = await Promise.all(
  files.map(file => fs.readFile(file))
);
contents.forEach(process);
```

#### 2. Stream Large Data

```typescript
// Bad: Load entire file
const content = await fs.readFile('large-file.txt', 'utf-8');

// Good: Stream processing
const stream = fs.createReadStream('large-file.txt');
for await (const chunk of stream) {
  processChunk(chunk);
}
```

#### 3. Use Appropriate Data Structures

```typescript
// Bad: Array search O(n)
const found = array.find(item => item.id === targetId);

// Good: Map lookup O(1)
const found = map.get(targetId);
```

### Tool Execution Monitoring

```typescript
view_tool_performance(limit: 10, sortBy: "duration")

// Identify slow tools:
// - SlowTool: Avg 1,245.8ms per call
// - FastTool: Avg 23.4ms per call
```

### Optimization Strategies

**For Slow Tools:**
1. Profile the implementation
2. Identify bottlenecks (I/O, CPU, memory)
3. Apply targeted optimizations
4. Benchmark before/after
5. Monitor in production

---

## Context Management

### Token Budget Management

The context manager automatically manages token budgets:

```typescript
const contextManager = createDefaultContextManager({
  maxTokens: 100000,        // Total available
  reserveTokens: 10000,     // Reserve for response
  pruningStrategy: 'adaptive', // Smart pruning
});
```

### Pruning Strategies

#### 1. Adaptive Pruning
- Keeps recent messages
- Preserves important context
- Removes verbose tool outputs

#### 2. Sliding Window
- Keeps last N messages
- Simple and predictable
- May lose important context

#### 3. Importance-Based
- Ranks messages by importance
- Keeps critical information
- More CPU intensive

### Output Truncation

```typescript
// Automatic truncation for large tool outputs
const truncated = contextManager.truncateToolOutput(
  output,
  toolName
);

if (truncated.wasTruncated) {
  console.log(`Truncated: ${truncated.originalLength} → ${truncated.truncatedLength}`);
}
```

---

## Monitoring & Metrics

### Real-time Monitoring

```typescript
// View current metrics
view_metrics_summary(format: "text")

// Monitor tool performance
view_tool_performance(limit: 10, sortBy: "duration")

// Track provider usage
view_provider_usage(format: "text")
```

### Historical Analysis

```typescript
// Export metrics
export_metrics()

// Later, analyze trends
load_historical_metrics(filePath: "session-abc-2025-01-20.json")
```

### Key Performance Indicators (KPIs)

**Tool Execution:**
- Average duration < 500ms
- Success rate > 95%
- Cache hit rate > 30%

**Provider Calls:**
- Average duration < 3s
- Success rate > 98%
- Token efficiency (output/input ratio)

**System Health:**
- Memory usage < 500 MB
- CPU usage < 70%
- Error rate < 5%

### Alerting Thresholds

Set up monitoring for:

```typescript
const metrics = collector.getSummary();

// High error rate
if (metrics.tools.failed / metrics.tools.total > 0.1) {
  console.warn('⚠️  Tool error rate exceeds 10%');
}

// High memory usage
if (metrics.system.peakMemoryMb > 1000) {
  console.warn('⚠️  Memory usage exceeds 1 GB');
}

// High cost
if (metrics.providers.totalCost > 10) {
  console.warn('⚠️  API costs exceed $10 for session');
}
```

---

## Best Practices

### General Performance Tips

1. **Enable Caching:** Always enable caching for idempotent operations
2. **Use Streaming:** Stream large responses for better UX
3. **Batch Operations:** Group independent operations
4. **Monitor Metrics:** Track performance trends over time
5. **Profile Regularly:** Use profiling tools to identify bottlenecks

### Development Workflow

```bash
# Before optimization
start_profiling(name: "baseline")
# ... run operations ...
stop_profiling(name: "baseline")

# Apply optimizations
# ... make changes ...

# After optimization
start_profiling(name: "optimized")
# ... run same operations ...
stop_profiling(name: "optimized")

# Compare results
```

### Production Monitoring

```typescript
// Set up periodic exports
setInterval(() => {
  export_metrics();
}, 60 * 60 * 1000); // Hourly

// Monitor critical metrics
setInterval(() => {
  const metrics = collector.getSummary();

  if (metrics.system.errorRate > 0.05) {
    alertOps('High error rate detected');
  }

  if (metrics.system.peakMemoryMb > 1000) {
    alertOps('High memory usage detected');
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

### Code Quality

**Write Efficient Code:**
```typescript
// Bad: Inefficient algorithm
const result = array.filter(x => x > 10)
                    .map(x => x * 2)
                    .filter(x => x < 100);

// Good: Single pass
const result = array.reduce((acc, x) => {
  if (x > 10) {
    const doubled = x * 2;
    if (doubled < 100) {
      acc.push(doubled);
    }
  }
  return acc;
}, []);
```

**Avoid Memory Leaks:**
```typescript
// Bad: Event listener not removed
emitter.on('event', handler);

// Good: Remove when done
emitter.on('event', handler);
// ... later ...
emitter.off('event', handler);
```

**Use Appropriate Async Patterns:**
```typescript
// Bad: Sequential when could be parallel
await operation1();
await operation2();

// Good: Parallel execution
await Promise.all([operation1(), operation2()]);
```

---

## Performance Checklist

### Before Deployment
- [ ] Run full profiling on critical paths
- [ ] Verify cache hit rates are acceptable (> 30%)
- [ ] Check memory usage under load (< 500 MB)
- [ ] Validate error rates are low (< 5%)
- [ ] Review token usage and costs
- [ ] Test with realistic data volumes
- [ ] Benchmark against performance goals

### Ongoing Monitoring
- [ ] Export metrics regularly
- [ ] Analyze performance trends
- [ ] Investigate performance regressions
- [ ] Optimize high-frequency operations
- [ ] Review and adjust cache settings
- [ ] Monitor API costs
- [ ] Track error patterns

### Optimization Process
1. **Measure:** Establish baseline metrics
2. **Analyze:** Identify bottlenecks using profiling
3. **Optimize:** Apply targeted improvements
4. **Verify:** Measure improvement with metrics
5. **Deploy:** Roll out optimizations
6. **Monitor:** Watch for regressions

---

## Common Performance Issues

### Issue: Slow Tool Execution

**Symptoms:**
- Tool calls take > 1 second
- High CPU usage during execution

**Diagnosis:**
```typescript
view_tool_performance(sortBy: "duration")
start_profiling(name: "slow-tool")
// Execute slow tool
stop_profiling(name: "slow-tool")
```

**Solutions:**
- Optimize algorithm complexity
- Add caching for repeated operations
- Use streaming for large data
- Parallelize independent operations

### Issue: High Memory Usage

**Symptoms:**
- Process memory > 500 MB
- Heap usage > 90%
- Frequent garbage collection

**Diagnosis:**
```typescript
analyze_memory_usage(detailed: true)
start_profiling(name: "memory-check")
// Run operations
stop_profiling(name: "memory-check")
```

**Solutions:**
- Clear caches regularly
- Reduce conversation history
- Use streaming instead of loading everything
- Fix memory leaks

### Issue: High API Costs

**Symptoms:**
- Token usage > expected
- High cost per session

**Diagnosis:**
```typescript
view_provider_usage(format: "text")
```

**Solutions:**
- Enable prompt caching
- Truncate tool outputs
- Use cheaper models when appropriate
- Reduce context window size
- Batch operations

### Issue: Low Cache Hit Rate

**Symptoms:**
- Cache hit rate < 20%
- Many redundant operations

**Diagnosis:**
```typescript
const stats = runtime.getCacheStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Evictions: ${stats.evictions} (capacity ${stats.maxEntries})`);
```

**Solutions:**
- Increase cache TTL
- Normalize cache keys
- Mark more tools as cacheable
- Reduce cache thrash by increasing `maxCacheEntries` if evictions spike
- Review caching strategy

---

## Advanced Techniques

### Custom Performance Middleware

```typescript
class PerformanceMiddleware implements ToolRuntimeObserver {
  onToolStart(call: ToolCallRequest) {
    performance.mark(`${call.id}-start`);
  }

  onToolResult(call: ToolCallRequest, output: string) {
    performance.mark(`${call.id}-end`);
    performance.measure(
      `tool-${call.name}`,
      `${call.id}-start`,
      `${call.id}-end`
    );
  }
}

const runtime = new ToolRuntime(tools, {
  observer: new PerformanceMiddleware(),
});
```

### Custom Caching Strategy

```typescript
class SmartCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Custom TTL based on data type
    const ttl = this.getTTL(key);
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private getTTL(key: string): number {
    if (key.startsWith('code-')) return 60 * 60 * 1000; // 1 hour
    if (key.startsWith('file-')) return 5 * 60 * 1000;  // 5 minutes
    return 10 * 60 * 1000; // 10 minutes default
  }
}
```

---

## Resources

### Tools
- **Built-in Profiling:** Use `start_profiling` / `stop_profiling`
- **Memory Analysis:** Use `analyze_memory_usage`
- **Metrics Viewing:** Use `view_metrics_summary`
- **Performance Monitoring:** Use `view_tool_performance`

### External Tools
- **Node.js --prof:** CPU profiling
- **clinic.js:** Performance diagnostics
- **0x:** Flame graph generation
- **autocannon:** Load testing

### Further Reading
- Node.js Performance Best Practices
- V8 Optimization Techniques
- Memory Management in Node.js
- Caching Strategies for Web Applications

---

## Conclusion

Performance optimization is an ongoing process. Use the tools and techniques in this guide to:

1. **Establish Baselines:** Know your current performance
2. **Identify Bottlenecks:** Use profiling and metrics
3. **Apply Optimizations:** Target high-impact areas
4. **Measure Results:** Verify improvements
5. **Monitor Continuously:** Catch regressions early

Remember: **Premature optimization is the root of all evil.** Always measure before optimizing, and focus on the bottlenecks that matter most to your users.

---

**Version:** 1.0
**Last Updated:** January 20, 2025
**Maintainers:** Bo CLI Team
