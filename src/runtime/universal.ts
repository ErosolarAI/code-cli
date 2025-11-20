import { AgentHost, type CapabilityModule } from './agentHost.js';
import { AgentSession } from './agentSession.js';
import type { ProfileName } from '../config.js';
import type { ToolRuntimeObserver } from '../core/toolRuntime.js';
import type { RuntimeAdapter, RuntimeAdapterContext } from '../adapters/types.js';
import type { ToolPolicy } from '../core/policyEngine.js';
import type { TimelineRecorder } from '../core/timeline.js';

export interface UniversalRuntimeOptions {
  profile: ProfileName;
  workspaceContext: string | null;
  workingDir: string;
  adapter: RuntimeAdapter;
  toolObserver?: ToolRuntimeObserver;
  env?: NodeJS.ProcessEnv;
  additionalModules?: CapabilityModule[];
  policy?: ToolPolicy;
  timeline?: TimelineRecorder;
}

export interface UniversalRuntime {
  host: AgentHost;
  session: AgentSession;
  adapter: RuntimeAdapter;
}

export async function createUniversalRuntime(
  options: UniversalRuntimeOptions
): Promise<UniversalRuntime> {
  const env = options.env ? { ...options.env } : { ...process.env };
  const host = new AgentHost({
    profile: options.profile,
    workspaceContext: options.workspaceContext,
    workingDir: options.workingDir,
    toolObserver: options.toolObserver,
    env,
    policy: options.policy,
    timeline: options.timeline,
  });

  const adapterContext: RuntimeAdapterContext = {
    profile: options.profile,
    workspaceContext: options.workspaceContext,
    workingDir: options.workingDir,
    env,
  };

  const adapterModules = await options.adapter.createCapabilityModules(adapterContext);
  const additionalModules = options.additionalModules ?? [];

  if (adapterModules.length || additionalModules.length) {
    await host.loadModules([...adapterModules, ...additionalModules]);
  }

  const session = await host.getSession();

  return {
    host,
    session,
    adapter: options.adapter,
  };
}
