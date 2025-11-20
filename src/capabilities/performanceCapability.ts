import type {
  CapabilityContribution,
  CapabilityContext,
  CapabilityModule,
} from '../runtime/agentHost.js';
import { createPerformanceTools } from '../tools/performanceTools.js';
import { createAdvancedPerformanceTools } from '../tools/advancedPerformanceTools.js';

export interface PerformanceCapabilityOptions {
  id?: string;
  description?: string;
}

export class PerformanceCapabilityModule implements CapabilityModule {
  readonly id = 'capability.performance';
  private readonly options: PerformanceCapabilityOptions;

  constructor(options: PerformanceCapabilityOptions = {}) {
    this.options = options;
  }

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    const performanceTools = createPerformanceTools();
    const advancedPerformanceTools = createAdvancedPerformanceTools();

    return {
      id: this.options.id ?? 'performance.tools',
      description:
        this.options.description ??
        'Performance optimization tools for parallel execution, memory monitoring, and efficiency improvements.',
      toolSuite: {
        id: 'performance',
        description: 'Performance optimization and monitoring',
        tools: [...performanceTools, ...advancedPerformanceTools],
      },
      metadata: {},
    };
  }
}
