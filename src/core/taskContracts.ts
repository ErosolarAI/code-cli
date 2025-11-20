export type TaskCapability =
  | 'read_only'
  | 'write_with_diff'
  | 'write_and_run_tests'
  | 'full_shell';

export type InteractionMode = 'full_autonomy' | 'ask_before_risky' | 'ask_every_step';

export interface TaskGoal {
  natural: string;
  machine: Record<string, unknown>;
}

export interface TaskBudget {
  max_steps?: number;
  max_wall_time_sec?: number;
  cost_ceiling?: string | number;
}

export interface TaskRiskProfile {
  capability?: TaskCapability;
  interaction?: {
    mode?: InteractionMode;
  };
}

export interface TaskEvaluation {
  success?: string[];
  acceptance_hint?: string;
}

export interface TaskSpec {
  goal: TaskGoal;
  constraints?: string[];
  budget?: TaskBudget;
  risk_profile?: TaskRiskProfile;
  evaluation?: TaskEvaluation;
}

export type PlanNodeStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'blocked';

export interface PlanNode {
  id: string;
  title: string;
  description?: string;
  tool?: string;
  args?: Record<string, unknown>;
  depends_on?: string[];
  status?: PlanNodeStatus;
}

export interface PlanMetadata {
  rationale?: string;
  version?: string;
  created_at?: string;
}

export interface PlanDAG {
  nodes: PlanNode[];
  metadata?: PlanMetadata;
}

export interface FeedbackPacket {
  summary: string;
  deltas: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  timeline_refs?: string[];
}

export function normalizeTaskSpec(input: TaskSpec): TaskSpec {
  const goal: TaskGoal = {
    natural: input.goal?.natural?.toString().trim() ?? '',
    machine: isRecord(input.goal?.machine) ? input.goal.machine : {},
  };

  const constraints = Array.isArray(input.constraints)
    ? input.constraints.map(String).map((item) => item.trim()).filter(Boolean)
    : [];

  const budget: TaskBudget | undefined = input.budget
    ? {
        max_steps: toNumber(input.budget.max_steps),
        max_wall_time_sec: toNumber(input.budget.max_wall_time_sec),
        cost_ceiling: input.budget.cost_ceiling,
      }
    : undefined;

  const risk_profile: TaskRiskProfile | undefined = input.risk_profile
    ? {
        capability: isTaskCapability(input.risk_profile.capability) ? input.risk_profile.capability : undefined,
        interaction: input.risk_profile.interaction
          ? { mode: isInteractionMode(input.risk_profile.interaction.mode) ? input.risk_profile.interaction.mode : undefined }
          : undefined,
      }
    : undefined;

  const evaluation: TaskEvaluation | undefined = input.evaluation
    ? {
        success: Array.isArray(input.evaluation.success)
          ? input.evaluation.success.map(String).map((item) => item.trim()).filter(Boolean)
          : undefined,
        acceptance_hint: input.evaluation.acceptance_hint?.toString().trim() || undefined,
      }
    : undefined;

  return {
    goal,
    constraints,
    budget,
    risk_profile,
    evaluation,
  };
}

export function normalizePlanDAG(plan: PlanDAG): PlanDAG {
  const seen = new Set<string>();
  const nodes = (plan.nodes ?? []).map((node, index) => {
    const id = node.id?.trim() || `step_${index + 1}`;
    const title = node.title?.toString().trim() || id;
    const depends_on = Array.isArray(node.depends_on)
      ? node.depends_on.map(String).map((value) => value.trim()).filter(Boolean)
      : [];
    const status: PlanNodeStatus = isPlanStatus(node.status) ? node.status : 'pending';
    if (seen.has(id)) {
      throw new Error(`Duplicate plan node id detected: "${id}"`);
    }
    seen.add(id);
    return {
      ...node,
      id,
      title,
      depends_on,
      status,
    };
  });

  for (const node of nodes) {
    for (const dep of node.depends_on ?? []) {
      if (!seen.has(dep)) {
        throw new Error(`Plan node "${node.id}" depends on unknown node "${dep}"`);
      }
    }
  }

  return {
    nodes,
    metadata: {
      ...plan.metadata,
      created_at: plan.metadata?.created_at ?? new Date().toISOString(),
      version: plan.metadata?.version ?? 'v1',
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

function isTaskCapability(value: unknown): value is TaskCapability {
  return value === 'read_only' || value === 'write_with_diff' || value === 'write_and_run_tests' || value === 'full_shell';
}

function isInteractionMode(value: unknown): value is InteractionMode {
  return value === 'full_autonomy' || value === 'ask_before_risky' || value === 'ask_every_step';
}

function isPlanStatus(value: unknown): value is PlanNodeStatus {
  return value === 'pending' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'skipped' || value === 'blocked';
}
