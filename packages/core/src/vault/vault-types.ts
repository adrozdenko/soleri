/**
 * Vault Types — tier definitions and multi-vault configuration.
 */

// =============================================================================
// VAULT TIERS
// =============================================================================

/** Vault tier — determines search priority and default path. */
export type VaultTier = 'agent' | 'project' | 'team';

/** Priority weights for search result merging (higher = ranked first). */
export const TIER_WEIGHTS: Record<VaultTier, number> = {
  agent: 1.0,
  project: 0.8,
  team: 0.6,
};

// =============================================================================
// VAULT MANAGER CONFIG
// =============================================================================

/** Configuration for a single vault tier. */
export interface VaultTierConfig {
  tier: VaultTier;
  /** Path to the SQLite database file. */
  path: string;
}

/** Configuration for VaultManager. */
export interface VaultManagerConfig {
  /** Agent identifier (used for default path: ~/.{agentId}/vault.db) */
  agentId: string;
  /** Override default paths per tier. */
  tiers?: VaultTierConfig[];
  /** Custom priority weights (overrides TIER_WEIGHTS). */
  weights?: Partial<Record<VaultTier, number>>;
}

// =============================================================================
// VAULT TIER INFO
// =============================================================================

/** Runtime info about a connected vault tier. */
export interface VaultTierInfo {
  tier: VaultTier;
  path: string;
  connected: boolean;
  entryCount: number;
}

// =============================================================================
// ZETTELKASTEN LINKS
// =============================================================================

/** Typed relationship between two vault entries. */
export type LinkType = 'supports' | 'contradicts' | 'extends' | 'sequences';

/** A directional, typed link between two vault entries. */
export interface VaultLink {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  note?: string;
  createdAt: number;
}

/** Raw SQLite row from vault_links table. */
export interface VaultLinkRow {
  source_id: string;
  target_id: string;
  link_type: string;
  note: string | null;
  created_at: number;
}

/** Entry enriched with link context for graph traversal results. */
export interface LinkedEntry {
  id: string;
  title: string;
  type: string;
  domain: string;
  linkType: LinkType;
  linkDirection: 'outgoing' | 'incoming';
  linkNote?: string;
}

/** Suggested link candidate from semantic/FTS similarity. */
export interface LinkSuggestion {
  entryId: string;
  title: string;
  type: string;
  score: number;
  suggestedType: LinkType;
  reason: string;
}

// =============================================================================
// SHARED TYPES (used by vault-entries, vault-memories, vault-maintenance)
// =============================================================================

import type { IntelligenceEntry } from '../intelligence/types.js';

export interface SearchResult {
  entry: IntelligenceEntry;
  score: number;
  source?: string;
}
export interface VaultStats {
  totalEntries: number;
  byType: Record<string, number>;
  byDomain: Record<string, number>;
  bySeverity: Record<string, number>;
}
export interface ProjectInfo {
  path: string;
  name: string;
  registeredAt: number;
  lastSeenAt: number;
  sessionCount: number;
}
export interface Memory {
  id: string;
  projectPath: string;
  type: 'session' | 'lesson' | 'preference';
  context: string;
  summary: string;
  topics: string[];
  filesModified: string[];
  toolsUsed: string[];
  /** What the user was trying to accomplish. */
  intent: string | null;
  /** Key decisions made and their rationale. */
  decisions: string[];
  /** Where things stand at capture time. */
  currentState: string | null;
  /** What should happen next session. */
  nextSteps: string[];
  /** Vault entries that informed this session. */
  vaultEntriesReferenced: string[];
  createdAt: number;
  archivedAt: number | null;
}
export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
  byProject: Record<string, number>;
}
