/**
 * Links facade — Zettelkasten entry linking ops.
 * link_entries, unlink_entries, get_links, traverse, suggest_links,
 * get_orphans, relink_vault, backfill_links, link_stats.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultLinkingOps } from '../vault-linking-ops.js';

export function createLinksFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return createVaultLinkingOps(runtime);
}
