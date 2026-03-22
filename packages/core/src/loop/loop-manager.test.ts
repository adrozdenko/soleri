import { describe, it, expect, beforeEach } from 'vitest';
import {
  LoopManager,
  extractPromise,
  detectImplicitCompletion,
  detectAnomaly,
} from './loop-manager.js';
import type { LoopConfig, LoopIteration } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────

function makeConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    mode: 'custom',
    prompt: 'Do the thing',
    maxIterations: 5,
    ...overrides,
  };
}

// ─── extractPromise ───────────────────────────────────────────────

describe('extractPromise', () => {
  it('returns null when no promise tag present', () => {
    expect(extractPromise('just some text')).toBeNull();
  });

  it('extracts text between promise tags', () => {
    expect(extractPromise('before <promise>DONE</promise> after')).toBe('DONE');
  });

  it('trims whitespace and collapses internal spaces', () => {
    expect(extractPromise('<promise>  hello   world  </promise>')).toBe('hello world');
  });

  it('handles multiline content inside tags', () => {
    expect(extractPromise('<promise>\nSALVADOR_VALIDATED\n</promise>')).toBe(
      'SALVADOR_VALIDATED',
    );
  });

  it('extracts only the first match', () => {
    const text = '<promise>FIRST</promise> then <promise>SECOND</promise>';
    expect(extractPromise(text)).toBe('FIRST');
  });
});

// ─── detectImplicitCompletion ─────────────────────────────────────

describe('detectImplicitCompletion', () => {
  it('returns null when no completion signals found', () => {
    const config = makeConfig({ mode: 'custom' });
    expect(detectImplicitCompletion('nothing here', config)).toBeNull();
  });

  // Tier 1: validation score
  it('detects token-migration completion by score', () => {
    const config = makeConfig({ mode: 'token-migration' });
    const output = '{"score": 96}';
    const result = detectImplicitCompletion(output, config);
    expect(result).toContain('score 96');
    expect(result).toContain('target 95');
  });

  it('does not trigger token-migration below target', () => {
    const config = makeConfig({ mode: 'token-migration' });
    expect(detectImplicitCompletion('{"score": 90}', config)).toBeNull();
  });

  it('respects custom targetScore for component-build', () => {
    const config = makeConfig({ mode: 'component-build', targetScore: 85 });
    expect(detectImplicitCompletion('{"score": 86}', config)).toContain('score 86');
  });

  // Tier 2: contrast mode
  it('detects contrast-fix completion when PASS and no FAIL', () => {
    const config = makeConfig({ mode: 'contrast-fix' });
    const result = detectImplicitCompletion('Result: PASS, PASS', config);
    expect(result).toContain('contrast checks PASS');
  });

  it('does not trigger contrast-fix when FAIL present', () => {
    const config = makeConfig({ mode: 'contrast-fix' });
    expect(detectImplicitCompletion('PASS and FAIL', config)).toBeNull();
  });

  // Tier 3: plan grade
  it('detects plan-iteration completion by grade', () => {
    const config = makeConfig({ mode: 'plan-iteration' });
    const result = detectImplicitCompletion('{"grade": "A+"}', config);
    expect(result).toContain('grade A+');
  });

  it('does not trigger plan-iteration with low grade', () => {
    const config = makeConfig({ mode: 'plan-iteration' });
    expect(detectImplicitCompletion('{"grade": "C"}', config)).toBeNull();
  });

  it('respects custom targetGrade', () => {
    const config = makeConfig({ mode: 'plan-iteration', targetGrade: 'B' });
    expect(detectImplicitCompletion('{"grade": "B"}', config)).toContain('grade B');
  });

  // Tier 4: completion language + file mod
  it('detects completion language paired with file modification evidence', () => {
    const output = 'task complete — wrote to src/index.ts';
    const result = detectImplicitCompletion(output, makeConfig());
    expect(result).toContain('completion language');
  });

  it('does not trigger with only completion language (no file mod)', () => {
    expect(detectImplicitCompletion('task complete', makeConfig())).toBeNull();
  });

  // Tier 5: test pass
  it('detects test pass signals', () => {
    const result = detectImplicitCompletion('5 tests passed, 0 fail', makeConfig());
    expect(result).toContain('test suite passing');
  });

  it('detects "all tests passing" variant', () => {
    const result = detectImplicitCompletion('all tests passing', makeConfig());
    expect(result).toContain('test suite passing');
  });
});

// ─── detectAnomaly ────────────────────────────────────────────────

describe('detectAnomaly', () => {
  it('returns null for custom mode (no threshold)', () => {
    const iter: LoopIteration = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      passed: false,
      durationMs: 10,
      validationScore: 0,
    };
    expect(detectAnomaly(iter, 'custom')).toBeNull();
  });

  it('flags fast low-score iteration in token-migration', () => {
    const iter: LoopIteration = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      passed: false,
      durationMs: 100,
      validationScore: 10,
    };
    const result = detectAnomaly(iter, 'token-migration');
    expect(result).toContain('Anomaly');
    expect(result).toContain('100ms');
  });

  it('does not flag when iteration passes', () => {
    const iter: LoopIteration = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      passed: true,
      durationMs: 100,
      validationScore: 10,
    };
    expect(detectAnomaly(iter, 'token-migration')).toBeNull();
  });

  it('does not flag when duration exceeds minimum', () => {
    const iter: LoopIteration = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      passed: false,
      durationMs: 10000,
      validationScore: 10,
    };
    expect(detectAnomaly(iter, 'token-migration')).toBeNull();
  });
});

// ─── LoopManager ──────────────────────────────────────────────────

describe('LoopManager', () => {
  let mgr: LoopManager;

  beforeEach(() => {
    mgr = new LoopManager();
  });

  // ─── startLoop ────────────────────────────────────────────────

  describe('startLoop', () => {
    it('creates a loop with active status', () => {
      const loop = mgr.startLoop(makeConfig());
      expect(loop.status).toBe('active');
      expect(loop.id).toMatch(/^loop-\d+$/);
      expect(loop.iterations).toHaveLength(0);
      expect(loop.startedAt).toBeTruthy();
    });

    it('throws on double-start', () => {
      mgr.startLoop(makeConfig());
      expect(() => mgr.startLoop(makeConfig())).toThrow(/already active/i);
    });

    it('preserves config on the returned state', () => {
      const config = makeConfig({ mode: 'plan-iteration', prompt: 'test' });
      const loop = mgr.startLoop(config);
      expect(loop.config.mode).toBe('plan-iteration');
      expect(loop.config.prompt).toBe('test');
    });
  });

  // ─── isActive / getStatus ─────────────────────────────────────

  describe('isActive / getStatus', () => {
    it('returns false and null when no loop', () => {
      expect(mgr.isActive()).toBe(false);
      expect(mgr.getStatus()).toBeNull();
    });

    it('returns true and loop after start', () => {
      mgr.startLoop(makeConfig());
      expect(mgr.isActive()).toBe(true);
      expect(mgr.getStatus()?.status).toBe('active');
    });
  });

  // ─── iterate (simple API) ─────────────────────────────────────

  describe('iterate', () => {
    it('throws when no active loop', () => {
      expect(() => mgr.iterate({ passed: true })).toThrow(/no active loop/i);
    });

    it('records iterations sequentially', () => {
      mgr.startLoop(makeConfig({ maxIterations: 10 }));
      const i1 = mgr.iterate({ passed: false, validationScore: 50 });
      const i2 = mgr.iterate({ passed: false, validationScore: 70 });
      expect(i1.iteration).toBe(1);
      expect(i2.iteration).toBe(2);
      expect(mgr.getStatus()!.iterations).toHaveLength(2);
    });

    it('transitions to max-iterations when limit reached and not passing', () => {
      mgr.startLoop(makeConfig({ maxIterations: 2 }));
      mgr.iterate({ passed: false });
      mgr.iterate({ passed: false });

      expect(mgr.isActive()).toBe(false);
      expect(mgr.getHistory()).toHaveLength(1);
      expect(mgr.getHistory()[0].status).toBe('max-iterations');
    });

    it('does not auto-complete when iteration passes', () => {
      mgr.startLoop(makeConfig({ maxIterations: 2 }));
      mgr.iterate({ passed: true });
      expect(mgr.isActive()).toBe(true);
    });

    it('does not transition to max-iterations if last iteration passes', () => {
      mgr.startLoop(makeConfig({ maxIterations: 2 }));
      mgr.iterate({ passed: false });
      mgr.iterate({ passed: true });
      // passed=true means we don't trigger max-iterations even at limit
      expect(mgr.isActive()).toBe(true);
    });
  });

  // ─── completeLoop ─────────────────────────────────────────────

  describe('completeLoop', () => {
    it('throws when no active loop', () => {
      expect(() => mgr.completeLoop()).toThrow(/no active loop/i);
    });

    it('marks loop as completed and clears active', () => {
      mgr.startLoop(makeConfig());
      mgr.iterate({ passed: true });
      const completed = mgr.completeLoop();

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();
      expect(mgr.isActive()).toBe(false);
      expect(mgr.getHistory()).toHaveLength(1);
    });

    it('adds entry to history entries', () => {
      mgr.startLoop(makeConfig({ mode: 'contrast-fix', intent: 'FIX' }));
      mgr.completeLoop();

      const entries = mgr.getHistoryEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].outcome).toBe('completed');
      expect(entries[0].mode).toBe('contrast-fix');
      expect(entries[0].intent).toBe('FIX');
    });
  });

  // ─── cancelLoop ───────────────────────────────────────────────

  describe('cancelLoop', () => {
    it('throws when no active loop', () => {
      expect(() => mgr.cancelLoop()).toThrow(/no active loop/i);
    });

    it('marks loop as cancelled and clears active', () => {
      mgr.startLoop(makeConfig());
      const cancelled = mgr.cancelLoop();

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.completedAt).toBeTruthy();
      expect(mgr.isActive()).toBe(false);
    });

    it('records cancelled outcome in history entries', () => {
      mgr.startLoop(makeConfig());
      mgr.cancelLoop();
      expect(mgr.getHistoryEntries()[0].outcome).toBe('cancelled');
    });
  });

  // ─── getHistory / getHistoryEntries ───────────────────────────

  describe('getHistory', () => {
    it('accumulates multiple completed loops', () => {
      mgr.startLoop(makeConfig());
      mgr.completeLoop();
      mgr.startLoop(makeConfig());
      mgr.cancelLoop();

      expect(mgr.getHistory()).toHaveLength(2);
      expect(mgr.getHistoryEntries()).toHaveLength(2);
    });

    it('returns copies (not references)', () => {
      mgr.startLoop(makeConfig());
      mgr.completeLoop();
      const h1 = mgr.getHistory();
      const h2 = mgr.getHistory();
      expect(h1).not.toBe(h2);
    });
  });

  // ─── iterateWithGate ──────────────────────────────────────────

  describe('iterateWithGate', () => {
    it('returns allow with reason when no active loop', () => {
      const result = mgr.iterateWithGate('some output');
      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('No active loop');
    });

    it('detects completion promise and ends loop', () => {
      mgr.startLoop(makeConfig({ completionPromise: 'SALVADOR_VALIDATED' }));
      const result = mgr.iterateWithGate(
        'Done! <promise>SALVADOR_VALIDATED</promise>',
      );

      expect(result.decision).toBe('allow');
      expect(result.outcome).toBe('completed');
      expect(mgr.isActive()).toBe(false);
    });

    it('does not trigger on wrong promise text', () => {
      mgr.startLoop(makeConfig({ completionPromise: 'SALVADOR_VALIDATED' }));
      const result = mgr.iterateWithGate('<promise>WRONG</promise>');
      expect(result.decision).toBe('block');
    });

    it('detects heuristic completion (auto-completed flag)', () => {
      mgr.startLoop(makeConfig({ mode: 'contrast-fix' }));
      const result = mgr.iterateWithGate('All checks: PASS PASS PASS');

      expect(result.decision).toBe('allow');
      expect(result.autoCompleted).toBe(true);
      expect(mgr.isActive()).toBe(false);
    });

    it('blocks and returns prompt when loop should continue', () => {
      mgr.startLoop(
        makeConfig({
          mode: 'custom',
          prompt: 'Fix the tokens',
          maxIterations: 10,
        }),
      );
      const result = mgr.iterateWithGate('still working');

      expect(result.decision).toBe('block');
      expect(result.prompt).toContain('Fix the tokens');
      expect(result.systemMessage).toContain('Iteration 1/10');
      expect(result.systemMessage).toContain('custom');
      expect(result.iteration).toBe(1);
    });

    it('appends validationInstructions to prompt', () => {
      mgr.startLoop(
        makeConfig({
          prompt: 'Base prompt',
          validationInstructions: 'Run npm test',
          maxIterations: 10,
        }),
      );
      const result = mgr.iterateWithGate('working');
      expect(result.prompt).toContain('Base prompt');
      expect(result.prompt).toContain('Run npm test');
    });

    it('reaches max iterations and returns allow', () => {
      mgr.startLoop(makeConfig({ maxIterations: 2 }));
      mgr.iterateWithGate('attempt 1'); // pushes iteration 1, length now 1
      mgr.iterateWithGate('attempt 2'); // pushes iteration 2, length now 2
      const result = mgr.iterateWithGate('attempt 3'); // length=2 >= max, triggers allow

      expect(result.decision).toBe('allow');
      expect(result.outcome).toBe('max_iterations');
      expect(mgr.isActive()).toBe(false);
    });

    it('accumulates knowledge across iterations', () => {
      mgr.startLoop(makeConfig({ maxIterations: 10 }));
      mgr.iterateWithGate('output', {
        items: ['learned A'],
        patternsApplied: ['pattern-1'],
      });
      mgr.iterateWithGate('output', {
        items: ['learned B'],
        antiPatternsAvoided: ['anti-1'],
      });

      // Loop is still active — check knowledge via status
      const status = mgr.getStatus()!;
      expect(status.knowledge?.items).toEqual(['learned A', 'learned B']);
      expect(status.knowledge?.patternsApplied).toEqual(['pattern-1']);
      expect(status.knowledge?.antiPatternsAvoided).toEqual(['anti-1']);
    });

    it('includes anomaly warning for fast low-score iterations', () => {
      mgr.startLoop(makeConfig({ mode: 'token-migration', maxIterations: 10 }));
      const result = mgr.iterateWithGate('output', undefined, 50);

      expect(result.decision).toBe('block');
      expect(result.anomalyWarning).toContain('Anomaly');
    });

    it('shows correct validation hint per mode', () => {
      const modes = [
        { mode: 'token-migration' as const, hint: 'tokens check' },
        { mode: 'contrast-fix' as const, hint: 'contrast check' },
        { mode: 'component-build' as const, hint: 'full check' },
        { mode: 'plan-iteration' as const, hint: 'plan grading' },
        { mode: 'custom' as const, hint: 'Complete the task' },
      ];

      for (const { mode, hint } of modes) {
        const m = new LoopManager();
        m.startLoop(makeConfig({ mode, maxIterations: 10 }));
        const result = m.iterateWithGate('output');
        expect(result.systemMessage).toContain(hint);
      }
    });

    it('includes completion promise instruction in system message', () => {
      mgr.startLoop(
        makeConfig({
          completionPromise: 'DONE',
          maxIterations: 10,
        }),
      );
      const result = mgr.iterateWithGate('working');
      expect(result.systemMessage).toContain('<promise>DONE</promise>');
    });

    it('shows unlimited when maxIterations is 0', () => {
      mgr.startLoop(makeConfig({ maxIterations: 0 }));
      const result = mgr.iterateWithGate('output');
      expect(result.systemMessage).toContain('unlimited');
    });
  });

  // ─── Full lifecycle: start → iterate → complete ───────────────

  describe('full lifecycle', () => {
    it('start → iterate → gate-complete via promise', () => {
      mgr.startLoop(
        makeConfig({
          completionPromise: 'VALIDATED',
          maxIterations: 20,
        }),
      );

      // First iteration — not done
      const r1 = mgr.iterateWithGate('Still working on it');
      expect(r1.decision).toBe('block');

      // Second iteration — promise detected
      const r2 = mgr.iterateWithGate('<promise>VALIDATED</promise>');
      expect(r2.decision).toBe('allow');
      expect(r2.outcome).toBe('completed');

      // Verify history
      expect(mgr.getHistory()).toHaveLength(1);
      expect(mgr.getHistoryEntries()[0].outcome).toBe('completed');
      expect(mgr.getHistoryEntries()[0].iterations).toBe(1);
    });

    it('allows starting a new loop after previous completes', () => {
      mgr.startLoop(makeConfig());
      mgr.completeLoop();
      const loop2 = mgr.startLoop(makeConfig({ mode: 'contrast-fix' }));
      expect(loop2.config.mode).toBe('contrast-fix');
      expect(mgr.isActive()).toBe(true);
    });

    it('allows starting a new loop after cancel', () => {
      mgr.startLoop(makeConfig());
      mgr.cancelLoop();
      mgr.startLoop(makeConfig());
      expect(mgr.isActive()).toBe(true);
    });
  });
});
