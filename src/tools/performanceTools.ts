import type { ToolDefinition } from '../core/toolRuntime.js';

export function createPerformanceTools(): ToolDefinition[] {
  return [
    {
      name: 'ParallelExecute',
      description: `Execute multiple independent bash commands in parallel to maximize efficiency. This tool is ideal for running multiple build steps, tests, or analysis commands simultaneously when they don't have dependencies on each other.

## When to Use This Tool
- Running multiple independent npm scripts (test, lint, build)
- Executing multiple file operations that can run concurrently
- Running multiple analysis or validation commands
- Any scenario where commands don't depend on each other's output

## Performance Benefits
- Reduces total execution time by running commands in parallel
- Better CPU utilization for multi-core systems
- Improved throughput for I/O-bound operations

## Usage Notes
- Only use for truly independent commands
- Commands run in separate processes with isolated environments
- Each command gets its own sandbox environment
- Results are collected and summarized when all complete

## Example Usage
- Run tests and linting in parallel
- Build multiple packages simultaneously
- Execute multiple analysis tools concurrently`,
      parameters: {
        type: 'object',
        properties: {
          commands: {
            type: 'array',
            description: 'Array of bash commands to execute in parallel',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
          timeout: {
            type: 'number',
            description: 'Maximum execution time in milliseconds for each command (default: 300000 = 5 minutes)',
          },
          workingDir: {
            type: 'string',
            description: 'Working directory for all commands (defaults to current workspace)',
          },
        },
        required: ['commands'],
      },
      handler: async (args: Record<string, unknown>) => {
        const commands = args['commands'] as string[];
        const timeout = typeof args['timeout'] === 'number' ? args['timeout'] : 300000;
        const workingDir = typeof args['workingDir'] === 'string' ? args['workingDir'] : process.cwd();

        if (!Array.isArray(commands) || commands.length === 0) {
          return 'Error: commands parameter must be a non-empty array of strings.';
        }

        try {
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execAsync = promisify(exec);
          const { buildSandboxEnv } = await import('./bashTools.js');

          const env = await buildSandboxEnv(workingDir);
          const results = await Promise.allSettled(
            commands.map(async (command) => {
              const startedAt = Date.now();
              try {
                const { stdout, stderr } = await execAsync(command, {
                  cwd: workingDir,
                  env,
                  timeout,
                  maxBuffer: 10 * 1024 * 1024, // 10MB
                });
                return {
                  command,
                  success: true,
                  stdout,
                  stderr,
                  elapsedMs: Date.now() - startedAt,
                };
              } catch (error: any) {
                return {
                  command,
                  success: false,
                  stdout: error?.stdout ?? '',
                  stderr: error?.stderr ?? '',
                  elapsedMs: Date.now() - startedAt,
                  errorMessage: error?.message ?? 'Command failed',
                };
              }
            })
          );

          return formatParallelResults(results.map(r => r.status === 'fulfilled' ? r.value : {
            command: 'Unknown',
            success: false,
            stdout: '',
            stderr: '',
            elapsedMs: 0,
            errorMessage: r.reason?.message ?? 'Unknown error',
          }));
        } catch (error: any) {
          return `Parallel execution failed: ${error.message}`;
        }
      },
    },
  ];
}

function formatParallelResults(results: Array<{
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  errorMessage?: string;
}>): string {
  const lines: string[] = ['Parallel Execution Summary:'];
  const totalTime = Math.max(...results.map(r => r.elapsedMs));
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  lines.push(`\nOverall: ${successCount}/${totalCount} commands succeeded (${(totalTime / 1000).toFixed(1)}s total)`);

  for (const result of results) {
    const icon = result.success ? '✓' : '✕';
    const duration = `(${(result.elapsedMs / 1000).toFixed(1)}s)`;
    lines.push(`\n- ${icon} ${result.command} ${duration}`);

    if (!result.success && result.errorMessage) {
      lines.push(`  Error: ${result.errorMessage}`);
    }

    const stdout = formatStream('stdout', result.stdout);
    if (stdout) {
      lines.push(`  ${stdout}`);
    }

    const stderr = formatStream('stderr', result.stderr);
    if (stderr) {
      lines.push(`  ${stderr}`);
    }
  }

  return lines.join('\n');
}

function formatStream(label: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const truncated = trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}...` : trimmed;
  return `${label}:\n${truncated}`;
}