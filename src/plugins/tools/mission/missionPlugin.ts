import type { ToolPlugin } from '../registry.js';
import { MissionCapabilityModule } from '../../../capabilities/missionCapability.js';

export function createMissionToolPlugin(): ToolPlugin {
  return {
    id: 'tool.mission',
    description: 'Autonomous mission planning and execution.',
    targets: ['node'],
    create: () => new MissionCapabilityModule(),
  };
}
