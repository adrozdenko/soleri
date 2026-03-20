import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { IntentRouter } from '../control/intent-router.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OperationalMode } from '../control/types.js';

describe('IntentRouter', () => {
  let runtime: AgentRuntime;
  let router: IntentRouter;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'intent-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'intent-test',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    router = new IntentRouter(runtime.vault);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  // ─── Default Modes ──────────────────────────────────────────────────

  it('should seed 10 default modes', () => {
    const modes = router.getModes();
    expect(modes).toHaveLength(10);
  });

  it('should include all expected modes', () => {
    const modeNames = router.getModes().map((m) => m.mode);
    expect(modeNames).toContain('BUILD-MODE');
    expect(modeNames).toContain('FIX-MODE');
    expect(modeNames).toContain('VALIDATE-MODE');
    expect(modeNames).toContain('DESIGN-MODE');
    expect(modeNames).toContain('IMPROVE-MODE');
    expect(modeNames).toContain('DELIVER-MODE');
    expect(modeNames).toContain('EXPLORE-MODE');
    expect(modeNames).toContain('PLAN-MODE');
    expect(modeNames).toContain('REVIEW-MODE');
    expect(modeNames).toContain('GENERAL-MODE');
  });

  it('should start in GENERAL-MODE', () => {
    expect(router.getCurrentMode()).toBe('GENERAL-MODE');
  });

  // ─── Intent Classification ──────────────────────────────────────────

  it('should route "fix this bug" to FIX-MODE', () => {
    const result = router.routeIntent('fix this bug');
    expect(result.intent).toBe('fix');
    expect(result.mode).toBe('FIX-MODE');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.method).toBe('keyword');
    expect(result.matchedKeywords).toContain('fix');
    expect(result.matchedKeywords).toContain('bug');
  });

  it('should route "build a new feature" to BUILD-MODE', () => {
    const result = router.routeIntent('build a new feature');
    expect(result.intent).toBe('build');
    expect(result.mode).toBe('BUILD-MODE');
    expect(result.matchedKeywords).toContain('build');
    expect(result.matchedKeywords).toContain('new');
    expect(result.matchedKeywords).toContain('feature');
  });

  it('should route "refactor the auth module" to IMPROVE-MODE', () => {
    const result = router.routeIntent('refactor the auth module');
    expect(result.intent).toBe('improve');
    expect(result.mode).toBe('IMPROVE-MODE');
  });

  it('should route "deploy to production" to DELIVER-MODE', () => {
    const result = router.routeIntent('deploy to production');
    expect(result.intent).toBe('deliver');
    expect(result.mode).toBe('DELIVER-MODE');
  });

  it('should route "review this code" to REVIEW-MODE', () => {
    const result = router.routeIntent('review this code');
    expect(result.intent).toBe('review');
    expect(result.mode).toBe('REVIEW-MODE');
  });

  it('should route "plan the architect strategy" to PLAN-MODE', () => {
    const result = router.routeIntent('plan the architect strategy');
    expect(result.intent).toBe('plan');
    expect(result.mode).toBe('PLAN-MODE');
    expect(result.matchedKeywords).toContain('plan');
    expect(result.matchedKeywords).toContain('architect');
    expect(result.matchedKeywords).toContain('strategy');
  });

  it('should fall back to GENERAL-MODE for unrecognized input', () => {
    const result = router.routeIntent('hello there how are you');
    expect(result.intent).toBe('general');
    expect(result.mode).toBe('GENERAL-MODE');
    expect(result.confidence).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
  });

  it('should update current mode after routing', () => {
    router.routeIntent('fix this bug');
    expect(router.getCurrentMode()).toBe('FIX-MODE');
  });

  it('should handle case-insensitive matching', () => {
    const result = router.routeIntent('FIX this BUG');
    expect(result.intent).toBe('fix');
    expect(result.mode).toBe('FIX-MODE');
  });

  it('should cap confidence at 1.0', () => {
    const result = router.routeIntent('fix bug broken error crash issue debug repair janky');
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  // ─── Mode Management ───────────────────────────────────────────────

  it('should morph to a specified mode', () => {
    const result = router.morph('BUILD-MODE');
    expect(result.previousMode).toBe('GENERAL-MODE');
    expect(result.currentMode).toBe('BUILD-MODE');
    expect(result.behaviorRules.length).toBeGreaterThan(0);
    expect(router.getCurrentMode()).toBe('BUILD-MODE');
  });

  it('should throw on morph to unknown mode with available modes listed', () => {
    expect(() => router.morph('UNKNOWN-MODE' as OperationalMode)).toThrow(
      /Unknown mode: UNKNOWN-MODE\. Available: /,
    );
    expect(() => router.morph('UNKNOWN-MODE' as OperationalMode)).toThrow(/BUILD-MODE/);
    expect(() => router.morph('UNKNOWN-MODE' as OperationalMode)).toThrow(/GENERAL-MODE/);
  });

  it('should morph with "reset" to GENERAL-MODE', () => {
    router.morph('BUILD-MODE');
    expect(router.getCurrentMode()).toBe('BUILD-MODE');
    const result = router.morph('reset' as OperationalMode);
    expect(result.previousMode).toBe('BUILD-MODE');
    expect(result.currentMode).toBe('GENERAL-MODE');
    expect(router.getCurrentMode()).toBe('GENERAL-MODE');
  });

  it('should get behavior rules for current mode', () => {
    router.morph('FIX-MODE');
    const rules = router.getBehaviorRules();
    expect(rules).toContain('Identify root cause first');
  });

  it('should get behavior rules for a specific mode', () => {
    const rules = router.getBehaviorRules('DESIGN-MODE');
    expect(rules).toContain('Use semantic tokens');
  });

  it('should return empty rules for unknown mode', () => {
    const rules = router.getBehaviorRules('NONEXISTENT' as OperationalMode);
    expect(rules).toEqual([]);
  });

  // ─── Custom Modes ──────────────────────────────────────────────────

  it('should register a custom mode', () => {
    router.registerMode({
      mode: 'CUSTOM-MODE' as OperationalMode,
      intent: 'general' as const,
      description: 'Custom test mode',
      behaviorRules: ['Custom rule'],
      keywords: ['custom', 'special'],
    });
    const modes = router.getModes();
    expect(modes.length).toBe(11);
    const custom = modes.find((m) => m.mode === 'CUSTOM-MODE');
    expect(custom).toBeDefined();
    expect(custom!.keywords).toContain('custom');
  });

  it('should route to custom mode', () => {
    router.registerMode({
      mode: 'CUSTOM-MODE' as OperationalMode,
      intent: 'general' as const,
      description: 'Custom test mode',
      behaviorRules: ['Custom rule'],
      keywords: ['custom', 'special'],
    });
    const result = router.routeIntent('do something custom and special');
    expect(result.mode).toBe('CUSTOM-MODE');
  });

  it('should update mode rules', () => {
    router.updateModeRules('BUILD-MODE', ['New rule 1', 'New rule 2']);
    const rules = router.getBehaviorRules('BUILD-MODE');
    expect(rules).toEqual(['New rule 1', 'New rule 2']);
  });

  it('should throw on updating unknown mode rules', () => {
    expect(() => router.updateModeRules('NONEXISTENT' as OperationalMode, ['Rule'])).toThrow(
      'Unknown mode',
    );
  });

  // ─── Analytics ──────────────────────────────────────────────────────

  it('should track routing stats', () => {
    router.routeIntent('fix this bug');
    router.routeIntent('build a feature');
    router.routeIntent('fix another error');
    router.routeIntent('hello there');

    const stats = router.getRoutingStats();
    expect(stats.totalRouted).toBe(4);
    expect(stats.byIntent.fix).toBe(2);
    expect(stats.byIntent.build).toBe(1);
    expect(stats.byIntent.general).toBe(1);
    expect(stats.byMode['FIX-MODE']).toBe(2);
    expect(stats.byMode['BUILD-MODE']).toBe(1);
  });

  it('should return empty stats initially', () => {
    const stats = router.getRoutingStats();
    expect(stats.totalRouted).toBe(0);
    expect(stats.byIntent).toEqual({});
    expect(stats.byMode).toEqual({});
  });
});
