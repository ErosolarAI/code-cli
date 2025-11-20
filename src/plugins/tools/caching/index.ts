import type { ToolPlugin } from '../registry.js';
import { CachingCapabilityModule } from '../../../capabilities/cachingCapability.js';

export const cachingPlugin: ToolPlugin = {
  id: 'tool.caching.optimization',
  description:
    'Intelligent caching system for performance optimization with automatic invalidation',
  targets: ['node'],
  create: () => new CachingCapabilityModule(),
};

export default cachingPlugin;