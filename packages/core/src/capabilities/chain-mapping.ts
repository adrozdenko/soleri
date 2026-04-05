/**
 * Chain-to-capability mapping — v1 to v2 bridge.
 *
 * Maps Soleri's existing 26 v1 chain names (from data/flows/*.flow.yaml)
 * to capability IDs in domain.action format.
 *
 * Used during migration: flows with chains: [] are auto-translated to
 * capability references. Remove this file when all flows use needs: []
 * exclusively.
 *
 * @see docs/architecture/capability-packs.md — "Chain-to-capability mapping"
 */

/**
 * Exhaustive map of every chain name used across Soleri's 8 flow YAML files.
 *
 * Sources:
 *   build.flow.yaml    — vault-search, memory-search, component-search,
 *                         recommend-design-system, architecture-search,
 *                         brain-recommend, component-workflow,
 *                         validate-component, validate-tokens
 *   deliver.flow.yaml  — validate-component, validate-tokens,
 *                         design-rules-check, test-coverage-check,
 *                         performance-audit, delivery-checklist
 *   design.flow.yaml   — vault-search, memory-search,
 *                         recommend-design-system, recommend-style,
 *                         recommend-palette, recommend-typography,
 *                         get-stack-guidelines, brain-recommend
 *   enhance.flow.yaml  — vault-search, memory-search, architecture-search,
 *                         brain-recommend, validate-component, validate-tokens
 *   explore.flow.yaml  — vault-search, memory-search, brain-strengths,
 *                         brain-recommend, playbook-search
 *   fix.flow.yaml      — vault-search, memory-search,
 *                         error-pattern-search, brain-recommend,
 *                         validate-component, validate-tokens
 *   plan.flow.yaml     — vault-search, memory-search, brain-recommend,
 *                         architecture-search, plan-create
 *   review.flow.yaml   — validate-component, validate-tokens,
 *                         design-rules-check, vault-search, contrast-check,
 *                         accessibility-audit, review-report
 */
const CHAIN_TO_CAPABILITY: Record<string, string> = {
  // Vault & Knowledge
  'vault-search': 'vault.search',
  'memory-search': 'memory.search',
  'playbook-search': 'vault.playbook',

  // Brain
  'brain-recommend': 'brain.recommend',
  'brain-strengths': 'brain.strengths',

  // Components
  'component-search': 'component.search',
  'component-workflow': 'component.workflow',
  'validate-component': 'component.validate',

  // Design
  'contrast-check': 'color.validate',
  'validate-tokens': 'token.check',
  'design-rules-check': 'design.rules',
  'recommend-design-system': 'design.recommend',
  'recommend-palette': 'design.palette',
  'recommend-style': 'design.style',
  'recommend-typography': 'design.typography',
  'get-stack-guidelines': 'stack.guidelines',

  // Architecture
  'architecture-search': 'architecture.search',

  // Planning
  'plan-create': 'plan.create',

  // Capture & Synthesis
  'capture-baseline-state': 'vault.capture',
  'vault-synthesize': 'vault.synthesize',

  // Review & Quality
  'review-report': 'review.report',
  'accessibility-audit': 'a11y.audit',
  'performance-audit': 'perf.audit',
  'test-coverage-check': 'test.coverage',
  'error-pattern-search': 'debug.patterns',
  'delivery-checklist': 'deliver.checklist',
};

/**
 * Translate a v1 chain name to a v2 capability ID.
 *
 * @param chain - The chain name from a flow YAML `chains:` field
 * @returns The corresponding capability ID in domain.action format, or
 *          undefined if no mapping exists
 */
export function chainToCapability(chain: string): string | undefined {
  return CHAIN_TO_CAPABILITY[chain];
}
