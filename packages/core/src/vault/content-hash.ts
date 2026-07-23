import { createHash } from 'node:crypto';

export interface HashableEntry {
  type: string;
  domain: string;
  title: string;
  description: string;
  tags?: string[];
  example?: string;
  counterExample?: string;
  // Authored CONTENT fields — added so a change to any of them is detected as
  // drift and is never skipped by the file-write dedup (WS4 MAJOR 4).
  severity?: string;
  context?: string;
  why?: string;
  appliesTo?: string[];
}

/**
 * Compute a deterministic SHA-256 CONTENT-identity hash for a vault entry.
 *
 * Covers every authored field a human writes: type, domain, title, description,
 * tags, example, counterExample, context, why, severity, appliesTo. A change to
 * any of these is detected as drift and forces a file rewrite (fixes the silent
 * skip of context/why/severity changes).
 *
 * DELIBERATELY EXCLUDES provenance/temporal metadata (tier, origin, validFrom,
 * validUntil): these are not content identity, and including them would break
 * cross-origin dedup (the same knowledge installed from a pack vs captured by the
 * agent would stop de-duplicating). Changes to those fields still never leave a
 * stale file — the mutating ops (update/setTemporal) force-write the `.md`
 * regardless of the content hash.
 *
 * The `id` and mutable audit timestamps (created_at/updated_at) are excluded.
 * Returns a 40-char hex string.
 */
export function computeContentHash(entry: HashableEntry): string {
  const normalized = {
    appliesTo: [...(entry.appliesTo ?? [])].sort(),
    context: (entry.context ?? '').trim(),
    counterExample: (entry.counterExample ?? '').trim(),
    description: entry.description.trim(),
    domain: entry.domain.toLowerCase().trim(),
    example: (entry.example ?? '').trim(),
    severity: (entry.severity ?? '').trim(),
    tags: [...(entry.tags ?? [])].sort(),
    title: entry.title.trim(),
    type: entry.type.trim(),
    why: (entry.why ?? '').trim(),
  };
  // Keys already alphabetical — JSON.stringify preserves insertion order
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json, 'utf8').digest('hex').slice(0, 40);
}
