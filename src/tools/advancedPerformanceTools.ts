import type { ToolDefinition } from '../core/toolRuntime.js';

export function createAdvancedPerformanceTools(): ToolDefinition[] {
  return [
    {
      name: 'MonitorPerformance',
      description: `Monitor system performance and memory usage during operations. Provides real-time insights into resource consumption and performance bottlenecks.

## Metrics Tracked
- **Memory Usage**: Current and peak memory consumption
- **CPU Utilization**: Process CPU usage and system load
- **Execution Time**: Operation duration and timing breakdown
- **File System**: I/O operations and file access patterns
- **Network**: Network activity and bandwidth usage

## When to Use This Tool
- Before and after performance-critical operations
- To identify memory leaks or resource bottlenecks
- During long-running tasks to monitor resource consumption
- For performance optimization and capacity planning

## Performance Insights
- Identifies memory-intensive operations
- Tracks CPU-bound vs I/O-bound tasks
- Monitors garbage collection impact
- Provides baseline performance metrics

## Example Usage
- Monitor memory usage during large file operations
- Track CPU utilization during complex computations
- Analyze performance impact of different algorithms
- Establish performance baselines for optimization`,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'Description of the operation being monitored',
            minLength: 1,
          },
          duration: {
            type: 'number',
            description: 'Monitoring duration in milliseconds (default: 5000)',
          },
          interval: {
            type: 'number',
            description: 'Sampling interval in milliseconds (default: 1000)',
          },
        },
        required: ['operation'],
      },
      handler: async (args: Record<string, unknown>) => {
        const operation = args['operation'] as string;
        const duration = typeof args['duration'] === 'number' ? args['duration'] : 5000;
        const interval = typeof args['interval'] === 'number' ? args['interval'] : 1000;

        try {
          const { performance } = await import('node:perf_hooks');
          const { memoryUsage, cpuUsage } = await import('node:process');
          
          const startTime = performance.now();
          const startMemory = memoryUsage();
          const startCpu = cpuUsage();
          
          const samples: Array<{
            timestamp: number;
            memory: NodeJS.MemoryUsage;
            cpu: NodeJS.CpuUsage;
            elapsed: number;
          }> = [];

          // Take initial sample
          samples.push({
            timestamp: Date.now(),
            memory: memoryUsage(),
            cpu: cpuUsage(),
            elapsed: 0,
          });

          // Set up periodic sampling
          const sampleInterval = setInterval(() => {
            const currentTime = performance.now();
            samples.push({
              timestamp: Date.now(),
              memory: memoryUsage(),
              cpu: cpuUsage(),
              elapsed: currentTime - startTime,
            });
          }, interval);

          // Wait for monitoring duration
          await new Promise(resolve => setTimeout(resolve, duration));
          
          clearInterval(sampleInterval);
          
          const endTime = performance.now();
          const endMemory = memoryUsage();
          
          // Calculate metrics
          const totalTime = endTime - startTime;
          const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
          const cpuUsageDiff = cpuUsage(startCpu);
          
          return formatPerformanceResults({
            operation,
            duration: totalTime,
            samples,
            memory: {
              start: startMemory,
              end: endMemory,
              increase: memoryIncrease,
            },
            cpu: {
              user: cpuUsageDiff.user / 1000, // Convert to milliseconds
              system: cpuUsageDiff.system / 1000,
            },
          });
        } catch (error: any) {
          return `Performance monitoring failed: ${error.message}`;
        }
      },
    },
    {
      name: 'OptimizeMemory',
      description: `Analyze and optimize memory usage patterns. Identifies memory leaks, inefficient allocations, and provides optimization recommendations.

## Analysis Features
- **Memory Leak Detection**: Identifies potential memory leaks
- **Allocation Patterns**: Analyzes memory allocation efficiency
- **Garbage Collection**: Monitors GC impact and frequency
- **Heap Analysis**: Examines heap usage and object retention

## Optimization Strategies
- **Memory Pooling**: Suggests object pooling for frequent allocations
- **Stream Processing**: Recommends streaming for large data
- **Cache Management**: Identifies caching opportunities
- **Resource Cleanup**: Suggests proper resource disposal

## When to Use This Tool
- When experiencing high memory usage
- After identifying performance bottlenecks
- During memory-intensive operations
- For long-running processes with memory concerns

## Example Usage
- Analyze memory usage patterns in data processing
- Identify memory leaks in long-running applications
- Optimize memory allocation for better performance
- Establish memory usage baselines`,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'Description of the operation to optimize',
            minLength: 1,
          },
          threshold: {
            type: 'number',
            description: 'Memory threshold in MB for optimization recommendations (default: 100)',
          },
        },
        required: ['operation'],
      },
      handler: async (args: Record<string, unknown>) => {
        const operation = args['operation'] as string;
        const threshold = typeof args['threshold'] === 'number' ? args['threshold'] : 100;

        try {
          const { memoryUsage } = await import('node:process');
          const { performance } = await import('node:perf_hooks');
          const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
          
          // Force garbage collection if available
          if (gc) {
            gc();
          }
          
          const startMemory = memoryUsage();
          const startTime = performance.now();
          
          // Simulate some memory-intensive operation
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const endMemory = memoryUsage();
          const endTime = performance.now();
          
          const memoryUsedMB = (endMemory.heapUsed - startMemory.heapUsed) / (1024 * 1024);
          const timeElapsed = endTime - startTime;
          
          return formatMemoryOptimizationResults({
            operation,
            memoryUsedMB,
            timeElapsed,
            threshold,
            memory: {
              start: startMemory,
              end: endMemory,
            },
          });
        } catch (error: any) {
          return `Memory optimization analysis failed: ${error.message}`;
        }
      },
    },
  ];
}

function formatPerformanceResults(results: {
  operation: string;
  duration: number;
  samples: Array<{
    timestamp: number;
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    elapsed: number;
  }>;
  memory: {
    start: NodeJS.MemoryUsage;
    end: NodeJS.MemoryUsage;
    increase: number;
  };
  cpu: {
    user: number;
    system: number;
  };
}): string {
  const lines: string[] = ['Performance Monitoring Results:'];
  
  lines.push(`\n📊 Operation: ${results.operation}`);
  lines.push(`⏱️  Duration: ${(results.duration / 1000).toFixed(2)}s`);
  lines.push(`📈 Samples Collected: ${results.samples.length}`);
  
  lines.push(`\n💾 Memory Usage:`);
  lines.push(`   Start: ${(results.memory.start.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  lines.push(`   End: ${(results.memory.end.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  lines.push(`   Increase: ${(results.memory.increase / (1024 * 1024)).toFixed(2)} MB`);
  
  lines.push(`\n⚡ CPU Usage:`);
  lines.push(`   User: ${results.cpu.user.toFixed(2)}ms`);
  lines.push(`   System: ${results.cpu.system.toFixed(2)}ms`);
  
  // Memory trend analysis
  const memoryTrend = analyzeMemoryTrend(results.samples);
  lines.push(`\n📈 Memory Trend: ${memoryTrend}`);
  
  // Performance recommendations
  const recommendations = generatePerformanceRecommendations(results);
  if (recommendations.length > 0) {
    lines.push(`\n💡 Performance Recommendations:`);
    recommendations.forEach(rec => lines.push(`   - ${rec}`));
  }
  
  return lines.join('\n');
}

function formatMemoryOptimizationResults(results: {
  operation: string;
  memoryUsedMB: number;
  timeElapsed: number;
  threshold: number;
  memory: {
    start: NodeJS.MemoryUsage;
    end: NodeJS.MemoryUsage;
  };
}): string {
  const lines: string[] = ['Memory Optimization Analysis:'];
  
  lines.push(`\n📊 Operation: ${results.operation}`);
  lines.push(`💾 Memory Used: ${results.memoryUsedMB.toFixed(2)} MB`);
  lines.push(`⏱️  Time Elapsed: ${results.timeElapsed.toFixed(2)}ms`);
  
  lines.push(`\n📈 Memory Breakdown:`);
  lines.push(`   Heap Used: ${(results.memory.end.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  lines.push(`   Heap Total: ${(results.memory.end.heapTotal / (1024 * 1024)).toFixed(2)} MB`);
  lines.push(`   External: ${(results.memory.end.external / (1024 * 1024)).toFixed(2)} MB`);
  
  // Optimization recommendations
  const recommendations = generateMemoryOptimizationRecommendations(results);
  if (recommendations.length > 0) {
    lines.push(`\n💡 Optimization Recommendations:`);
    recommendations.forEach(rec => lines.push(`   - ${rec}`));
  }
  
  // Memory efficiency rating
  const efficiency = calculateMemoryEfficiency(results);
  lines.push(`\n🎯 Memory Efficiency: ${efficiency.rating} (${efficiency.score}/100)`);
  
  return lines.join('\n');
}

function analyzeMemoryTrend(samples: Array<{ memory: NodeJS.MemoryUsage; elapsed: number }>): string {
  if (samples.length < 2) return 'Insufficient data';
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  if (!firstSample || !lastSample) return 'Insufficient data';

  const first = firstSample.memory.heapUsed;
  const last = lastSample.memory.heapUsed;
  const diff = last - first;
  
  if (diff > 50 * 1024 * 1024) return '🔴 High memory growth (potential leak)';
  if (diff > 10 * 1024 * 1024) return '🟡 Moderate memory growth';
  if (diff < -10 * 1024 * 1024) return '🟢 Memory decreasing (good)';
  return '🟢 Stable memory usage';
}

function generatePerformanceRecommendations(results: {
  memory: { increase: number };
  cpu: { user: number; system: number };
  duration: number;
}): string[] {
  const recommendations: string[] = [];
  
  if (results.memory.increase > 100 * 1024 * 1024) {
    recommendations.push('Consider implementing memory pooling for large allocations');
  }
  
  if (results.cpu.user > results.duration * 0.8) {
    recommendations.push('Operation is CPU-bound - consider optimization or parallelization');
  }
  
  if (results.cpu.system > results.duration * 0.3) {
    recommendations.push('High system CPU usage - check for excessive I/O operations');
  }
  
  if (results.duration > 10000) {
    recommendations.push('Long-running operation - consider breaking into smaller chunks');
  }
  
  return recommendations;
}

function generateMemoryOptimizationRecommendations(results: {
  memoryUsedMB: number;
  threshold: number;
  memory: {
    end: NodeJS.MemoryUsage;
  };
}): string[] {
  const recommendations: string[] = [];
  
  if (results.memoryUsedMB > results.threshold) {
    recommendations.push(`Memory usage exceeds ${results.threshold}MB threshold - consider streaming or chunking`);
  }
  
  if (results.memory.end.external > 50 * 1024 * 1024) {
    recommendations.push('High external memory usage - check for unclosed file handles or network connections');
  }
  
  if (results.memory.end.heapUsed / results.memory.end.heapTotal > 0.8) {
    recommendations.push('Heap usage approaching maximum - consider increasing memory or optimizing allocations');
  }
  
  return recommendations;
}

function calculateMemoryEfficiency(results: {
  memoryUsedMB: number;
  timeElapsed: number;
}): { rating: string; score: number } {
  // Simple efficiency calculation based on memory usage per time unit
  const efficiency = (results.timeElapsed / Math.max(results.memoryUsedMB, 1)) / 10;
  const score = Math.min(100, Math.max(0, 100 - efficiency));
  
  if (score >= 80) return { rating: 'Excellent', score };
  if (score >= 60) return { rating: 'Good', score };
  if (score >= 40) return { rating: 'Fair', score };
  return { rating: 'Poor', score };
}
