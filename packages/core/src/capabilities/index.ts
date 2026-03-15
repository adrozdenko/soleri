/**
 * Capability system — barrel export.
 *
 * @see docs/architecture/capability-packs.md
 */

export { CapabilityRegistry } from './registry.js';
export type { FlowForValidation } from './registry.js';
export { chainToCapability } from './chain-mapping.js';
export type {
  CapabilityDefinition,
  CapabilityHandler,
  CapabilityContext,
  CapabilityResult,
  KnowledgeContext,
  BrainRecommendation,
  RegisteredCapability,
  ResolvedCapability,
  PackSuggestion,
  FlowValidation,
} from './types.js';
