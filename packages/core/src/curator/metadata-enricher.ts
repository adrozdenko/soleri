/**
 * Metadata Enricher — pure-logic module for rule-based entry metadata enrichment.
 *
 * No DB access. Returns changes and updates to be applied by the caller.
 */

import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface MetadataChange {
  field: string;
  before: string;
  after: string;
}

export interface EnrichResult {
  changes: MetadataChange[];
  updates: Partial<Pick<IntelligenceEntry, 'title' | 'description' | 'tags' | 'severity' | 'type'>>;
}

// ─── Constants ──────────────────────────────────────────────────────

const CRITICAL_KEYWORDS = ['never', 'must not', 'critical', 'security', 'vulnerability'];
const WARNING_KEYWORDS = ['avoid', 'should not', 'deprecated', 'careful', 'warning'];
const ANTI_PATTERN_PREFIXES = ['avoid', 'never', "don't", 'do not'];

// ─── Enrich ─────────────────────────────────────────────────────────

export function enrichEntryMetadata(entry: IntelligenceEntry): EnrichResult {
  const changes: MetadataChange[] = [];
  const updates: EnrichResult['updates'] = {};

  // Auto-capitalize title
  if (entry.title.length > 0 && entry.title[0] !== entry.title[0].toUpperCase()) {
    const capitalized = entry.title[0].toUpperCase() + entry.title.slice(1);
    changes.push({ field: 'title', before: entry.title, after: capitalized });
    updates.title = capitalized;
  }

  // Normalize tags: lowercase, trim, dedup
  const normalizedTags = [...new Set(entry.tags.map((t) => t.toLowerCase().trim()))];
  const tagsChanged =
    normalizedTags.length !== entry.tags.length ||
    normalizedTags.some((t, i) => t !== entry.tags[i]);
  if (tagsChanged) {
    changes.push({
      field: 'tags',
      before: JSON.stringify(entry.tags),
      after: JSON.stringify(normalizedTags),
    });
    updates.tags = normalizedTags;
  }

  // Infer severity from keywords if currently 'suggestion'
  if (entry.severity === 'suggestion') {
    const text = (entry.title + ' ' + entry.description).toLowerCase();
    if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) {
      changes.push({ field: 'severity', before: entry.severity, after: 'critical' });
      updates.severity = 'critical';
    } else if (WARNING_KEYWORDS.some((k) => text.includes(k))) {
      changes.push({ field: 'severity', before: entry.severity, after: 'warning' });
      updates.severity = 'warning';
    }
  }

  // Infer type from title patterns
  if (entry.type === 'pattern') {
    const titleLower = entry.title.toLowerCase();
    if (ANTI_PATTERN_PREFIXES.some((p) => titleLower.startsWith(p))) {
      changes.push({ field: 'type', before: entry.type, after: 'anti-pattern' });
      updates.type = 'anti-pattern';
    }
  }

  // Trim whitespace from description
  const trimmed = entry.description.trim();
  if (trimmed !== entry.description) {
    changes.push({ field: 'description', before: entry.description, after: trimmed });
    updates.description = trimmed;
  }

  return { changes, updates };
}
