import type { ToolCallRequest } from './types.js';
import type { ToolDefinition } from './toolRuntime.js';
import type { TaskSpec } from './taskContracts.js';

export type PolicyAction = 'allow' | 'block' | 'dry-run';

export interface PolicyConfig {
  toolAllowlist?: string[];
  toolDenylist?: string[];
  maxRuntimeMs?: number;
  maxFileSizeBytes?: number;
}

export interface ToolPolicyDecision {
  action: PolicyAction;
  reason?: string;
  sanitizedArguments?: Record<string, unknown>;
  preview?: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface ToolPolicy {
  evaluate(call: ToolCallRequest, tool?: ToolDefinition): ToolPolicyDecision | null;
  setConfig?(config: Partial<PolicyConfig>): void;
  getConfigSnapshot?(): PolicyConfig;
}

type SpecProvider = () => TaskSpec | null;

export class PolicyEngine implements ToolPolicy {
  private readonly specProvider?: SpecProvider;
  private spec: TaskSpec | null = null;
  private config: PolicyConfig = {};

  constructor(specProvider?: SpecProvider, config: Partial<PolicyConfig> = {}) {
    this.specProvider = specProvider;
    this.setConfig(config);
  }

  setTaskSpec(spec: TaskSpec | null): void {
    this.spec = spec;
  }

  setConfig(config: Partial<PolicyConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      toolAllowlist: normalizeStringArray(config.toolAllowlist),
      toolDenylist: normalizeStringArray(config.toolDenylist),
    };
  }

  getConfigSnapshot(): PolicyConfig {
    return { ...this.config };
  }

  evaluate(call: ToolCallRequest, tool?: ToolDefinition): ToolPolicyDecision | null {
    const spec = this.specProvider ? this.specProvider() : this.spec;
    const capability = spec?.risk_profile?.capability ?? 'full_shell';
    const args = normalizeRecord(call.arguments);
    const isShell = isShellTool(call.name);
    const isWrite = isMutatingTool(call.name);
    const command = typeof args['command'] === 'string' ? args['command'] : '';
    const config = this.config;

    if (config.toolAllowlist?.length && !config.toolAllowlist.includes(call.name)) {
      return {
        action: 'block',
        reason: `Tool "${call.name}" is not in the active allowlist.`,
        severity: 'medium',
      };
    }
    if (config.toolDenylist?.includes(call.name)) {
      return {
        action: 'block',
        reason: `Tool "${call.name}" is explicitly denied by policy.`,
        severity: 'high',
      };
    }

    // Always block blatantly destructive commands.
    if (isDangerousCommand(command)) {
      return {
        action: 'block',
        reason: `Command blocked by guardrails: "${command}"`,
        severity: 'high',
      };
    }

    // Enforce capability-branded behavior.
    if (capability === 'read_only') {
      if (isShell || isWrite) {
        return {
          action: 'block',
          reason: `Policy read_only forbids tool "${call.name}"`,
          severity: 'medium',
        };
      }
      return null;
    }

    if (capability === 'write_with_diff') {
      if (isShell || isWrite) {
        return {
          action: 'dry-run',
          reason: `Policy write_with_diff requires dry-run for "${call.name}"`,
          preview: buildPreview(call, args, tool),
          severity: 'low',
        };
      }
    }

    if (capability === 'write_and_run_tests') {
      if (isShell && isHighRiskShell(command)) {
        return {
          action: 'block',
          reason: `High-risk shell command blocked: "${command}"`,
          severity: 'high',
        };
      }
    }

    if (config.maxRuntimeMs && typeof args['timeout'] === 'number' && args['timeout'] > config.maxRuntimeMs) {
      return {
        action: 'block',
        reason: `Requested timeout ${args['timeout']}ms exceeds policy cap of ${config.maxRuntimeMs}ms.`,
        severity: 'medium',
      };
    }

    if (config.maxFileSizeBytes && typeof args['content'] === 'string') {
      const contentBytes = Buffer.byteLength(args['content'], 'utf8');
      if (contentBytes > config.maxFileSizeBytes) {
        return {
          action: 'block',
          reason: `Content size ${contentBytes} bytes exceeds policy cap of ${config.maxFileSizeBytes} bytes.`,
          severity: 'medium',
        };
      }
    }

    // Default allows through, still guarding extremely risky shells.
    if (isShell && isHighRiskShell(command)) {
      return {
        action: 'dry-run',
        reason: 'High-risk shell command requires confirmation',
        preview: buildPreview(call, args, tool),
        severity: 'high',
      };
    }

    return null;
  }
}

function buildPreview(call: ToolCallRequest, args: Record<string, unknown>, tool?: ToolDefinition): string {
  if (call.name === 'execute_bash' && typeof args['command'] === 'string') {
    return `Dry-run: would execute "${args['command']}"`;
  }
  if (tool?.description) {
    return `Dry-run: would invoke "${call.name}" (${tool.description})`;
  }
  return `Dry-run: would invoke "${call.name}"`;
}

function isShellTool(name: string): boolean {
  return name === 'execute_bash' || name === 'execute_bash_stream' || name === 'BashOutput' || name === 'KillShell';
}

function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}

const MUTATING_TOOLS = new Set<string>([
  'execute_bash',
  'execute_bash_stream',
  'Edit',
  'write_file',
  'NotebookEdit',
  'TodoWrite',
  'install_dependencies',
  'run_build',
  'run_tests',
  'run_repo_checks',
]);

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/?/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{\s*:.*\s*;\s*\}\s*;?\s*:/, // fork bomb
];

function isDangerousCommand(command: string): boolean {
  if (!command) {
    return false;
  }
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

function isHighRiskShell(command: string): boolean {
  if (!command) {
    return false;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  return /^sudo\b/i.test(trimmed) || /\b(chmod\s+7|chown\s+)/i.test(trimmed) || /\bapt(-get)?\s+install\b/i.test(trimmed);
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeStringArray(values?: string[]): string[] | undefined {
  if (!values) {
    return undefined;
  }
  const normalized = values.map((value) => value?.trim()).filter(Boolean) as string[];
  return normalized.length ? normalized : undefined;
}
