import { MissionManager } from './missionManager.js';
import { PolicyEngine } from './policyEngine.js';
import { TimelineRecorder } from './timeline.js';
import {
  MetricsCollector,
  PerformanceMonitor,
  getSharedCacheMetrics,
} from './observability.js';
import { randomUUID } from 'node:crypto';

const sharedTimeline = new TimelineRecorder();
const sharedMissionManager = new MissionManager({ timeline: sharedTimeline });
const sharedPolicyEngine = new PolicyEngine(() =>
  sharedMissionManager.getTaskSpec(),
);
const sharedMetricsCollector = new MetricsCollector(createSessionId());
const sharedPerformanceMonitor = new PerformanceMonitor(
  sharedMetricsCollector,
  getSharedCacheMetrics(),
);

function createSessionId(): string {
  try {
    return randomUUID();
  } catch {
    return `session-${Date.now()}`;
  }
}

sharedMissionManager.setPolicyEngine(sharedPolicyEngine);

export function getSharedOrchestrationContext(): {
  missionManager: MissionManager;
  policyEngine: PolicyEngine;
  timeline: TimelineRecorder;
  metricsCollector: MetricsCollector;
  performanceMonitor: PerformanceMonitor;
} {
  return {
    missionManager: sharedMissionManager,
    policyEngine: sharedPolicyEngine,
    timeline: sharedTimeline,
    metricsCollector: sharedMetricsCollector,
    performanceMonitor: sharedPerformanceMonitor,
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

export function getSharedMetricsCollector(): MetricsCollector {
  return sharedMetricsCollector;
}

export function getSharedPerformanceMonitor(): PerformanceMonitor {
  return sharedPerformanceMonitor;
}
