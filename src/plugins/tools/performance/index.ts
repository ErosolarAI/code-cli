import type { ToolPlugin } from '../registry.js';
import { PerformanceCapabilityModule } from '../../../capabilities/performanceCapability.js';

export const performancePlugin: ToolPlugin = {
  id: 'tool.performance.optimization',
  description: 'Performance optimization tools for parallel execution and efficiency improvements',
  targets: ['node'],
  create: () => new PerformanceCapabilityModule(),
};

export default performancePlugin;
