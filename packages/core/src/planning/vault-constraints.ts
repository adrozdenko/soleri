/**
 * Shared helper for loading constraint definitions from vault.
 * Used by both grading-ops.ts and plan-facade.ts to avoid mapping drift.
 */

import type { ConstraintDefinition, CompositionRule, ConstraintSeverity } from './planner-types.js';

interface VaultSearchResult {
  entry: {
    id: string;
    type?: string;
    title?: string;
    description?: string;
    severity?: string;
    domain?: string;
    tags?: string[];
    example?: string;
  };
  score: number;
}

interface VaultLike {
  search(query: string, options?: { limit?: number }): VaultSearchResult[];
}

function mapSeverity(vaultSeverity?: string): ConstraintSeverity {
  if (vaultSeverity === 'critical') return 'critical';
  if (vaultSeverity === 'warning') return 'major';
  return 'minor';
}

/**
 * Load constraint definitions and composition rules from vault.
 * Returns empty arrays on failure (graceful degradation).
 */
export function loadVaultConstraints(vault: VaultLike): {
  constraints: ConstraintDefinition[];
  compositionRules: CompositionRule[];
} {
  const constraints: ConstraintDefinition[] = [];
  const compositionRules: CompositionRule[] = [];

  try {
    const results = vault.search('domain:constraint', { limit: 50 });

    for (const r of results) {
      const entry = r.entry;

      if (entry.tags?.includes('composition-rule') && entry.example) {
        try {
          const parsed = JSON.parse(entry.example);
          if (parsed.trigger && Array.isArray(parsed.requires)) {
            compositionRules.push({
              trigger: parsed.trigger,
              requires: parsed.requires,
              severity: mapSeverity(entry.severity),
              description: entry.description,
            });
          }
        } catch {
          // Skip malformed composition rules
        }
      } else if (entry.type === 'anti-pattern' || entry.type === 'rule') {
        constraints.push({
          id: entry.id,
          name: entry.title ?? entry.id,
          severity: mapSeverity(entry.severity),
          pattern: entry.title ?? '',
          description: entry.description ?? '',
          domain: entry.domain,
        });
      }
    }
  } catch {
    // Vault unavailable — return empty
  }

  return { constraints, compositionRules };
}
