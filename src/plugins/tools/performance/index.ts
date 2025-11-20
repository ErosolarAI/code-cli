import type { ToolPlugin } from '../../index.js';
import { PerformanceCapabilityModule } from '../../../capabilities/performanceCapability.js';

export const performancePlugin: ToolPlugin = {
  id: 'tool.performance.optimization',
  name: 'Performance Optimization Tools',
  description: 'Performance optimization tools for parallel execution and efficiency improvements',
  capabilityModule: new PerformanceCapabilityModule(),
  enabledByDefault: true,
};

export default performancePlugin;