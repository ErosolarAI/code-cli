import type { ToolPlugin } from '../registry.js';
import { CodeIntelligenceCapabilityModule } from '../../../capabilities/codeIntelligenceCapability.js';

export const codeIntelligencePlugin: ToolPlugin = {
  id: 'tool.code-intelligence.analysis',
  description: 'Advanced code intelligence tools for complexity analysis, metrics, and quality assessment',
  targets: ['node'],
  create: () => new CodeIntelligenceCapabilityModule(),
};

export default codeIntelligencePlugin;
