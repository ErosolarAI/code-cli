import { createUniversalRuntime, type UniversalRuntime, type UniversalRuntimeOptions } from './universal.js';
import { NodeRuntimeAdapter, type NodeAdapterOptions } from '../adapters/node/index.js';
import type { ToolPolicy } from '../core/policyEngine.js';
import type { TimelineRecorder } from '../core/timeline.js';

export interface NodeRuntimeOptions
  extends Omit<UniversalRuntimeOptions, 'adapter' | 'additionalModules'> {
  adapterOptions?: NodeAdapterOptions;
  additionalModules?: UniversalRuntimeOptions['additionalModules'];
  policy?: ToolPolicy;
  timeline?: TimelineRecorder;
}

export async function createNodeRuntime(options: NodeRuntimeOptions): Promise<UniversalRuntime> {
  const adapter = new NodeRuntimeAdapter(options.adapterOptions);
  return createUniversalRuntime({
    ...options,
    adapter,
    additionalModules: options.additionalModules,
  });
}
