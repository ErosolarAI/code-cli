import type { ToolDefinition } from '../core/toolRuntime.js';
import type { FileComplexityReport } from '../utils/complexityMetrics.js';
import { analyzeFileComplexity } from '../utils/complexityMetrics.js';

export function createCodeIntelligenceTools(): ToolDefinition[] {
  return [
    {
      name: 'AnalyzeCodeComplexity',
      description: `Analyze code complexity metrics for TypeScript/JavaScript files including cyclomatic complexity, cognitive complexity, and maintainability index.

## Metrics Analyzed
- **Cyclomatic Complexity**: Number of linearly independent paths through code
- **Cognitive Complexity**: How difficult code is to understand for humans
- **Maintainability Index**: Overall maintainability score (0-100)
- **Function Length**: Number of lines per function
- **Parameter Count**: Number of function parameters
- **Nesting Depth**: Maximum nesting level

## When to Use This Tool
- Before refactoring complex code
- To identify code quality hotspots
- For code review prioritization
- To establish complexity baselines

## Interpretation Guidelines
- **Cyclomatic Complexity**: <10 (good), 10-20 (moderate), >20 (high)
- **Cognitive Complexity**: <15 (good), 15-25 (moderate), >25 (high)
- **Maintainability**: >85 (excellent), 65-85 (good), <65 (poor)

## Example Usage
- Analyze a specific file for complexity hotspots
- Compare complexity across multiple files
- Identify functions that need refactoring`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to analyze (supports glob patterns for multiple files)',
            minLength: 1,
          },
          threshold: {
            type: 'number',
            description: 'Complexity threshold for highlighting (default: 15)',
          },
        },
        required: ['path'],
      },
      handler: async (args: Record<string, unknown>) => {
        const path = args['path'] as string;
        const threshold = typeof args['threshold'] === 'number' ? args['threshold'] : 15;

        try {
          const { readFileSync } = await import('node:fs');
          const { globSync } = await import('glob');

          const files = globSync(path, { nodir: true });
          if (files.length === 0) {
            return `No files found matching pattern: ${path}`;
          }

          const results: FileComplexityReport[] = [];
          for (const file of files) {
            const content = readFileSync(file, 'utf8');
            results.push(analyzeFileComplexity(content, file, threshold));
          }

          return formatComplexityResults(results, threshold);
        } catch (error: any) {
          return `Complexity analysis failed: ${error.message}`;
        }
      },
    },
  ];
}

function formatComplexityResults(results: FileComplexityReport[], threshold: number): string {
  const lines: string[] = ['Code Complexity Analysis'];

  for (const result of results) {
    lines.push(`\nFile: ${result.file}`);
    if (!result.functions.length) {
      lines.push('  No functions found in file.');
      continue;
    }

    lines.push(
      `  Functions: ${result.summary.totalFunctions} | High complexity: ${result.summary.highComplexity}`,
    );
    lines.push(
      `  Averages -> Cyclomatic: ${formatNumber(result.summary.avgCyclomatic)}, Cognitive: ${formatNumber(result.summary.avgCognitive)}, Maintainability: ${formatNumber(result.summary.avgMaintainability)}`,
    );

    const hotspots = result.functions.filter(
      (fn) => fn.cyclomatic > threshold || fn.cognitive > threshold,
    );
    if (hotspots.length) {
      lines.push('  Hotspots:');
      for (const fn of hotspots) {
        const cycloFlag = fn.cyclomatic > threshold ? 'high' : 'ok';
        const cognitiveFlag = fn.cognitive > threshold ? 'high' : 'ok';
        lines.push(
          `    - ${fn.name} (line ${fn.line}) cyclomatic=${fn.cyclomatic} (${cycloFlag}), cognitive=${fn.cognitive} (${cognitiveFlag}), maintainability=${formatNumber(fn.maintainability)}`,
        );
        lines.push(`      lines=${fn.lines}, params=${fn.params}, depth=${fn.depth}`);
      }
    }
  }

  const totalFiles = results.length;
  const totalFunctions = results.reduce((sum, entry) => sum + entry.summary.totalFunctions, 0);
  const totalHigh = results.reduce((sum, entry) => sum + entry.summary.highComplexity, 0);
  const totalCyclomatic = results.reduce(
    (sum, entry) => sum + entry.summary.avgCyclomatic * entry.summary.totalFunctions,
    0,
  );
  const totalCognitive = results.reduce(
    (sum, entry) => sum + entry.summary.avgCognitive * entry.summary.totalFunctions,
    0,
  );
  const totalMaintainability = results.reduce(
    (sum, entry) => sum + entry.summary.avgMaintainability * entry.summary.totalFunctions,
    0,
  );

  const avgCyclomatic = totalFunctions ? totalCyclomatic / totalFunctions : 0;
  const avgCognitive = totalFunctions ? totalCognitive / totalFunctions : 0;
  const avgMaintainability = totalFunctions ? totalMaintainability / totalFunctions : 0;
  const highPercentage = totalFunctions ? (totalHigh / totalFunctions) * 100 : 0;

  lines.push('\nOverall Summary:');
  lines.push(`  Files analyzed: ${totalFiles}`);
  lines.push(`  Functions analyzed: ${totalFunctions}`);
  lines.push(
    `  High complexity functions: ${totalHigh}${totalFunctions ? ` (${highPercentage.toFixed(1)}%)` : ''}`,
  );
  lines.push(
    `  Averages -> Cyclomatic: ${formatNumber(avgCyclomatic)}, Cognitive: ${formatNumber(avgCognitive)}, Maintainability: ${formatNumber(avgMaintainability)}`,
  );

  return lines.join('\n');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return value.toFixed(1);
}
