/**
 * Capability → registered facade op mapping.
 *
 * Maps flow step capability IDs (from `needs:`) to the actual facade op names
 * registered in the Soleri dispatch registry. This is the source of truth that
 * makes flow steps actually execute instead of silently dispatching to
 * unregistered tool names.
 *
 * Convention: tool name = `{agentId}_{facade}_{op}`
 * e.g. vault.search → agentId_vault_search_intelligent
 *
 * Salvador capabilities (design.*, component.*, token.*) are intentionally
 * absent — they require Salvador to be connected and are handled by the
 * blocking mechanism in flow on-missing-capability.
 */

export interface CapabilityOpEntry {
  /** Facade name (without agent prefix), e.g. 'vault' */
  facade: string;
  /** Op name as registered in the facade, e.g. 'search_intelligent' */
  op: string;
}

/**
 * Maps capability IDs to their registered facade ops.
 *
 * Keyed by full capability ID (e.g. "vault.search").
 * Values are {facade, op} which combine as `{agentId}_{facade}_{op}`.
 */
export const CAPABILITY_OP_MAP: Record<string, CapabilityOpEntry> = {
  // Vault — knowledge search and capture
  'vault.search': { facade: 'vault', op: 'search_intelligent' },
  'vault.playbook': { facade: 'vault', op: 'search_intelligent' }, // playbooks are vault entries

  // Memory — cross-session and cross-project recall
  'memory.search': { facade: 'memory', op: 'memory_search' },

  // Brain — pattern learning and recommendations
  'brain.recommend': { facade: 'brain', op: 'brain_recommend' },
  'brain.strengths': { facade: 'brain', op: 'brain_strengths' },

  // Plan — structured planning ops
  'plan.create': { facade: 'plan', op: 'create_plan' },
};

/**
 * Convert a capability ID to a dispatch tool name for a given agent.
 *
 * Returns the correctly formatted tool name if the capability is in the map,
 * or undefined if no mapping exists (caller should fall back to chain-derived name).
 *
 * An optional `overrides` map takes precedence over `CAPABILITY_OP_MAP`.
 *
 * @example
 * capabilityToToolName('vault.search', 'myagent') // → 'myagent_vault_search_intelligent'
 * capabilityToToolName('architecture.search', 'myagent') // → undefined (no map entry)
 * capabilityToToolName('vault.search', 'myagent', { 'vault.search': { facade: 'v', op: 'find' } }) // → 'myagent_v_find'
 */
export function capabilityToToolName(
  capId: string,
  agentId: string,
  overrides?: Record<string, { facade: string; op: string }>,
): string | undefined {
  const entry = overrides?.[capId] ?? CAPABILITY_OP_MAP[capId];
  if (!entry) return undefined;
  return `${agentId}_${entry.facade}_${entry.op}`;
}
