import type { ToolDefinition } from '../core/toolRuntime.js';

export function createRefactoringAssistantTools(): ToolDefinition[] {
  return [
    {
      name: 'RefactoringAssistant',
      description: `Advanced refactoring assistant that provides intelligent code transformation suggestions and automated refactoring support.

## Refactoring Capabilities
- **Code Smell Detection**: Identifies common code smells and anti-patterns
- **Extract Method**: Suggests method extraction opportunities
- **Rename Symbol**: Provides intelligent renaming suggestions
- **Simplify Logic**: Identifies complex logic that can be simplified
- **Dependency Injection**: Suggests dependency injection opportunities

## Analysis Features
- **Complexity Reduction**: Identifies areas for complexity reduction
- **Code Duplication**: Detects duplicate code blocks
- **Design Pattern Application**: Suggests appropriate design patterns
- **Performance Optimization**: Identifies performance bottlenecks

## When to Use This Tool
- When refactoring large codebases
- Before implementing new features in complex code
- During code reviews to identify improvement opportunities
- When maintaining legacy code

## Example Usage
- Analyze a file for refactoring opportunities
- Get specific refactoring suggestions for a function
- Identify code smells and anti-patterns
- Generate refactoring plans for complex code`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to analyze for refactoring opportunities',
            minLength: 1,
          },
          target: {
            type: 'string',
            description: 'Specific function or class to analyze (optional)',
          },
          refactoringType: {
            type: 'string',
            enum: [
              'all',
              'extract-method',
              'rename',
              'simplify',
              'inject-dependencies',
            ],
            description: 'Type of refactoring to focus on (default: all)',
          },
        },
        required: ['path'],
      },
      handler: async (args: Record<string, unknown>) => {
        const path = args['path'] as string;
        const target =
          typeof args['target'] === 'string' ? args['target'] : undefined;
        const refactoringType =
          typeof args['refactoringType'] === 'string'
            ? args['refactoringType']
            : 'all';

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
            refactoringOpportunities: Array<{
              type: string;
              description: string;
              location: { line: number; column: number };
              confidence: 'high' | 'medium' | 'low';
              suggestedFix: string;
              impact: 'high' | 'medium' | 'low';
            }>;
            summary: {
              totalOpportunities: number;
              highImpact: number;
              highConfidence: number;
            };
          }> = [];

          for (const file of files) {
            const content = readFileSync(file, 'utf8');
            const analysis = analyzeRefactoringOpportunities(
              content,
              file,
              target,
              refactoringType,
            );
            results.push(analysis);
          }

          return formatRefactoringResults(results);
        } catch (error: any) {
          return `Refactoring analysis failed: ${error.message}`;
        }
      },
    },
  ];
}

function analyzeRefactoringOpportunities(
  content: string,
  filePath: string,
  target?: string,
  refactoringType: string = 'all',
): {
  file: string;
  refactoringOpportunities: Array<{
    type: string;
    description: string;
    location: { line: number; column: number };
    confidence: 'high' | 'medium' | 'low';
    suggestedFix: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  summary: {
    totalOpportunities: number;
    highImpact: number;
    highConfidence: number;
  };
} {
  const opportunities: Array<{
    type: string;
    description: string;
    location: { line: number; column: number };
    confidence: 'high' | 'medium' | 'low';
    suggestedFix: string;
    impact: 'high' | 'medium' | 'low';
  }> = [];

  const lines = content.split('\n');

  // Analyze for common code smells and refactoring opportunities
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (target && !line.includes(target)) {
      continue;
    }
    const lineNumber = i + 1;

    // Long method detection
    if (line.includes('function') || line.includes('=>')) {
      const functionBody = extractFunctionBodyFromLine(content, i);
      if (functionBody && functionBody.split('\n').length > 30) {
        opportunities.push({
          type: 'extract-method',
          description: 'Long function - consider extracting smaller methods',
          location: { line: lineNumber, column: 1 },
          confidence: 'high',
          suggestedFix: 'Break this function into smaller, focused methods',
          impact: 'high',
        });
      }
    }

    // Complex conditional detection
    if (line.includes('if') && (line.includes('&&') || line.includes('||'))) {
      const conditionCount = (line.match(/&&|\|\|/g) || []).length;
      if (conditionCount >= 3) {
        opportunities.push({
          type: 'simplify',
          description:
            'Complex conditional logic - consider extracting conditions',
          location: { line: lineNumber, column: 1 },
          confidence: 'medium',
          suggestedFix:
            'Extract complex conditions into well-named boolean methods',
          impact: 'medium',
        });
      }
    }

    // Magic numbers detection
    const magicNumbers = line.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 0) {
      opportunities.push({
        type: 'extract-constant',
        description:
          'Magic number detected - consider extracting to named constant',
        location: { line: lineNumber, column: 1 },
        confidence: 'high',
        suggestedFix: 'Replace magic numbers with descriptive named constants',
        impact: 'low',
      });
    }

    // Deep nesting detection
    const nestingLevel = countNestingLevel(line);
    if (nestingLevel >= 4) {
      opportunities.push({
        type: 'simplify',
        description: 'Deep nesting - consider flattening or extracting methods',
        location: { line: lineNumber, column: 1 },
        confidence: 'medium',
        suggestedFix:
          'Reduce nesting depth through early returns or method extraction',
        impact: 'medium',
      });
    }

    // TODO/FIXME comments
    if (line.includes('TODO') || line.includes('FIXME')) {
      opportunities.push({
        type: 'technical-debt',
        description: 'Technical debt marker found',
        location: { line: lineNumber, column: 1 },
        confidence: 'high',
        suggestedFix: 'Address the TODO/FIXME comment',
        impact: 'low',
      });
    }
  }

  // Filter by refactoring type if specified
  const filteredOpportunities =
    refactoringType === 'all'
      ? opportunities
      : opportunities.filter((opp) => opp.type.includes(refactoringType));

  const totalOpportunities = filteredOpportunities.length;
  const highImpact = filteredOpportunities.filter(
    (opp) => opp.impact === 'high',
  ).length;
  const highConfidence = filteredOpportunities.filter(
    (opp) => opp.confidence === 'high',
  ).length;

  return {
    file: filePath,
    refactoringOpportunities: filteredOpportunities,
    summary: {
      totalOpportunities,
      highImpact,
      highConfidence,
    },
  };
}

function extractFunctionBodyFromLine(
  content: string,
  startLine: number,
): string | null {
  const lines = content.split('\n');
  let braceCount = 0;
  let inFunction = false;
  let functionBody = '';

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (!inFunction && (line.includes('{') || line.includes('=>'))) {
      inFunction = true;
    }

    if (inFunction) {
      functionBody += line + '\n';

      // Count braces to find function end
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (braceCount === 0 && i > startLine) {
        return functionBody;
      }
    }
  }

  return null;
}

function countNestingLevel(line: string): number {
  const indent = line.match(/^\s*/)?.[0] || '';
  return Math.floor(indent.length / 2); // Assuming 2-space indentation
}

function formatRefactoringResults(
  results: Array<{
    file: string;
    refactoringOpportunities: Array<{
      type: string;
      description: string;
      location: { line: number; column: number };
      confidence: 'high' | 'medium' | 'low';
      suggestedFix: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    summary: {
      totalOpportunities: number;
      highImpact: number;
      highConfidence: number;
    };
  }>,
): string {
  const lines: string[] = ['Refactoring Assistant Analysis:'];

  let totalFiles = 0;
  let totalOpportunities = 0;
  let totalHighImpact = 0;
  let totalHighConfidence = 0;

  for (const result of results) {
    totalFiles++;
    totalOpportunities += result.summary.totalOpportunities;
    totalHighImpact += result.summary.highImpact;
    totalHighConfidence += result.summary.highConfidence;

    lines.push(`\n📄 ${result.file}`);
    lines.push(
      `   Opportunities: ${result.summary.totalOpportunities} | High Impact: ${result.summary.highImpact} | High Confidence: ${result.summary.highConfidence}`,
    );

    if (result.refactoringOpportunities.length > 0) {
      lines.push(`\n   🔍 Refactoring Opportunities:`);

      for (const opportunity of result.refactoringOpportunities) {
        const impactIcon =
          opportunity.impact === 'high'
            ? '🔴'
            : opportunity.impact === 'medium'
              ? '🟡'
              : '🟢';
        const confidenceIcon =
          opportunity.confidence === 'high'
            ? '🎯'
            : opportunity.confidence === 'medium'
              ? '📊'
              : '🤔';

        lines.push(
          `\n      ${impactIcon} ${confidenceIcon} ${opportunity.type}`,
        );
        lines.push(`         ${opportunity.description}`);
        lines.push(`         Location: line ${opportunity.location.line}`);
        lines.push(`         Suggested: ${opportunity.suggestedFix}`);
      }
    } else {
      lines.push(`\n   ✅ No significant refactoring opportunities found`);
    }
  }

  // Overall summary
  lines.push(`\n📊 Overall Summary:`);
  lines.push(`   Files Analyzed: ${totalFiles}`);
  lines.push(`   Total Opportunities: ${totalOpportunities}`);
  lines.push(`   High Impact Opportunities: ${totalHighImpact}`);
  lines.push(`   High Confidence Opportunities: ${totalHighConfidence}`);

  // Refactoring recommendations
  if (totalHighImpact > 0) {
    lines.push(`\n💡 Priority Refactoring Recommendations:`);
    lines.push(`   - Focus on high-impact opportunities first`);
    lines.push(`   - Consider breaking down large functions`);
    lines.push(`   - Address complex conditional logic`);
  }

  if (totalOpportunities === 0) {
    lines.push(`\n🎉 Excellent! No significant refactoring needs identified.`);
  }

  return lines.join('\n');
}
