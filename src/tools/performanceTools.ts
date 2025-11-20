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
            description:
              'Maximum execution time in milliseconds for each command (default: 300000 = 5 minutes)',
          },
          maxConcurrency: {
            type: 'number',
            description:
              'Maximum number of commands to run at once (defaults to CPU count). Use to avoid overwhelming the machine.',
          },
          failFast: {
            type: 'boolean',
            description:
              'Stop scheduling new commands after the first failure. Commands already running will finish.',
          },
          workingDir: {
            type: 'string',
            description:
              'Working directory for all commands (defaults to current workspace)',
          },
        },
        required: ['commands'],
      },
      handler: async (args: Record<string, unknown>) => {
        const timeout =
          typeof args['timeout'] === 'number' && args['timeout'] > 0
            ? args['timeout']
            : 300000;
        const workingDirArg =
          typeof args['workingDir'] === 'string'
            ? args['workingDir']
            : process.cwd();
        const maxConcurrencyArg =
          typeof args['maxConcurrency'] === 'number' ? args['maxConcurrency'] : null;
        const failFast = args['failFast'] === true;
        const rawCommands = Array.isArray(args['commands']) ? args['commands'] : [];
        const commands = rawCommands
          .map((value) => String(value).trim())
          .filter(Boolean);

        if (!commands.length) {
          return 'Error: commands parameter must be a non-empty array of strings.';
        }

        try {
          const { exec } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const { existsSync } = await import('node:fs');
          const { resolve } = await import('node:path');
          const { cpus } = await import('node:os');
          const execAsync = promisify(exec);
          const { buildSandboxEnv } = await import('./bashTools.js');

          const workingDir = resolve(workingDirArg);
          if (!existsSync(workingDir)) {
            return `Error: working directory not found: ${workingDir}`;
          }

          const cpuCount = cpus()?.length || 1;
          const defaultConcurrency = Math.max(
            1,
            Math.min(commands.length, cpuCount),
          );
          const maxConcurrency =
            maxConcurrencyArg && maxConcurrencyArg > 0
              ? Math.min(commands.length, Math.floor(maxConcurrencyArg))
              : defaultConcurrency;

          const env = await buildSandboxEnv(workingDir);
          const results = await runCommandsInBatches({
            commands,
            maxConcurrency,
            failFast,
            timeout,
            workingDir,
            execAsync,
            env,
          });

          return formatParallelResults(results);
        } catch (error: any) {
          return `Parallel execution failed: ${error.message}`;
        }
      },
    },
  ];
}

async function runCommandsInBatches(options: {
  commands: string[];
  maxConcurrency: number;
  failFast: boolean;
  timeout: number;
  workingDir: string;
  execAsync: (
    command: string,
    options: Record<string, unknown>,
  ) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;
  env: NodeJS.ProcessEnv;
}): Promise<
  Array<{
    command: string;
    success: boolean;
    stdout: string;
    stderr: string;
    elapsedMs: number;
    errorMessage?: string;
    exitCode?: number | null;
    signal?: string | null;
    skipped?: boolean;
  }>
> {
  const { commands, maxConcurrency, failFast, timeout, workingDir, execAsync, env } = options;
  const results: Array<
    | {
        command: string;
        success: boolean;
        stdout: string;
        stderr: string;
        elapsedMs: number;
        errorMessage?: string;
        exitCode?: number | null;
        signal?: string | null;
        skipped?: boolean;
      }
    | undefined
  > = new Array(commands.length);

  let index = 0;
  let stopScheduling = false;

  const runNext = async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const current = index++;
      if (current >= commands.length) {
        return;
      }

      const cmd = commands[current];
      if (!cmd) {
        continue;
      }

      if (failFast && stopScheduling) {
        results[current] = {
          command: cmd,
          success: false,
          stdout: '',
          stderr: '',
          elapsedMs: 0,
          skipped: true,
          errorMessage: 'Skipped due to fail-fast after a prior failure.',
        };
        continue;
      }

      const startedAt = Date.now();
      try {
        const { stdout, stderr } = await execAsync(cmd, {
          cwd: workingDir,
          env,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });
        results[current] = {
          command: cmd,
          success: true,
          stdout: normalizeStreamValue(stdout),
          stderr: normalizeStreamValue(stderr),
          elapsedMs: Date.now() - startedAt,
        };
      } catch (error: any) {
        results[current] = {
          command: cmd,
          success: false,
          stdout: normalizeStreamValue(error?.stdout),
          stderr: normalizeStreamValue(error?.stderr),
          elapsedMs: Date.now() - startedAt,
          errorMessage: error?.message ?? 'Command failed',
          exitCode: typeof error?.code === 'number' ? error.code : null,
          signal: typeof error?.signal === 'string' ? error.signal : null,
        };
        if (failFast) {
          stopScheduling = true;
        }
      }
    }
  };

  const workers = Array.from({ length: maxConcurrency }, () => runNext());
  await Promise.all(workers);

  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      const cmd = commands[i];
      results[i] = {
        command: cmd ?? 'unknown',
        success: false,
        stdout: '',
        stderr: '',
        elapsedMs: 0,
        skipped: true,
        errorMessage: 'Skipped after fail-fast',
      };
    }
  }

  return results as Array<{
    command: string;
    success: boolean;
    stdout: string;
    stderr: string;
    elapsedMs: number;
    errorMessage?: string;
    exitCode?: number | null;
    signal?: string | null;
    skipped?: boolean;
  }>;
}

function normalizeStreamValue(
  value: string | Buffer | null | undefined,
): string {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value : value.toString();
}

function formatParallelResults(
  results: Array<{
    command: string;
    success: boolean;
    stdout: string;
    stderr: string;
    elapsedMs: number;
    errorMessage?: string;
    exitCode?: number | null;
    signal?: string | null;
    skipped?: boolean;
  }>,
): string {
  const lines: string[] = ['Parallel Execution Summary:'];
  const totalTime = results.length ? Math.max(...results.map((r) => r.elapsedMs)) : 0;
  const successCount = results.filter((r) => r.success).length;
  const totalCount = results.length;

  lines.push(
    `\nOverall: ${successCount}/${totalCount} commands succeeded${
      totalCount ? ` (${(totalTime / 1000).toFixed(1)}s wall)` : ''
    }`,
  );

  for (const result of results) {
    const icon = result.skipped ? '-' : result.success ? '✓' : '✕';
    const duration = result.elapsedMs ? ` (${(result.elapsedMs / 1000).toFixed(1)}s)` : '';
    const label = result.skipped ? 'skipped' : result.command;
    lines.push(`\n- ${icon} ${label}${duration}`);

    if (!result.success && result.errorMessage) {
      const code = result.exitCode !== undefined && result.exitCode !== null ? ` (exit ${result.exitCode})` : '';
      const signal = result.signal ? ` signal ${result.signal}` : '';
      lines.push(`  Error: ${result.errorMessage}${code}${signal}`);
    }

    const stdout = formatStream('stdout', result.stdout);
    if (stdout && !result.skipped) {
      lines.push(`  ${stdout}`);
    }

    const stderr = formatStream('stderr', result.stderr);
    if (stderr && !result.skipped) {
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
  const truncated =
    trimmed.length > 1200 ? `${trimmed.slice(0, 1200)}...` : trimmed;
  return `${label}:\n${truncated}`;
}
