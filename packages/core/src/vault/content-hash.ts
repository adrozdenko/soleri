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
  // Provenance / temporal fields — used ONLY by the fidelity hash (file drift),
  // never by the content-identity hash (dedup).
  tier?: string;
  origin?: string;
  validFrom?: number | null;
  validUntil?: number | null;
}

/**
 * Version of the `computeContentHash` formula. Bumped whenever the set of hashed
 * fields or their normalization changes, so a vault whose stored hashes were
 * computed by an older formula can be detected and re-hashed on open
 * (see `migrateHashFormula`). Without this, widening the formula would strand
 * every pre-existing row on the old formula and break the migration parity gate.
 */
export const HASH_FORMULA_VERSION = 2;

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

/**
 * Compute a FIDELITY hash covering EVERY canonical entry field, including the
 * provenance/temporal fields that `computeContentHash` deliberately omits
 * (tier, origin, validFrom, validUntil). Used ONLY for file-drift detection —
 * so a hand edit to any field (including a behaviorally load-bearing change like
 * `valid_until`/expiry) is caught by the reindex, while dedup identity stays
 * origin/tier-agnostic via `computeContentHash`.
 *
 * `tier`/`origin` normalize undefined → 'agent' (the DB default `seed` writes),
 * so a fidelity hash computed from an entry, a DB row, and its `.md` all agree.
 * Timestamps normalize undefined → null. Returns a 40-char hex string.
 */
export function computeFidelityHash(entry: HashableEntry): string {
  const normalized = {
    appliesTo: [...(entry.appliesTo ?? [])].sort(),
    context: (entry.context ?? '').trim(),
    counterExample: (entry.counterExample ?? '').trim(),
    description: entry.description.trim(),
    domain: entry.domain.toLowerCase().trim(),
    example: (entry.example ?? '').trim(),
    origin: (entry.origin ?? 'agent').trim(),
    severity: (entry.severity ?? '').trim(),
    tags: [...(entry.tags ?? [])].sort(),
    tier: (entry.tier ?? 'agent').trim(),
    title: entry.title.trim(),
    type: entry.type.trim(),
    validFrom: entry.validFrom ?? null,
    validUntil: entry.validUntil ?? null,
    why: (entry.why ?? '').trim(),
  };
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json, 'utf8').digest('hex').slice(0, 40);
}
