/**
 * WS4 mandatory round-trip contract: entry → canonical markdown → parsed entry
 * deep-equals the original, for ALL four types and ALL severity / tier / origin
 * values. This is the guarantee that makes markdown files a lossless canonical
 * store (SQLite becomes a rebuildable index, not the home of any fact).
 */
import { describe, it, expect } from 'vitest';
import { entryToMarkdown } from './vault-markdown-sync.js';
import { fromObsidianMarkdown, parseWikilink, type ResolvedLinks } from './obsidian-sync.js';
import { parsedToEntry } from './vault-reindex.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { VaultLink } from './vault-types.js';

const TYPES: IntelligenceEntry['type'][] = ['pattern', 'anti-pattern', 'rule', 'playbook'];
const SEVERITIES: IntelligenceEntry['severity'][] = ['critical', 'warning', 'suggestion'];
const TIERS: NonNullable<IntelligenceEntry['tier']>[] = ['agent', 'project', 'team'];
const ORIGINS: NonNullable<IntelligenceEntry['origin']>[] = ['agent', 'pack', 'user'];

/** Round-trip an entry through canonical markdown and back to an entry. */
function roundTrip(entry: IntelligenceEntry): IntelligenceEntry {
  const md = entryToMarkdown(entry);
  const parsed = fromObsidianMarkdown(md);
  return parsedToEntry(parsed);
}

describe('WS4 canonical round-trip', () => {
  it('round-trips every type × severity × tier × origin combination', () => {
    let combos = 0;
    for (const type of TYPES) {
      for (const severity of SEVERITIES) {
        for (const tier of TIERS) {
          for (const origin of ORIGINS) {
            const entry: IntelligenceEntry = {
              id: `rt-${type}-${severity}-${tier}-${origin}`,
              type,
              domain: 'typescript',
              title: `Reject ${type} in ${severity} mode`,
              severity,
              description: 'A canonical description with enough text to be meaningful.',
              context: 'Applies when configuring schemas.',
              example: 'const good = z.object({}).strict();',
              counterExample: 'const bad = z.object({}).default({});',
              why: 'Because defaulted inner fields silently drop.',
              tags: ['zod', 'schema', 'v4'],
              tier,
              origin,
            };
            expect(roundTrip(entry)).toEqual(entry);
            combos++;
          }
        }
      }
    }
    expect(combos).toBe(TYPES.length * SEVERITIES.length * TIERS.length * ORIGINS.length);
  });

  it('round-trips minimal entries (required fields only)', () => {
    const entry: IntelligenceEntry = {
      id: 'rt-minimal',
      type: 'rule',
      domain: 'core',
      title: 'Keep it minimal',
      severity: 'warning',
      description: 'Minimal body.',
      tags: [],
    };
    expect(roundTrip(entry)).toEqual(entry);
  });

  it('round-trips appliesTo and temporal fields', () => {
    const entry: IntelligenceEntry = {
      id: 'rt-full',
      type: 'playbook',
      domain: 'ops',
      title: 'Rollout Playbook',
      severity: 'critical',
      description: 'Full-field entry.',
      tags: ['deploy'],
      appliesTo: ['forge', 'cli'],
      tier: 'team',
      origin: 'pack',
      validFrom: 1_700_000_000,
      validUntil: 1_800_000_000,
    };
    expect(roundTrip(entry)).toEqual(entry);
  });

  it('round-trips an empty domain (routed to _general) without inventing a domain', () => {
    const entry: IntelligenceEntry = {
      id: 'rt-nodomain',
      type: 'pattern',
      domain: '',
      title: 'No Domain Pattern',
      severity: 'suggestion',
      description: 'Lives under _general.',
      tags: ['misc'],
    };
    expect(roundTrip(entry)).toEqual(entry);
  });

  it('preserves multi-line descriptions and sections', () => {
    const entry: IntelligenceEntry = {
      id: 'rt-multiline',
      type: 'anti-pattern',
      domain: 'react',
      title: 'Avoid Prop Drilling',
      severity: 'warning',
      description: 'First paragraph.\n\nSecond paragraph with more detail.',
      context: 'Deep component trees.',
      why: 'It couples unrelated components.',
      tags: ['react', 'state'],
    };
    expect(roundTrip(entry)).toEqual(entry);
  });

  it('does not re-infer type when frontmatter carries an explicit type', () => {
    // Description text that would trip the "avoid/never" anti-pattern heuristic.
    const entry: IntelligenceEntry = {
      id: 'rt-explicit',
      type: 'rule',
      domain: 'style',
      title: 'Explicit Type Wins',
      severity: 'warning',
      description: 'Never avoid the explicit frontmatter type here.',
      tags: [],
    };
    expect(roundTrip(entry).type).toBe('rule');
  });
});

describe('WS4 wikilink edge round-trip', () => {
  function makeLink(overrides: Partial<VaultLink> = {}): VaultLink {
    return {
      sourceId: 'src',
      targetId: 'tgt',
      linkType: 'supports',
      createdAt: 0,
      ...overrides,
    };
  }

  it('promotes link type into frontmatter wikilinks that survive parsing', () => {
    const entry: IntelligenceEntry = {
      id: 'wl-1',
      type: 'rule',
      domain: 'typescript',
      title: 'Zod Object Defaults',
      severity: 'warning',
      description: 'Edge carrier.',
      tags: [],
    };
    const titleMap = new Map<string, string>([
      ['t-refine', 'Refined Rule'],
      ['s-contra', 'Contradicting Pattern'],
    ]);
    const resolvedLinks: ResolvedLinks = {
      outgoing: [makeLink({ sourceId: 'wl-1', targetId: 't-refine', linkType: 'extends' })],
      incoming: [makeLink({ sourceId: 's-contra', targetId: 'wl-1', linkType: 'contradicts' })],
      titleMap,
    };

    const md = entryToMarkdown(entry, resolvedLinks);
    // Frontmatter carries the typed wikilinks.
    expect(md).toContain('[[extends::refined-rule]]');
    expect(md).toContain('[[contradicts::contradicting-pattern]]');

    const parsed = fromObsidianMarkdown(md);
    expect(parsed.links).toBeDefined();
    const byType = Object.fromEntries((parsed.links ?? []).map((l) => [l.linkType, l.slug]));
    expect(byType.extends).toBe('refined-rule');
    expect(byType.contradicts).toBe('contradicting-pattern');
  });

  it('parseWikilink handles typed and untyped forms', () => {
    expect(parseWikilink('[[extends::foo-bar]]')).toEqual({ linkType: 'extends', slug: 'foo-bar' });
    expect(parseWikilink('[[foo-bar]]')).toEqual({ slug: 'foo-bar' });
    expect(parseWikilink('   [[supports::a]]  ')).toEqual({ linkType: 'supports', slug: 'a' });
    expect(parseWikilink('[[]]')).toBeNull();
  });
});
