import type {
  CapabilityContribution,
  CapabilityContext,
  CapabilityModule,
} from '../runtime/agentHost.js';
import { createCachingTools } from '../tools/cachingTools.js';

export interface CachingCapabilityOptions {
  id?: string;
  description?: string;
}

export class CachingCapabilityModule implements CapabilityModule {
  readonly id = 'capability.caching';
  private readonly options: CachingCapabilityOptions;

  constructor(options: CachingCapabilityOptions = {}) {
    this.options = options;
  }

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: this.options.id ?? 'caching.tools',
      description:
        this.options.description ??
        'Intelligent caching system for performance optimization with automatic invalidation and analytics.',
      toolSuite: {
        id: 'caching',
        description: 'Performance caching and optimization',
        tools: createCachingTools(),
      },
      metadata: {},
    };
  }
}
