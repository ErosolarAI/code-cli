import {
  normalizePlanDAG,
  normalizeTaskSpec,
  type FeedbackPacket,
  type PlanDAG,
  type PlanNode,
  type PlanNodeStatus,
  type TaskSpec,
} from './taskContracts.js';
import { TimelineRecorder } from './timeline.js';
import { PolicyEngine } from './policyEngine.js';

type MissionState = 'IDLE' | 'PLANNING' | 'EXECUTING' | 'DONE';

interface MissionManagerOptions {
  timeline?: TimelineRecorder;
  policy?: PolicyEngine;
}

export class MissionManager {
  private mission: string | null = null;
  private taskSpec: TaskSpec | null = null;
  private plan: PlanDAG | null = null;
  private state: MissionState = 'IDLE';
  private readonly timeline: TimelineRecorder;
  private policy: PolicyEngine | null;

  constructor(options: MissionManagerOptions = {}) {
    this.timeline = options.timeline ?? new TimelineRecorder();
    this.policy = options.policy ?? null;
  }

  setPolicyEngine(engine: PolicyEngine): void {
    this.policy = engine;
    if (this.taskSpec) {
      this.policy.setTaskSpec(this.taskSpec);
    }
  }

  setTaskSpec(spec: TaskSpec): void {
    const normalized = normalizeTaskSpec(spec);
    if (!normalized.goal.natural) {
      throw new Error('Task spec goal.natural is required.');
    }
    this.taskSpec = normalized;
    this.policy?.setTaskSpec(normalized);
    this.timeline.record({
      action: 'task_spec_recorded',
      message: normalized.goal.natural,
      metadata: { machine: normalized.goal.machine },
    });
    if (this.state === 'IDLE') {
      this.state = 'PLANNING';
    }
  }

  getTaskSpec(): TaskSpec | null {
    return this.taskSpec;
  }

  setMission(mission: string): void {
    this.mission = mission;
    this.plan = null;
    this.state = 'PLANNING';
    this.timeline.record({
      action: 'mission_set',
      message: mission,
    });
    if (!this.taskSpec) {
      this.setTaskSpec({
        goal: {
          natural: mission,
          machine: { type: 'general', target_outcome: 'mission_complete' },
        },
      });
    }
  }

  getMission(): string | null {
    return this.mission;
  }

  completeMission(): void {
    this.state = 'DONE';
    this.timeline.record({
      action: 'mission_completed',
      message: this.mission ?? 'mission',
      status: 'succeeded',
    });
  }

  requestReplan(reason?: string): void {
    if (this.state === 'DONE') {
      return;
    }
    this.state = 'PLANNING';
    this.timeline.record({
      action: 'plan.replan_requested',
      status: 'blocked',
      message: reason ?? 'Replan requested',
    });
  }

  setPlan(steps: string[]): void {
    const nodes = steps.map((step, index) => ({
      id: `step_${index + 1}`,
      title: step,
      description: step,
      depends_on: index === 0 ? [] : [`step_${index}`],
    }));
    this.setPlanGraph({ nodes });
  }

  setPlanGraph(plan: PlanDAG): void {
    const normalized = normalizePlanDAG(plan);
    this.plan = {
      ...normalized,
      nodes: normalized.nodes.map((node) => ({
        ...node,
        status: sanitizeStatus(node.status),
      })),
    };
    this.state = this.plan.nodes.length ? 'EXECUTING' : 'PLANNING';
    this.timeline.record({
      action: 'plan_created',
      status: 'started',
      metadata: {
        nodes: this.plan.nodes.length,
        version: this.plan.metadata?.version,
        rationale: this.plan.metadata?.rationale,
      },
    });
  }

  getPlan(): PlanDAG | null {
    return this.plan ? { ...this.plan, nodes: this.plan.nodes.map((node) => ({ ...node })) } : null;
  }

  getCurrentTask(): PlanNode | null {
    if (this.state !== 'EXECUTING' || !this.plan) {
      return null;
    }
    const runnable = this.getRunnableNodes()[0];
    if (!runnable) {
      return null;
    }
    if (runnable.status === 'pending') {
      runnable.status = 'running';
      this.timeline.record({
        action: 'plan.node_started',
        status: 'started',
        stepId: runnable.id,
        message: runnable.title,
      });
    }
    return runnable;
  }

  getRunnableNodes(): PlanNode[] {
    if (!this.plan) {
      return [];
    }
    const completed = new Set(
      this.plan.nodes
        .filter((node) => node.status === 'succeeded' || node.status === 'skipped')
        .map((node) => node.id)
    );
    return this.plan.nodes.filter((node) => {
      if (node.status !== 'pending' && node.status !== 'running') {
        return false;
      }
      const deps = node.depends_on ?? [];
      return deps.every((dep) => completed.has(dep));
    });
  }

  completeCurrentTask(status: PlanNodeStatus = 'succeeded'): void {
    if (this.state !== 'EXECUTING' || !this.plan) {
      return;
    }
    const current = this.getRunnableNodes()[0];
    if (!current) {
      this.state = 'PLANNING';
      return;
    }
    current.status = status;
    const timelineStatus = status === 'succeeded' ? 'succeeded' : status === 'skipped' ? 'skipped' : status === 'blocked' ? 'blocked' : 'failed';
    this.timeline.record({
      action: 'plan.node_completed',
      status: timelineStatus,
      stepId: current.id,
      message: current.title,
    });

    if (this.getRunnableNodes().length === 0 && this.plan.nodes.every((node) => node.status === 'succeeded')) {
      this.state = 'PLANNING';
    }
  }

  updateNodeStatus(target: string, status: PlanNodeStatus): boolean {
    if (!this.plan) {
      return false;
    }
    const node = this.plan.nodes.find(
      (entry) => entry.id === target || entry.title?.toLowerCase() === target.toLowerCase()
    );
    if (!node) {
      return false;
    }
    node.status = sanitizeStatus(status);
    this.timeline.record({
      action: 'plan.node_manual_update',
      status: node.status === 'succeeded' ? 'succeeded' : node.status === 'failed' ? 'failed' : 'blocked',
      stepId: node.id,
      message: `Manually marked ${node.title}`,
    });
    if (node.status === 'failed' || node.status === 'blocked') {
      this.requestReplan(`Node ${node.id} marked ${node.status}`);
    }
    return true;
  }

  getState(): MissionState {
    return this.state;
  }

  getStatus(): string {
    if (this.state === 'IDLE') {
      return 'I am idle. I have no mission.';
    }
    if (this.state === 'DONE') {
      return `Mission "${this.mission}" is complete.`;
    }

    const status = [`Mission: "${this.mission ?? 'n/a'}"`, `State: ${this.state}`];

    const plan = this.plan;
    if (plan) {
      const succeeded = plan.nodes.filter((node) => node.status === 'succeeded').length;
      const total = plan.nodes.length;
      status.push(`Plan progress: ${succeeded}/${total} done`);
      const current = this.getCurrentTask();
      if (current) {
        status.push(`Current Task: ${current.title}`);
      } else {
        status.push('Plan is complete or blocked. Ready for replanning.');
      }
    }

    return status.join('\n');
  }

  getFeedbackPacket(): FeedbackPacket {
    const events = this.timeline.latest(10);
    const errors = events
      .filter((event) => event.status === 'failed' || event.action === 'policy_blocked')
      .map((event) => ({
        type: event.action,
        message: event.message,
        details_artifact: event.eventId,
      }));

    const deltas = (this.plan?.nodes ?? []).map((node) => ({
      type: 'plan_node_status',
      target: node.id,
      status: node.status,
      title: node.title,
    }));

    const summaryParts = [];
    if (this.taskSpec?.goal?.natural) {
      summaryParts.push(`Goal: ${this.taskSpec.goal.natural}`);
    }
    if (this.plan) {
      const succeeded = this.plan.nodes.filter((node) => node.status === 'succeeded').length;
      summaryParts.push(`Plan: ${succeeded}/${this.plan.nodes.length} nodes done`);
    }

    return {
      summary: summaryParts.join(' | ') || 'No active task',
      deltas,
      errors,
      timeline_refs: events.map((event) => event.eventId),
    };
  }

  getTimeline(): TimelineRecorder {
    return this.timeline;
  }
}

function sanitizeStatus(status?: PlanNodeStatus): PlanNodeStatus {
  return status === 'running' || status === 'succeeded' || status === 'failed' || status === 'skipped' || status === 'blocked'
    ? status
    : 'pending';
}
