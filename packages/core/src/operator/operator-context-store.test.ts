import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { OperatorContextStore, normalizeCorrection, isUndoCorrection } from './operator-context-store.js';
import { DECLINED_CATEGORIES } from './operator-context-types.js';
import type {
  OperatorSignals,
  ExpertiseSignal,
  CorrectionSignal,
  InterestSignal,
  WorkPatternSignal,
  OperatorContext,
} from './operator-context-types.js';

// =============================================================================
// HELPERS
// =============================================================================

function emptySignals(): OperatorSignals {
  return { expertise: [], corrections: [], interests: [], patterns: [] };
}

function makeExpertise(overrides: Partial<ExpertiseSignal> = {}): ExpertiseSignal {
  return { topic: 'typescript', level: 'learning', ...overrides };
}

function makeCorrection(overrides: Partial<CorrectionSignal> = {}): CorrectionSignal {
  return { rule: 'always use semicolons', scope: 'global', ...overrides };
}

function makeInterest(overrides: Partial<InterestSignal> = {}): InterestSignal {
  return { tag: 'coffee', ...overrides };
}

function makePattern(overrides: Partial<WorkPatternSignal> = {}): WorkPatternSignal {
  return { pattern: 'batches work locally', ...overrides };
}

// =============================================================================
// TESTS
// =============================================================================

describe('OperatorContextStore', () => {
  let vault: Vault;
  let store: OperatorContextStore;

  beforeEach(() => {
    vault = new Vault(':memory:');
    store = new OperatorContextStore(vault.getProvider());
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Table Creation ─────────────────────────────────────────────────

  describe('init', () => {
    it('creates table without error on a fresh database', () => {
      expect(store).toBeDefined();
    });

    it('is idempotent — second init does not throw', () => {
      const store2 = new OperatorContextStore(vault.getProvider());
      expect(store2).toBeDefined();
    });
  });

  // ─── Empty State ──────────────────────────────────────────────────

  describe('getContext (empty)', () => {
    it('returns empty arrays and zero counts', () => {
      const ctx = store.getContext();
      expect(ctx.expertise).toEqual([]);
      expect(ctx.corrections).toEqual([]);
      expect(ctx.interests).toEqual([]);
      expect(ctx.patterns).toEqual([]);
      expect(ctx.sessionCount).toBe(0);
    });
  });

  // ─── Expertise Compounding ────────────────────────────────────────

  describe('expertise compounding', () => {
    it('inserts a new expertise item', () => {
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise()] },
        'session-1',
      );
      const ctx = store.getContext();
      expect(ctx.expertise).toHaveLength(1);
      expect(ctx.expertise[0].topic).toBe('typescript');
      expect(ctx.expertise[0].level).toBe('learning');
      expect(ctx.expertise[0].sessionCount).toBe(1);
    });

    it('compounds confidence with exponential moving average', () => {
      // First: default confidence 0.5
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ confidence: 0.5 })] },
        'session-1',
      );
      // Second: high confidence 0.9
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ confidence: 0.9 })] },
        'session-2',
      );
      const ctx = store.getContext();
      // EMA: 0.5 * 0.7 + 0.9 * 0.3 = 0.35 + 0.27 = 0.62
      expect(ctx.expertise[0].confidence).toBeCloseTo(0.62, 2);
      expect(ctx.expertise[0].sessionCount).toBe(2);
    });

    it('upgrades level when confidence exceeds 0.8', () => {
      // Start at learning with high confidence
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'learning', confidence: 0.9 })] },
        's1',
      );
      // Push to intermediate with high confidence — should upgrade
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'intermediate', confidence: 0.95 })] },
        's2',
      );
      // Compound a few more times to push EMA above 0.8
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'intermediate', confidence: 0.95 })] },
        's3',
      );
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'intermediate', confidence: 0.95 })] },
        's4',
      );
      const ctx = store.getContext();
      expect(ctx.expertise[0].level).toBe('intermediate');
    });

    it('never auto-downgrades level', () => {
      // Start at expert
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'expert', confidence: 0.9 })] },
        's1',
      );
      // Signal learning — level should stay expert
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ level: 'learning', confidence: 0.3 })] },
        's2',
      );
      const ctx = store.getContext();
      expect(ctx.expertise[0].level).toBe('expert');
    });

    it('is case-insensitive on topic key', () => {
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ topic: 'TypeScript' })] },
        's1',
      );
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ topic: 'typescript' })] },
        's2',
      );
      const ctx = store.getContext();
      expect(ctx.expertise).toHaveLength(1);
      expect(ctx.expertise[0].sessionCount).toBe(2);
    });
  });

  // ─── Corrections ──────────────────────────────────────────────────

  describe('corrections compounding', () => {
    it('inserts a new correction', () => {
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection()] },
        'session-1',
      );
      const ctx = store.getContext();
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.corrections[0].rule).toBe('always use semicolons');
      expect(ctx.corrections[0].active).toBe(true);
      expect(ctx.corrections[0].scope).toBe('global');
    });

    it('updates existing correction — latest wins', () => {
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ quote: 'first' })] },
        's1',
      );
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ quote: 'updated' })] },
        's2',
      );
      const ctx = store.getContext();
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.corrections[0].quote).toBe('updated');
      expect(ctx.corrections[0].sessionId).toBe('s2');
    });

    it('respects scope — project and global', () => {
      store.compoundSignals(
        {
          ...emptySignals(),
          corrections: [
            makeCorrection({ rule: 'use tabs', scope: 'project' }),
            makeCorrection({ rule: 'no console.log', scope: 'global' }),
          ],
        },
        's1',
      );
      const ctx = store.getContext();
      expect(ctx.corrections).toHaveLength(2);
      const scopes = ctx.corrections.map((c) => c.scope).sort();
      expect(scopes).toEqual(['global', 'project']);
    });
  });

  // ─── Interests ────────────────────────────────────────────────────

  describe('interests compounding', () => {
    it('inserts a new interest with default confidence', () => {
      store.compoundSignals(
        { ...emptySignals(), interests: [makeInterest()] },
        's1',
      );
      const ctx = store.getContext();
      expect(ctx.interests).toHaveLength(1);
      expect(ctx.interests[0].tag).toBe('coffee');
      expect(ctx.interests[0].confidence).toBe(0.5);
      expect(ctx.interests[0].mentionCount).toBe(1);
    });

    it('grows confidence on repeated mentions', () => {
      for (let i = 0; i < 3; i++) {
        store.compoundSignals(
          { ...emptySignals(), interests: [makeInterest()] },
          `s${i}`,
        );
      }
      const ctx = store.getContext();
      // 0.5 → 0.6 → 0.7
      expect(ctx.interests[0].confidence).toBeCloseTo(0.7, 2);
      expect(ctx.interests[0].mentionCount).toBe(3);
    });

    it('decays confidence when not mentioned', () => {
      store.compoundSignals(
        { ...emptySignals(), interests: [makeInterest()] },
        's1',
      );
      // Session without mentioning coffee
      store.compoundSignals(emptySignals(), 's2');
      const ctx = store.getContext();
      expect(ctx.interests[0].confidence).toBeCloseTo(0.49, 2);
    });

    it('decay floors at 0.1', () => {
      store.compoundSignals(
        { ...emptySignals(), interests: [makeInterest()] },
        's1',
      );
      // Force confidence very low by many empty sessions
      for (let i = 0; i < 100; i++) {
        store.compoundSignals(emptySignals(), `s${i + 2}`);
      }
      const ctx = store.getContext();
      expect(ctx.interests[0].confidence).toBeGreaterThanOrEqual(0.1);
    });

    it('confidence caps at 1.0', () => {
      for (let i = 0; i < 20; i++) {
        store.compoundSignals(
          { ...emptySignals(), interests: [makeInterest()] },
          `s${i}`,
        );
      }
      const ctx = store.getContext();
      expect(ctx.interests[0].confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // ─── Work Patterns ────────────────────────────────────────────────

  describe('patterns compounding', () => {
    it('inserts a new pattern', () => {
      store.compoundSignals(
        { ...emptySignals(), patterns: [makePattern()] },
        's1',
      );
      const ctx = store.getContext();
      expect(ctx.patterns).toHaveLength(1);
      expect(ctx.patterns[0].pattern).toBe('batches work locally');
      expect(ctx.patterns[0].frequency).toBe('once');
      expect(ctx.patterns[0].observedCount).toBe(1);
    });

    it('upgrades frequency: once → occasional at 3 observations', () => {
      for (let i = 0; i < 3; i++) {
        store.compoundSignals(
          { ...emptySignals(), patterns: [makePattern()] },
          `s${i}`,
        );
      }
      const ctx = store.getContext();
      expect(ctx.patterns[0].frequency).toBe('occasional');
      expect(ctx.patterns[0].observedCount).toBe(3);
    });

    it('upgrades frequency: occasional → frequent at 8 observations', () => {
      for (let i = 0; i < 8; i++) {
        store.compoundSignals(
          { ...emptySignals(), patterns: [makePattern()] },
          `s${i}`,
        );
      }
      const ctx = store.getContext();
      expect(ctx.patterns[0].frequency).toBe('frequent');
      expect(ctx.patterns[0].observedCount).toBe(8);
    });

    it('compounds confidence with EMA (0.8/0.2 weights)', () => {
      store.compoundSignals(
        { ...emptySignals(), patterns: [makePattern()] },
        's1',
      );
      store.compoundSignals(
        { ...emptySignals(), patterns: [makePattern()] },
        's2',
      );
      const ctx = store.getContext();
      // EMA: 0.5 * 0.8 + 0.5 * 0.2 = 0.5 (stays same since signal is same)
      expect(ctx.patterns[0].confidence).toBeCloseTo(0.5, 2);
    });
  });

  // ─── Drift Detection ─────────────────────────────────────────────

  describe('hasDrifted', () => {
    it('returns true on first call (no previous render)', () => {
      expect(store.hasDrifted()).toBe(true);
    });

    it('returns false when nothing changed', () => {
      store.hasDrifted(); // prime
      expect(store.hasDrifted()).toBe(false);
    });

    it('returns true after new correction added', () => {
      store.hasDrifted(); // prime
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection()] },
        's1',
      );
      expect(store.hasDrifted()).toBe(true);
    });

    it('returns true after expertise level change', () => {
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ confidence: 0.9 })] },
        's1',
      );
      store.hasDrifted(); // prime
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise({ confidence: 0.95 })] },
        's2',
      );
      expect(store.hasDrifted()).toBe(true);
    });
  });

  // ─── Renderer ─────────────────────────────────────────────────────

  describe('renderContextFile', () => {
    it('returns header only when empty', () => {
      const output = store.renderContextFile();
      expect(output).toBe('# Operator Context');
    });

    it('renders expertise as facts', () => {
      store.compoundSignals(
        { ...emptySignals(), expertise: [makeExpertise()] },
        's1',
      );
      const output = store.renderContextFile();
      expect(output).toContain('**Expertise:**');
      expect(output).toContain('typescript');
      expect(output).toContain('learning');
      expect(output).toContain('1 sessions');
    });

    it('renders corrections as bullet list', () => {
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ quote: 'do it!' })] },
        's1',
      );
      const output = store.renderContextFile();
      expect(output).toContain('**Corrections:**');
      expect(output).toContain('- always use semicolons');
      expect(output).toContain('"do it!"');
    });

    it('renders interests above confidence threshold', () => {
      store.compoundSignals(
        { ...emptySignals(), interests: [makeInterest()] },
        's1',
      );
      const output = store.renderContextFile();
      expect(output).toContain('**Interests:**');
      expect(output).toContain('coffee');
    });

    it('renders work patterns', () => {
      store.compoundSignals(
        { ...emptySignals(), patterns: [makePattern()] },
        's1',
      );
      const output = store.renderContextFile();
      expect(output).toContain('**Work patterns:**');
      expect(output).toContain('batches work locally');
    });

    it('produces valid markdown', () => {
      store.compoundSignals(
        {
          expertise: [makeExpertise()],
          corrections: [makeCorrection()],
          interests: [makeInterest()],
          patterns: [makePattern()],
        },
        's1',
      );
      const output = store.renderContextFile();
      // Starts with markdown heading
      expect(output.startsWith('# Operator Context')).toBe(true);
      // No trailing whitespace on lines
      for (const line of output.split('\n')) {
        expect(line).toBe(line.trimEnd());
      }
    });
  });

  // ─── Inspect ──────────────────────────────────────────────────────

  describe('inspect', () => {
    it('returns the full compounded profile', () => {
      store.compoundSignals(
        {
          expertise: [makeExpertise()],
          corrections: [makeCorrection()],
          interests: [makeInterest()],
          patterns: [makePattern()],
        },
        's1',
      );
      const ctx = store.inspect();
      expect(ctx.expertise).toHaveLength(1);
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.interests).toHaveLength(1);
      expect(ctx.patterns).toHaveLength(1);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('deleteItem', () => {
    it('removes a specific item', () => {
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection()] },
        's1',
      );
      const ctx = store.getContext();
      const id = ctx.corrections[0].id;
      const deleted = store.deleteItem('correction', id);
      expect(deleted).toBe(true);
      expect(store.getContext().corrections).toHaveLength(0);
    });

    it('returns false for non-existent item', () => {
      const deleted = store.deleteItem('expertise', 'nonexistent-id');
      expect(deleted).toBe(false);
    });
  });

  // ─── Must-Not-Learn Categories ────────────────────────────────────

  describe('declined categories', () => {
    it('rejects signals containing declined category words', () => {
      for (const category of DECLINED_CATEGORIES) {
        const freshVault = new Vault(':memory:');
        const freshStore = new OperatorContextStore(freshVault.getProvider());

        freshStore.compoundSignals(
          {
            expertise: [makeExpertise({ topic: `${category} stuff` })],
            corrections: [makeCorrection({ rule: `avoid ${category} topics` })],
            interests: [makeInterest({ tag: `${category} news` })],
            patterns: [makePattern({ pattern: `reads ${category} articles` })],
          },
          's1',
        );

        const ctx = freshStore.getContext();
        expect(ctx.expertise).toHaveLength(0);
        expect(ctx.corrections).toHaveLength(0);
        expect(ctx.interests).toHaveLength(0);
        expect(ctx.patterns).toHaveLength(0);

        freshVault.close();
      }
    });

    it('rejects signals where evidence contains declined words', () => {
      store.compoundSignals(
        {
          ...emptySignals(),
          expertise: [makeExpertise({ topic: 'coding', evidence: 'mentioned their medical condition' })],
        },
        's1',
      );
      expect(store.getContext().expertise).toHaveLength(0);
    });

    it('allows signals without declined category words', () => {
      store.compoundSignals(
        {
          expertise: [makeExpertise({ topic: 'rust' })],
          corrections: [makeCorrection({ rule: 'prefer const' })],
          interests: [makeInterest({ tag: 'hiking' })],
          patterns: [makePattern({ pattern: 'works in morning' })],
        },
        's1',
      );
      const ctx = store.getContext();
      expect(ctx.expertise).toHaveLength(1);
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.interests).toHaveLength(1);
      expect(ctx.patterns).toHaveLength(1);
    });
  });

  // ─── Empty Signals ────────────────────────────────────────────────

  describe('empty signals', () => {
    it('does not crash on empty signal arrays', () => {
      expect(() => store.compoundSignals(emptySignals(), 's1')).not.toThrow();
      expect(store.getContext().expertise).toEqual([]);
    });

    it('handles multiple empty compounds in sequence', () => {
      for (let i = 0; i < 5; i++) {
        store.compoundSignals(emptySignals(), `s${i}`);
      }
      const ctx = store.getContext();
      expect(ctx.expertise).toEqual([]);
    });
  });

  // ─── Mixed Signals ────────────────────────────────────────────────

  describe('mixed signal batch', () => {
    it('processes all four signal types in one call', () => {
      store.compoundSignals(
        {
          expertise: [
            makeExpertise({ topic: 'react' }),
            makeExpertise({ topic: 'node' }),
          ],
          corrections: [makeCorrection()],
          interests: [makeInterest(), makeInterest({ tag: 'climbing' })],
          patterns: [makePattern()],
        },
        's1',
      );
      const ctx = store.getContext();
      expect(ctx.expertise).toHaveLength(2);
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.interests).toHaveLength(2);
      expect(ctx.patterns).toHaveLength(1);
    });
  });

  // ─── Correction Undo Detection ──────────────────────────────────

  describe('correction undo detection', () => {
    it('deactivates correction when undo detected', () => {
      // First: "don't summarize"
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ rule: "don't summarize" })] },
        's1',
      );
      expect(store.getContext().corrections).toHaveLength(1);
      expect(store.getContext().corrections[0].active).toBe(true);

      // Then: "actually, summaries are fine"
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ rule: 'actually, summaries are fine' })] },
        's2',
      );

      // The original correction should be deactivated, and the undo should NOT be stored
      const ctx = store.getContext();
      expect(ctx.corrections).toHaveLength(0);
    });

    it('undo detection handles various phrasings', () => {
      const pairs: [string, string][] = [
        ["no emoji", "you can use emoji again"],
        ["stop using bullet points", "actually, bullet points are fine"],
        ["don't use abbreviations", "feel free to use abbreviations"],
        ["avoid long explanations", "go ahead with long explanations"],
        ["never use slang", "it's fine to use slang"],
      ];

      for (const [original, undo] of pairs) {
        const freshVault = new Vault(':memory:');
        const freshStore = new OperatorContextStore(freshVault.getProvider());

        freshStore.compoundSignals(
          { ...emptySignals(), corrections: [makeCorrection({ rule: original })] },
          's1',
        );
        expect(freshStore.getContext().corrections).toHaveLength(1);

        freshStore.compoundSignals(
          { ...emptySignals(), corrections: [makeCorrection({ rule: undo })] },
          's2',
        );
        expect(freshStore.getContext().corrections).toHaveLength(0);

        freshVault.close();
      }
    });

    it('undo only deactivates matching topic — unrelated corrections unaffected', () => {
      store.compoundSignals(
        {
          ...emptySignals(),
          corrections: [
            makeCorrection({ rule: "don't summarize" }),
            makeCorrection({ rule: 'always use semicolons' }),
          ],
        },
        's1',
      );
      expect(store.getContext().corrections).toHaveLength(2);

      // Undo only the summarize correction
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ rule: 'actually, summaries are fine' })] },
        's2',
      );

      const ctx = store.getContext();
      expect(ctx.corrections).toHaveLength(1);
      expect(ctx.corrections[0].rule).toBe('always use semicolons');
    });

    it('deactivated corrections do not appear in rendered file', () => {
      store.compoundSignals(
        {
          ...emptySignals(),
          corrections: [
            makeCorrection({ rule: "don't summarize" }),
            makeCorrection({ rule: 'no emoji' }),
          ],
        },
        's1',
      );
      const beforeRender = store.renderContextFile();
      expect(beforeRender).toContain("don't summarize");
      expect(beforeRender).toContain('no emoji');

      // Undo "don't summarize"
      store.compoundSignals(
        { ...emptySignals(), corrections: [makeCorrection({ rule: 'actually, summaries are fine' })] },
        's2',
      );

      const afterRender = store.renderContextFile();
      expect(afterRender).not.toContain("don't summarize");
      expect(afterRender).toContain('no emoji');
    });
  });

  // ─── normalizeCorrection unit tests ─────────────────────────────

  describe('normalizeCorrection', () => {
    it('extracts topic and direction correctly for dont patterns', () => {
      expect(normalizeCorrection("don't summarize")).toEqual({ topic: 'summarize', direction: 'dont' });
      expect(normalizeCorrection('stop using emoji')).toEqual({ topic: 'using emoji', direction: 'dont' });
      expect(normalizeCorrection('never use slang')).toEqual({ topic: 'use slang', direction: 'dont' });
      expect(normalizeCorrection('no abbreviations')).toEqual({ topic: 'abbreviations', direction: 'dont' });
      expect(normalizeCorrection('avoid long answers')).toEqual({ topic: 'long answers', direction: 'dont' });
    });

    it('extracts topic and direction correctly for do patterns', () => {
      expect(normalizeCorrection('actually, summaries are fine')).toEqual({ topic: 'summaries are fine', direction: 'do' });
      expect(normalizeCorrection('you can use emoji again')).toEqual({ topic: 'use emoji again', direction: 'do' });
      expect(normalizeCorrection('feel free to abbreviate')).toEqual({ topic: 'to abbreviate', direction: 'do' });
      expect(normalizeCorrection('go ahead with bullet points')).toEqual({ topic: 'with bullet points', direction: 'do' });
    });

    it('defaults to dont direction for unrecognized prefixes', () => {
      const result = normalizeCorrection('use semicolons');
      expect(result.direction).toBe('dont');
      expect(result.topic).toBe('use semicolons');
    });
  });
});
