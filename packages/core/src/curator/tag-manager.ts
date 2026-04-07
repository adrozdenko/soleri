/**
 * Tag Manager — tag aliasing and suggestion logic.
 *
 * Base normalization (lowercase, trim, noise filtering) is delegated to
 * the vault's tag-normalizer — the single canonical implementation.
 * This module adds alias-store resolution on top.
 *
 * Pure logic where possible; database access is delegated via a TagStore interface.
 */

import type { TagNormalizationResult, CanonicalTag } from './types.js';
import { baseNormalizeTag } from '../vault/tag-normalizer.js';

// ─── Constants ──────────────────────────────────────────────────────

export const DEFAULT_TAG_ALIASES: Array<[string, string]> = [
  ['a11y', 'accessibility'],
  ['ts', 'typescript'],
  ['js', 'javascript'],
  ['css', 'styling'],
  ['tailwind', 'styling'],
  ['tw', 'styling'],
  ['vitest', 'testing'],
  ['jest', 'testing'],
  ['perf', 'performance'],
  ['sec', 'security'],
  ['auth', 'authentication'],
  ['i18n', 'internationalization'],
  ['l10n', 'localization'],
];

// ─── Tag Store Interface ────────────────────────────────────────────

/**
 * Thin abstraction over the persistence layer for tag operations.
 * Implemented by the Curator facade using its PersistenceProvider.
 */
export interface TagStore {
  getAlias(lower: string): string | null;
  insertCanonical(tag: string): void;
  upsertAlias(alias: string, canonical: string): void;
  getCanonicalRows(): Array<{ tag: string; description: string | null; alias_count: number }>;
  countTagUsage(tag: string): number;
}

// ─── Normalize ──────────────────────────────────────────────────────

export function normalizeTag(tag: string, store: TagStore): TagNormalizationResult {
  // Delegate base normalization (lowercase, trim) to the vault's shared normalizer
  // so there is a single source of truth for the first normalization step.
  const lower = baseNormalizeTag(tag);
  const canonical = store.getAlias(lower);
  if (canonical) {
    return { original: tag, normalized: canonical, wasAliased: true };
  }
  return { original: tag, normalized: lower, wasAliased: false };
}

export function normalizeTags(tags: string[], store: TagStore): TagNormalizationResult[] {
  return tags.map((tag) => normalizeTag(tag, store));
}

/**
 * Deduplicate and return final tag list after normalization.
 */
export function normalizeAndDedup(
  tags: string[],
  store: TagStore,
): { results: TagNormalizationResult[]; dedupedTags: string[]; changed: boolean } {
  const results: TagNormalizationResult[] = [];
  const normalizedTags: string[] = [];
  let changed = false;

  for (const tag of tags) {
    const result = normalizeTag(tag, store);
    results.push(result);
    normalizedTags.push(result.normalized);
    if (result.normalized !== tag) changed = true;
  }

  const dedupedTags = [...new Set(normalizedTags)];
  return { results, dedupedTags, changed };
}

// ─── Alias Management ───────────────────────────────────────────────

export function addTagAlias(alias: string, canonical: string, store: TagStore): void {
  const lower = baseNormalizeTag(alias);
  const canonicalLower = baseNormalizeTag(canonical);
  store.insertCanonical(canonicalLower);
  store.upsertAlias(lower, canonicalLower);
}

// ─── Canonical Tags ─────────────────────────────────────────────────

export function getCanonicalTags(store: TagStore): CanonicalTag[] {
  const rows = store.getCanonicalRows();
  return rows.map((row) => ({
    tag: row.tag,
    description: row.description,
    usageCount: store.countTagUsage(row.tag),
    aliasCount: row.alias_count,
  }));
}

// ─── Seed ───────────────────────────────────────────────────────────

export function seedDefaultAliases(store: TagStore): void {
  const canonicals = new Set(DEFAULT_TAG_ALIASES.map(([, c]) => c));
  for (const tag of canonicals) {
    store.insertCanonical(tag);
  }
  for (const [alias, canonical] of DEFAULT_TAG_ALIASES) {
    store.upsertAlias(alias, canonical);
  }
}
