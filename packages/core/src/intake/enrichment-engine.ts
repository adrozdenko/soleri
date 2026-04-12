// ─── Enrichment Engine ────────────────────────────────────────────
// When a new item is similar to (but not a duplicate of) an existing vault entry,
// enrich the existing entry instead of creating a parallel one.
//
// "Enrichment zone": similarity between ENRICHMENT_THRESHOLD and DEDUP_THRESHOLD.
// Items in this zone have the same *topic* but carry *new information*.

import type { Vault } from '../vault/vault.js';
import type { DedupResult } from './dedup-gate.js';
import { DEDUP_THRESHOLD } from './dedup-gate.js';

export const ENRICHMENT_THRESHOLD = 0.45;

export interface EnrichmentResult {
  entryId: string;
  entryTitle: string;
  similarity: number;
  fieldsUpdated: string[];
}

/**
 * Process dedup results and enrich existing vault entries when items fall
 * in the enrichment zone (similarity >= ENRICHMENT_THRESHOLD and < DEDUP_THRESHOLD).
 *
 * Returns the list of entries that were enriched.
 * Items that are duplicates (>= DEDUP_THRESHOLD) or unrelated (< ENRICHMENT_THRESHOLD) are skipped.
 */
export function enrichExistingEntries(
  dedupResults: DedupResult[],
  vault: Vault,
): EnrichmentResult[] {
  const enriched: EnrichmentResult[] = [];

  for (const result of dedupResults) {
    // Only process items in the enrichment zone
    if (
      result.isDuplicate ||
      result.similarity < ENRICHMENT_THRESHOLD ||
      result.similarity >= DEDUP_THRESHOLD ||
      !result.bestMatchId
    ) {
      continue;
    }

    const existing = vault.get(result.bestMatchId);
    if (!existing) continue;

    const newItem = result.item;
    const fieldsUpdated: string[] = [];

    // Build update payload — append new information to existing fields
    const updates: Record<string, string> = {};

    // Enrich description: append new description if it adds information
    if (newItem.description && newItem.description !== existing.description) {
      const separator = '\n\n---\n\n';
      const enrichmentNote = `[Enriched from: ${newItem.citation || 'ingested source'}]`;
      updates.description = `${existing.description}${separator}${enrichmentNote}\n${newItem.description}`;
      fieldsUpdated.push('description');
    }

    // Enrich context: append new citation/context
    if (newItem.citation) {
      const existingContext = existing.context ?? '';
      if (!existingContext.includes(newItem.citation)) {
        updates.context = existingContext
          ? `${existingContext}\n${newItem.citation}`
          : newItem.citation;
        fieldsUpdated.push('context');
      }
    }

    // Merge tags: add new tags that don't exist yet
    const existingTags = new Set(existing.tags);
    const newTags = (newItem.tags ?? []).filter((t) => !existingTags.has(t));
    if (newTags.length > 0) {
      updates.tags = JSON.stringify([...existing.tags, ...newTags]);
      fieldsUpdated.push('tags');
    }

    // Skip if nothing to update
    if (fieldsUpdated.length === 0) continue;

    // Apply the update
    const updateFields: Record<string, unknown> = {};
    if (updates.description) updateFields.description = updates.description;
    if (updates.context) updateFields.context = updates.context;
    if (updates.tags) updateFields.tags = JSON.parse(updates.tags) as string[];

    vault.update(result.bestMatchId, updateFields);

    enriched.push({
      entryId: result.bestMatchId,
      entryTitle: existing.title,
      similarity: result.similarity,
      fieldsUpdated,
    });
  }

  return enriched;
}
