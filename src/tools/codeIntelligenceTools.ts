import type { ToolDefinition } from '../core/toolRuntime.js';

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
          
          // Find files matching the pattern
          const files = globSync(path, { nodir: true });
          
          if (files.length === 0) {
            return `No files found matching pattern: ${path}`;
          }

          const results: Array<{
            file: string;
            functions: Array<{
              name: string;
              line: number;
              cyclomatic: number;
              cognitive: number;
              maintainability: number;
              lines: number;
              params: number;
              depth: number;
            }>;
            summary: {
              totalFunctions: number;
              highComplexity: number;
              avgCyclomatic: number;
              avgCognitive: number;
              avgMaintainability: number;
            };
          }> = [];

          for (const file of files) {
            const content = readFileSync(file, 'utf8');
            const analysis = analyzeFileComplexity(content, file);
            results.push(analysis);
          }

          return formatComplexityResults(results, threshold);
        } catch (error: any) {
          return `Complexity analysis failed: ${error.message}`;
        }
      },
    },
  ];
}

function analyzeFileComplexity(content: string, filePath: string): {
  file: string;
  functions: Array<{
    name: string;
    line: number;
    cyclomatic: number;
    cognitive: number;
    maintainability: number;
    lines: number;
    params: number;
    depth: number;
  }>;
  summary: {
    totalFunctions: number;
    highComplexity: number;
    avgCyclomatic: number;
    avgCognitive: number;
    avgMaintainability: number;
  };
} {
  const functions: Array<{
    name: string;
    line: number;
    cyclomatic: number;
    cognitive: number;
    maintainability: number;
    lines: number;
    params: number;
    depth: number;
  }> = [];

  // Simple regex-based analysis for demonstration
  // In a real implementation, you'd use a proper AST parser
  const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>|(?:async\s*)?(\w+)\s*\(([^)]*)\)\s*{)/g;
  
  let match;
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1] || match[2] || match[4] || 'anonymous';
    const params = (match[3] || match[5] || '').split(',').filter(p => p.trim()).length;
    const line = content.substring(0, match.index).split('\n').length;
    
    // Estimate complexity based on code patterns
    const cyclomatic = estimateCyclomaticComplexity(content, match.index);
    const cognitive = estimateCognitiveComplexity(content, match.index);
    const maintainability = estimateMaintainability(cyclomatic, cognitive, params);
    const depth = estimateNestingDepth(content, match.index);
    const functionLines = estimateFunctionLines(content, match.index);
    
    functions.push({
      name,
      line,
      cyclomatic,
      cognitive,
      maintainability,
      lines: functionLines,
      params,
      depth,
    });
  }

  const totalFunctions = functions.length;
  const highComplexity = functions.filter(f => f.cyclomatic > 10 || f.cognitive > 15).length;
  const avgCyclomatic = functions.reduce((sum, f) => sum + f.cyclomatic, 0) / totalFunctions || 0;
  const avgCognitive = functions.reduce((sum, f) => sum + f.cognitive, 0) / totalFunctions || 0;
  const avgMaintainability = functions.reduce((sum, f) => sum + f.maintainability, 0) / totalFunctions || 0;

  return {
    file: filePath,
    functions,
    summary: {
      totalFunctions,
      highComplexity,
      avgCyclomatic,
      avgCognitive,
      avgMaintainability,
    },
  };
}

function estimateCyclomaticComplexity(content: string, startIndex: number): number {
  const functionBody = extractFunctionBody(content, startIndex);
  if (!functionBody) return 1;
  
  // Count decision points
  const decisions = (functionBody.match(/\b(if|else if|for|while|do|case|catch|\?|&&|\|\|)\b/g) || []).length;
  return Math.max(1, decisions + 1);
}

function estimateCognitiveComplexity(content: string, startIndex: number): number {
  const functionBody = extractFunctionBody(content, startIndex);
  if (!functionBody) return 1;
  
  // Count nested structures with increased weight
  const nestedIf = (functionBody.match(/\bif\s*\([^{]*\{[^{}]*\}/g) || []).length;
  const nestedLoops = (functionBody.match(/\b(for|while)\s*\([^{]*\{[^{}]*\}/g) || []).length;
  const switches = (functionBody.match(/\bswitch\s*\(/g) || []).length;
  
  return 1 + nestedIf * 2 + nestedLoops * 2 + switches * 3;
}

function estimateMaintainability(cyclomatic: number, cognitive: number, params: number): number {
  // Simple maintainability estimation
  const baseScore = 100;
  const cyclomaticPenalty = Math.min(cyclomatic * 2, 30);
  const cognitivePenalty = Math.min(cognitive * 1.5, 25);
  const paramPenalty = Math.min(params * 3, 15);
  
  return Math.max(0, baseScore - cyclomaticPenalty - cognitivePenalty - paramPenalty);
}

function estimateNestingDepth(content: string, startIndex: number): number {
  const functionBody = extractFunctionBody(content, startIndex);
  if (!functionBody) return 0;
  
  let depth = 0;
  let maxDepth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < functionBody.length; i++) {
    const char = functionBody[i];
    
    // Handle string literals
    if ((char === '"' || char === "'") && (i === 0 || functionBody[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}') {
      depth--;
    }
  }
  
  return maxDepth;
}

function estimateFunctionLines(content: string, startIndex: number): number {
  const functionBody = extractFunctionBody(content, startIndex);
  if (!functionBody) return 1;
  return functionBody.split('\n').length;
}

function extractFunctionBody(content: string, startIndex: number): string | null {
  // Find the opening brace after the function declaration
  let braceIndex = content.indexOf('{', startIndex);
  if (braceIndex === -1) return null;
  
  let depth = 1;
  let i = braceIndex + 1;
  let inString = false;
  let stringChar = '';
  
  while (i < content.length && depth > 0) {
    const char = content[i];
    
    // Handle string literals
    if ((char === '"' || char === "'") && (i === 0 || content[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }
    
    if (inString) {
      i++;
      continue;
    }
    
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
    
    i++;
  }
  
  if (depth === 0) {
    return content.substring(braceIndex + 1, i - 1);
  }
  
  return null;
}

function formatComplexityResults(
  results: Array<{
    file: string;
    functions: Array<{
      name: string;
      line: number;
      cyclomatic: number;
      cognitive: number;
      maintainability: number;
      lines: number;
      params: number;
      depth: number;
    }>;
    summary: {
      totalFunctions: number;
      highComplexity: number;
      avgCyclomatic: number;
      avgCognitive: number;
      avgMaintainability: number;
    };
  }>,
  threshold: number
): string {
  const lines: string[] = ['Code Complexity Analysis Results:'];
  
  for (const result of results) {
    lines.push(`\n📄 ${result.file}`);
    lines.push(`   Functions: ${result.summary.totalFunctions} | High Complexity: ${result.summary.highComplexity}`);
    lines.push(`   Avg Cyclomatic: ${result.summary.avgCyclomatic.toFixed(1)} | Avg Cognitive: ${result.summary.avgCognitive.toFixed(1)}`);
    lines.push(`   Avg Maintainability: ${result.summary.avgMaintainability.toFixed(1)}`);
    
    // Show high complexity functions
    const highComplexityFunctions = result.functions.filter(f => 
      f.cyclomatic > threshold || f.cognitive > threshold
    );
    
    if (highComplexityFunctions.length > 0) {
      lines.push(`\n   🔴 High Complexity Functions:`);
      for (const func of highComplexityFunctions) {
        const cyclomaticIcon = func.cyclomatic > threshold ? '🔴' : '🟡';
        const cognitiveIcon = func.cognitive > threshold ? '🔴' : '🟡';
        lines.push(`      ${func.name} (line ${func.line})`);
        lines.push(`        ${cyclomaticIcon} Cyclomatic: ${func.cyclomatic} | ${cognitiveIcon} Cognitive: ${func.cognitive}`);
        lines.push(`        📏 Lines: ${func.lines} | 🎯 Params: ${func.params} | 📊 Depth: ${func.depth}`);
        lines.push(`        🛠️  Maintainability: ${func.maintainability.toFixed(1)}`);
      }
    }
  }
  
  // Overall summary
  const totalFiles = results.length;
  const totalFunctions = results.reduce((sum, r) => sum + r.summary.totalFunctions, 0);
  const totalHighComplexity = results.reduce((sum, r) => sum + r.summary.highComplexity, 0);
  
  lines.push(`\n📊 Overall Summary:`);
  lines.push(`   Files Analyzed: ${totalFiles}`);
  lines.push(`   Total Functions: ${totalFunctions}`);
  lines.push(`   High Complexity Functions: ${totalHighComplexity} (${((totalHighComplexity / totalFunctions) * 100).toFixed(1)}%)`);
  
  return lines.join('\n');
}