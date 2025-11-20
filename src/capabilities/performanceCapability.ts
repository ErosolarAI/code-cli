import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createPerformanceTools } from '../tools/performanceTools.js';

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
    return {
      id: this.options.id ?? 'performance.tools',
      description:
        this.options.description ??
        'Performance optimization tools for parallel execution and efficiency improvements.',
      toolSuite: {
        id: 'performance',
        description: 'Performance optimization and parallel execution',
        tools: createPerformanceTools(),
      },
      metadata: {},
    };
  }
}