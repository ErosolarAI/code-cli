import type { ToolDefinition } from '../core/toolRuntime.js';
import type { MissionManager } from '../core/missionManager.js';
import type { PlanDAG, PlanNodeStatus, TaskSpec } from '../core/taskContracts.js';
import { getSharedPolicyEngine, getSharedTimeline } from '../core/orchestrationContext.js';

interface MissionToolOptions {
  missionManager: MissionManager;
}

export function createMissionTools(options: MissionToolOptions): ToolDefinition[] {
  const { missionManager } = options;

  return [
    {
      name: 'SetMission',
      description: 'Sets the agent\'s high-level objective or "mission". This will begin the autonomous execution loop.',
      parameters: {
        type: 'object',
        properties: {
          mission: {
            type: 'string',
            description: 'A clear and concise description of the overall mission.',
          },
          task_spec: {
            type: 'object',
            description: 'Optional structured task spec contract containing goal, constraints, budget, and risk profile.',
          },
        },
        required: ['mission'],
      },
      handler: async (args) => {
        const mission = args['mission'];
        if (typeof mission !== 'string' || !mission.trim()) {
          return 'Error: mission must be a non-empty string.';
        }
        missionManager.setMission(mission.trim());
        const spec = args['task_spec'];
        if (spec && typeof spec === 'object') {
          try {
            missionManager.setTaskSpec(spec as TaskSpec);
          } catch (error: any) {
            return `Mission set but task spec rejected: ${error?.message ?? error}`;
          }
        }
        return `Mission set: "${mission}". Task spec ${spec ? 'captured' : 'initialized'}. I will now create a plan to achieve this.`;
      },
    },
    {
      name: 'SetTaskSpec',
      description: 'Captures a structured task contract including goal, constraints, budget, risk profile, and evaluation hints.',
      parameters: {
        type: 'object',
        properties: {
          spec: {
            type: 'object',
            description: 'Structured task spec contract.',
          },
        },
        required: ['spec'],
      },
      handler: async (args) => {
        const spec = args['spec'];
        if (!spec || typeof spec !== 'object') {
          return 'Error: spec must be provided as an object.';
        }
        try {
          missionManager.setTaskSpec(spec as TaskSpec);
        } catch (error: any) {
          return `Error: ${(error?.message as string) || 'failed to record task spec'}`;
        }
        const goal = (spec as TaskSpec).goal?.natural ?? '(no goal)';
        return `Task spec recorded. Goal: ${goal}`;
      },
    },
    {
        name: 'GetMission',
        description: 'Retrieves the current mission and the status of the plan.',
        parameters: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
          return missionManager.getStatus();
        },
    },
    {
      name: 'CompleteMission',
      description: 'Declares the overall mission as complete.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A summary of how the mission was accomplished.',
          },
        },
        required: ['summary'],
      },
      handler: async (args) => {
        const summary = args['summary'];
        if (typeof summary !== 'string' || !summary.trim()) {
          return 'Error: summary must be a non-empty string.';
        }
        const mission = missionManager.getMission();
        missionManager.completeMission();
        return `Mission "${mission}" has been completed. Summary: ${summary}`;
      },
    },
    {
        name: 'CreatePlan',
        description: 'Creates a new plan to work towards the current mission. Supports linear steps or a DAG.',
        parameters: {
            type: 'object',
            properties: {
              steps: {
                  type: 'array',
                  description: 'A list of tasks to be executed to achieve the mission.',
                  items: {
                      type: 'string',
                  },
              },
              plan: {
                type: 'object',
                description: 'Plan DAG with nodes and optional metadata.',
              },
            },
            required: [],
        },
        handler: async (args) => {
            const steps = args['steps'];
            const graph = args['plan'];
            if (graph && typeof graph === 'object') {
              try {
                missionManager.setPlanGraph(graph as PlanDAG);
                return 'Plan DAG recorded. Execution ready.';
              } catch (error: any) {
                return `Error recording plan DAG: ${error?.message ?? error}`;
              }
            }
            if (!Array.isArray(steps) || steps.some((s) => typeof s !== 'string')) {
              return 'Error: provide either plan (DAG) or steps (array of strings).';
            }
            missionManager.setPlan(steps);
            return `Plan created with ${steps.length} steps. Starting execution.`;
        },
    },
    {
        name: 'GetCurrentTask',
        description: 'Gets the current task from the plan (next runnable node).',
        parameters: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            const task = missionManager.getCurrentTask();
            if (!task) {
              return 'No active task. The plan is complete or blocked.';
            }
            return JSON.stringify(
              {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                depends_on: task.depends_on ?? [],
              },
              null,
              2
            );
        },
    },
    {
        name: 'CompleteTask',
        description: 'Marks the current task as complete.',
        parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['succeeded', 'failed', 'skipped', 'blocked'],
                description: 'Outcome for the current task.',
              },
            },
        },
        handler: async (args) => {
            const completedTask = missionManager.getCurrentTask();
            if (!completedTask) {
                return 'Error: No active task to complete.';
            }
            const status = (args['status'] as PlanNodeStatus) ?? 'succeeded';
            missionManager.completeCurrentTask(status as PlanNodeStatus);
            const nextTask = missionManager.getCurrentTask();
            const base = `Task "${completedTask.title}" marked ${status}.`;
            if (!nextTask) {
              return `${base} Plan is done or needs replanning.`;
            }
            return `${base} Next task: ${nextTask.title}.`;
        },
    },
    {
      name: 'GetPlanStatus',
      description: 'Returns the current plan DAG with node statuses.',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return JSON.stringify(missionManager.getPlan(), null, 2);
      },
    },
    {
      name: 'GetFeedbackPacket',
      description: 'Returns a structured feedback packet (summary, deltas, errors, timeline refs).',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const packet = missionManager.getFeedbackPacket();
        return JSON.stringify(packet, null, 2);
      },
    },
    {
      name: 'InspectGuardrails',
      description: 'Shows the active guardrail policy, task spec snapshot, and risk profile.',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const policy = getSharedPolicyEngine();
        const config = policy.getConfigSnapshot ? policy.getConfigSnapshot() : {};
        const spec = missionManager.getTaskSpec();
        return JSON.stringify(
          {
            config,
            risk_profile: spec?.risk_profile ?? null,
            goal: spec?.goal ?? null,
          },
          null,
          2
        );
      },
    },
    {
      name: 'UpdateGuardrails',
      description: 'Updates guardrail policy (allowlist, denylist, max runtime/file size) for the current session.',
      parameters: {
        type: 'object',
        properties: {
          toolAllowlist: { type: 'array', items: { type: 'string' }, description: 'Only allow these tools (empty to clear allowlist).' },
          toolDenylist: { type: 'array', items: { type: 'string' }, description: 'Block these tools.' },
          maxRuntimeMs: { type: 'number', description: 'Maximum allowed timeout in milliseconds for tool calls.' },
          maxFileSizeBytes: { type: 'number', description: 'Maximum allowed content size for write operations in bytes.' },
        },
      },
      handler: async (args) => {
        const policy = getSharedPolicyEngine();
        if (policy.setConfig) {
          policy.setConfig({
            toolAllowlist: Array.isArray(args['toolAllowlist']) ? (args['toolAllowlist'] as string[]) : undefined,
            toolDenylist: Array.isArray(args['toolDenylist']) ? (args['toolDenylist'] as string[]) : undefined,
            maxRuntimeMs: typeof args['maxRuntimeMs'] === 'number' ? args['maxRuntimeMs'] : undefined,
            maxFileSizeBytes: typeof args['maxFileSizeBytes'] === 'number' ? args['maxFileSizeBytes'] : undefined,
          });
          getSharedTimeline().record({
            action: 'policy.updated',
            status: 'succeeded',
            message: 'Guardrails updated via tool',
            metadata: {
              config: policy.getConfigSnapshot ? policy.getConfigSnapshot() : {},
            },
          });
          return 'Guardrails updated.';
        }
        return 'Policy engine does not support configuration updates.';
      },
    },
  ];
}
