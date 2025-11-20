import type { CapabilityModule, CapabilityContext, CapabilityContribution } from '../runtime/agentHost.js';
import { createMissionTools } from '../tools/missionTools.js';
import { getSharedMissionManager } from '../core/orchestrationContext.js';

/**
 * Mission Capability Module
 *
 * Provides tools for setting and managing long-term agent objectives (missions).
 *
 * Tools:
 * - SetMission: Sets the agent's high-level objective.
 * - GetMission: Retrieves the current mission.
 * - CompleteMission: Declares the mission as complete.
 * - CreatePlan: Creates a new plan to work towards the mission.
 * - GetCurrentTask: Gets the next task from the plan queue.
 * - CompleteTask: Marks the current task as complete.
 */
export class MissionCapabilityModule implements CapabilityModule {
  readonly id = 'capability.mission';

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    const missionManager = getSharedMissionManager();

    const tools = createMissionTools({ missionManager });

    return {
      id: 'mission.control',
      description: 'Mission planning and execution',
      toolSuite: {
        id: 'mission',
        tools,
      },
    };
  }
}
