import type { CapabilityContribution, CapabilityContext, CapabilityModule } from '../runtime/agentHost.js';
import { createCodeIntelligenceTools } from '../tools/codeIntelligenceTools.js';

export interface CodeIntelligenceCapabilityOptions {
  id?: string;
  description?: string;
}

export class CodeIntelligenceCapabilityModule implements CapabilityModule {
  readonly id = 'capability.code-intelligence';
  private readonly options: CodeIntelligenceCapabilityOptions;

  constructor(options: CodeIntelligenceCapabilityOptions = {}) {
    this.options = options;
  }

  async create(_context: CapabilityContext): Promise<CapabilityContribution> {
    return {
      id: this.options.id ?? 'code-intelligence.tools',
      description:
        this.options.description ??
        'Advanced code intelligence tools for complexity analysis, metrics, and quality assessment.',
      toolSuite: {
        id: 'code-intelligence',
        description: 'Code intelligence and complexity analysis',
        tools: createCodeIntelligenceTools(),
      },
      metadata: {},
    };
  }
}