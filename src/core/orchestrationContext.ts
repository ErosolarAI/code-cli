import { MissionManager } from './missionManager.js';
import { PolicyEngine } from './policyEngine.js';
import { TimelineRecorder } from './timeline.js';

const sharedTimeline = new TimelineRecorder();
const sharedMissionManager = new MissionManager({ timeline: sharedTimeline });
const sharedPolicyEngine = new PolicyEngine(() => sharedMissionManager.getTaskSpec());

sharedMissionManager.setPolicyEngine(sharedPolicyEngine);

export function getSharedOrchestrationContext(): {
  missionManager: MissionManager;
  policyEngine: PolicyEngine;
  timeline: TimelineRecorder;
} {
  return {
    missionManager: sharedMissionManager,
    policyEngine: sharedPolicyEngine,
    timeline: sharedTimeline,
  };
}

export function getSharedMissionManager(): MissionManager {
  return sharedMissionManager;
}

export function getSharedPolicyEngine(): PolicyEngine {
  return sharedPolicyEngine;
}

export function getSharedTimeline(): TimelineRecorder {
  return sharedTimeline;
}
