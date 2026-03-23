/**
 * Session Lifecycle Tests — list, get, quality scoring, replay.
 *
 * Covers the #178 additions to BrainIntelligence: public session query,
 * 4-dimension quality scoring, and session replay.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from './brain.js';
import { BrainIntelligence } from './intelligence.js';

describe('Session Lifecycle', () => {
  let vault: Vault;
  let brain: Brain;
  let intelligence: BrainIntelligence;

  beforeEach(() => {
    vault = new Vault(':memory:');
    brain = new Brain(vault);
    intelligence = new BrainIntelligence(vault, brain);
  });

  // ─── getSessionById ─────────────────────────────────────────────

  test('getSessionById returns null for non-existent session', () => {
    expect(intelligence.getSessionById('non-existent')).toBeNull();
  });

  test('getSessionById returns session after lifecycle start', () => {
    const session = intelligence.lifecycle({ action: 'start', domain: 'design' });
    const found = intelligence.getSessionById(session.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(session.id);
    expect(found!.domain).toBe('design');
  });

  // ─── listSessions ──────────────────────────────────────────────

  test('listSessions returns all sessions', () => {
    intelligence.lifecycle({ action: 'start', domain: 'design' });
    intelligence.lifecycle({ action: 'start', domain: 'a11y' });
    intelligence.lifecycle({ action: 'start', domain: 'performance' });

    const sessions = intelligence.listSessions();
    expect(sessions.length).toBe(3);
  });

  test('listSessions filters by domain', () => {
    intelligence.lifecycle({ action: 'start', domain: 'design' });
    intelligence.lifecycle({ action: 'start', domain: 'a11y' });
    intelligence.lifecycle({ action: 'start', domain: 'design' });

    const sessions = intelligence.listSessions({ domain: 'design' });
    expect(sessions.length).toBe(2);
    expect(sessions.every((s) => s.domain === 'design')).toBe(true);
  });

  test('listSessions filters active sessions', () => {
    const s1 = intelligence.lifecycle({ action: 'start', domain: 'design' });
    intelligence.lifecycle({ action: 'start', domain: 'a11y' });
    intelligence.lifecycle({ action: 'end', sessionId: s1.id });

    const active = intelligence.listSessions({ active: true });
    expect(active.length).toBe(1);
    expect(active[0].domain).toBe('a11y');

    const completed = intelligence.listSessions({ active: false });
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe(s1.id);
  });

  test('listSessions filters extracted sessions', () => {
    const s1 = intelligence.lifecycle({
      action: 'start',
      domain: 'design',
      toolsUsed: ['tool1', 'tool1', 'tool1'],
    });
    intelligence.lifecycle({ action: 'start', domain: 'a11y' });
    // End s1 — triggers auto-extract since it has tool usage
    intelligence.lifecycle({ action: 'end', sessionId: s1.id });

    const extracted = intelligence.listSessions({ extracted: true });
    expect(extracted.length).toBe(1);
    expect(extracted[0].id).toBe(s1.id);

    const notExtracted = intelligence.listSessions({ extracted: false });
    expect(notExtracted.length).toBe(1);
    expect(notExtracted[0].domain).toBe('a11y');
  });

  test('listSessions respects limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      intelligence.lifecycle({ action: 'start', domain: `d${i}` });
    }

    const page1 = intelligence.listSessions({ limit: 3, offset: 0 });
    expect(page1.length).toBe(3);

    const page2 = intelligence.listSessions({ limit: 3, offset: 3 });
    expect(page2.length).toBe(3);

    // No overlap
    const ids1 = new Set(page1.map((s) => s.id));
    const ids2 = new Set(page2.map((s) => s.id));
    expect([...ids1].some((id) => ids2.has(id))).toBe(false);
  });

  // ─── computeSessionQuality ─────────────────────────────────────

  test('computeSessionQuality throws for non-existent session', () => {
    expect(() => intelligence.computeSessionQuality('nope')).toThrow('Session not found');
  });

  test('minimal session scores low', () => {
    const session = intelligence.lifecycle({ action: 'start' });
    const quality = intelligence.computeSessionQuality(session.id);

    expect(quality.sessionId).toBe(session.id);
    expect(quality.overall).toBe(0);
    expect(quality.completeness).toBe(0);
    expect(quality.artifactDensity).toBe(0);
    expect(quality.toolEngagement).toBe(0);
    expect(quality.outcomeClarity).toBe(0);
  });

  test('completed session with context and domain scores higher', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      domain: 'design',
      context: 'Building a card component',
    });
    intelligence.lifecycle({ action: 'end', sessionId: session.id });

    const quality = intelligence.computeSessionQuality(session.id);
    // ended (10) + context (8) + domain (7) = 25
    expect(quality.completeness).toBe(25);
    expect(quality.overall).toBeGreaterThan(0);
  });

  test('files modified boost artifact density', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      filesModified: ['a.ts', 'b.ts', 'c.ts'],
    });
    const quality = intelligence.computeSessionQuality(session.id);
    // 3 files * 5 = 15
    expect(quality.artifactDensity).toBe(15);
  });

  test('artifact density caps at 25', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      filesModified: Array.from({ length: 20 }, (_, i) => `file-${i}.ts`),
    });
    const quality = intelligence.computeSessionQuality(session.id);
    expect(quality.artifactDensity).toBe(25);
  });

  test('unique tools boost tool engagement', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      toolsUsed: ['search', 'create', 'validate', 'search', 'search'],
    });
    const quality = intelligence.computeSessionQuality(session.id);
    // 3 unique tools * 5 = 15
    expect(quality.toolEngagement).toBe(15);
  });

  test('plan outcome boosts outcome clarity', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      planId: 'plan-123',
    });
    intelligence.lifecycle({
      action: 'end',
      sessionId: session.id,
      planOutcome: 'completed',
    });

    const quality = intelligence.computeSessionQuality(session.id);
    // planId (8) + completed (10) + extractedAt (7, auto-extract fires because planId+planOutcome)
    expect(quality.outcomeClarity).toBe(25);
  });

  test('overall is sum of all dimensions, max 100', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      domain: 'design',
      context: 'Full session',
      toolsUsed: ['t1', 't2', 't3', 't4', 't5'],
      filesModified: ['f1', 'f2', 'f3', 'f4', 'f5'],
      planId: 'plan-1',
    });
    intelligence.lifecycle({
      action: 'end',
      sessionId: session.id,
      planOutcome: 'completed',
    });

    const quality = intelligence.computeSessionQuality(session.id);
    expect(quality.overall).toBe(
      quality.completeness +
        quality.artifactDensity +
        quality.toolEngagement +
        quality.outcomeClarity,
    );
    expect(quality.overall).toBeLessThanOrEqual(100);
  });

  // ─── replaySession ─────────────────────────────────────────────

  test('replaySession throws for non-existent session', () => {
    expect(() => intelligence.replaySession('nope')).toThrow('Session not found');
  });

  test('replaySession returns complete session data', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      domain: 'design',
      context: 'Test replay',
      toolsUsed: ['search', 'search', 'search', 'create'],
      filesModified: ['a.ts', 'b.ts', 'c.ts'],
      planId: 'plan-replay',
    });
    intelligence.lifecycle({
      action: 'end',
      sessionId: session.id,
      planOutcome: 'completed',
    });

    const replay = intelligence.replaySession(session.id);

    expect(replay.session.id).toBe(session.id);
    expect(replay.session.domain).toBe('design');
    expect(replay.quality.overall).toBeGreaterThan(0);
    expect(replay.durationMinutes).not.toBeNull();
    // Auto-extract should have generated proposals
    expect(replay.proposals.length).toBeGreaterThan(0);
  });

  test('replaySession returns null duration for active session', () => {
    const session = intelligence.lifecycle({ action: 'start' });
    const replay = intelligence.replaySession(session.id);
    expect(replay.durationMinutes).toBeNull();
  });

  test('replaySession includes quality scores', () => {
    const session = intelligence.lifecycle({
      action: 'start',
      domain: 'perf',
      context: 'Optimizing queries',
    });

    const replay = intelligence.replaySession(session.id);
    expect(replay.quality.sessionId).toBe(session.id);
    expect(replay.quality.completeness).toBeGreaterThan(0);
  });
});
