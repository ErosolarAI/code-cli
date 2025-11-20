import type { ToolPlugin } from '../index.js';
import { CodeIntelligenceCapabilityModule } from '../../../capabilities/codeIntelligenceCapability.js';

export const codeIntelligencePlugin: ToolPlugin = {
  id: 'tool.code-intelligence.analysis',
  name: 'Code Intelligence Tools',
  description: 'Advanced code intelligence tools for complexity analysis, metrics, and quality assessment',
  capabilityModule: new CodeIntelligenceCapabilityModule(),
  enabledByDefault: true,
};

export default codeIntelligencePlugin;
