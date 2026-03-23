/**
 * Archive facade — archival, lifecycle, and knowledge maintenance ops.
 * vault_archive, vault_restore, vault_optimize, vault_backup,
 * vault_age_report, vault_set_temporal, vault_find_expiring, vault_find_expired,
 * knowledge_audit, knowledge_health, knowledge_merge, knowledge_reorganize.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createArchiveOps } from '../archive-ops.js';

export function createArchiveFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return createArchiveOps(runtime);
}
