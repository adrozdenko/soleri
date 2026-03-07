import { createHash } from 'node:crypto';

export interface HashableEntry {
  type: string;
  domain: string;
  title: string;
  description: string;
  tags?: string[];
  example?: string;
  counterExample?: string;
}

/**
 * Compute a deterministic SHA-256 content hash for a vault entry.
 * Normalizes fields (lowercase domain, trim, sort tags/keys) before hashing.
 * Returns 40-char hex string. Excludes mutable fields (id, severity, timestamps).
 */
export function computeContentHash(entry: HashableEntry): string {
  const normalized = {
    counterExample: (entry.counterExample ?? '').trim(),
    description: entry.description.trim(),
    domain: entry.domain.toLowerCase().trim(),
    example: (entry.example ?? '').trim(),
    tags: [...(entry.tags ?? [])].sort(),
    title: entry.title.trim(),
    type: entry.type.trim(),
  };
  // Keys already alphabetical — JSON.stringify preserves insertion order
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json, 'utf8').digest('hex').slice(0, 40);
}
