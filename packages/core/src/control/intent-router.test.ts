/**
 * IntentRouter — Contract tests for keyword-based intent classification,
 * mode management, routing feedback, and analytics.
 *
 * Contract:
 *  - routeIntent() classifies prompts via keyword matching with stemming
 *  - morph() switches operational mode and returns behavior rules
 *  - getBehaviorRules() returns rules for current or specified mode
 *  - registerMode() allows custom mode registration
 *  - updateModeRules() replaces behavior rules for an existing mode
 *  - recordRoutingFeedback() persists feedback; getRoutingAccuracy() reports on it
 *  - getRoutingStats() returns aggregate counts by intent and mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { IntentRouter } from './intent-router.js';
import type { ModeConfig, OperationalMode } from './types.js';

describe('IntentRouter', () => {
  let vault: Vault;
  let router: IntentRouter;

  beforeEach(() => {
    vault = new Vault(':memory:');
    router = new IntentRouter(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Construction ──────────────────────────────────────────────

  describe('construction', () => {
    it('seeds 10 default modes on first creation', () => {
      const modes = router.getModes();
      expect(modes.length).toBe(11);
    });

    it('starts in GENERAL-MODE', () => {
      expect(router.getCurrentMode()).toBe('GENERAL-MODE');
    });

    it('is idempotent — second instance does not duplicate modes', () => {
      const router2 = new IntentRouter(vault);
      expect(router2.getModes().length).toBe(11);
    });
  });

  // ─── routeIntent ──────────────────────────────────────────────

  describe('routeIntent', () => {
    it('classifies "fix the broken login" as FIX intent', () => {
      const result = router.routeIntent('fix the broken login');
      expect(result.intent).toBe('fix');
      expect(result.mode).toBe('FIX-MODE');
      expect(result.method).toBe('keyword');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.matchedKeywords.length).toBe(2);
    });

    it('classifies "build a new component" as BUILD intent', () => {
      const result = router.routeIntent('build a new component');
      expect(result.intent).toBe('build');
      expect(result.mode).toBe('BUILD-MODE');
    });

    it('classifies "deploy to production" as DELIVER intent', () => {
      const result = router.routeIntent('deploy to production');
      expect(result.intent).toBe('deliver');
      expect(result.mode).toBe('DELIVER-MODE');
    });

    it('classifies "deliver version 9.18.0 to production" as DELIVER intent', () => {
      const result = router.routeIntent('deliver version 9.18.0 to production');
      expect(result.intent).toBe('deliver');
      expect(result.mode).toBe('DELIVER-MODE');
      expect(result.matchedKeywords).toContain('deliver');
    });

    it('classifies "refactor the data layer" as IMPROVE intent', () => {
      const result = router.routeIntent('refactor the data layer');
      expect(result.intent).toBe('improve');
      expect(result.mode).toBe('IMPROVE-MODE');
    });

    it('classifies "review this pull request" as REVIEW intent', () => {
      const result = router.routeIntent('review this pull request');
      expect(result.intent).toBe('review');
      expect(result.mode).toBe('REVIEW-MODE');
    });

    it('falls back to GENERAL when no keywords match', () => {
      const result = router.routeIntent('hello how are you today');
      expect(result.intent).toBe('general');
      expect(result.mode).toBe('GENERAL-MODE');
      expect(result.confidence).toBe(0);
      expect(result.matchedKeywords).toEqual([]);
    });

    it('updates currentMode after routing', () => {
      router.routeIntent('fix the bug');
      expect(router.getCurrentMode()).toBe('FIX-MODE');
    });

    it('handles stemmed forms — "crashes" matches "crash" keyword', () => {
      const result = router.routeIntent('the app crashes on startup');
      expect(result.intent).toBe('fix');
      expect(result.matchedKeywords).toContain('crash');
    });

    it('handles stemmed forms — "deploying" matches "deploy" keyword', () => {
      const result = router.routeIntent('deploying the new release');
      expect(result.intent).toBe('deliver');
    });

    it('handles stemmed forms — "creating" matches "create" keyword', () => {
      const result = router.routeIntent('creating a new module');
      expect(result.intent).toBe('build');
    });

    it('picks the mode with the most keyword matches', () => {
      // "fix bug broken error" has 4 FIX keywords vs anything else
      const result = router.routeIntent('fix bug broken error');
      expect(result.intent).toBe('fix');
      expect(result.matchedKeywords.length).toBe(4);
    });

    it('classifies "plan the architecture for the new auth module" as PLAN (not BUILD)', () => {
      // Tie-breaking: PLAN matches "plan" + "architecture" (2) vs BUILD matches "new" (1)
      const result = router.routeIntent('plan the architecture for the new auth module');
      expect(result.intent).toBe('plan');
      expect(result.mode).toBe('PLAN-MODE');
    });

    it('BUILD does not shadow PLAN on a tie — BUILD iterates last', () => {
      // "new plan" → PLAN matches "plan" (1), BUILD matches "new" (1). Tie → PLAN wins.
      const result = router.routeIntent('new plan');
      expect(result.intent).toBe('plan');
    });

    it('confidence is capped at 1.0', () => {
      // Even with many matches, confidence <= 1
      const result = router.routeIntent(
        'fix bug broken error crash issue debug repair janky fail wrong stuck regression fault defect',
      );
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('logs routing to agent_routing_log', () => {
      router.routeIntent('fix something');
      const stats = router.getRoutingStats();
      expect(stats.totalRouted).toBe(1);
      expect(stats.byIntent['fix']).toBe(1);
    });
  });

  // ─── morph ────────────────────────────────────────────────────

  describe('morph', () => {
    it('switches mode and returns previous/current modes', () => {
      const result = router.morph('BUILD-MODE');
      expect(result.previousMode).toBe('GENERAL-MODE');
      expect(result.currentMode).toBe('BUILD-MODE');
      expect(router.getCurrentMode()).toBe('BUILD-MODE');
    });

    it('returns behavior rules for the target mode', () => {
      const result = router.morph('FIX-MODE');
      expect(result.behaviorRules).toContain('Identify root cause first');
    });

    it('throws for unknown mode with available modes listed', () => {
      expect(() => router.morph('NONEXISTENT-MODE' as OperationalMode)).toThrow(
        /Unknown mode.*Available/,
      );
    });

    it('handles "reset" alias to GENERAL-MODE', () => {
      router.morph('BUILD-MODE');
      const result = router.morph('reset' as OperationalMode);
      expect(result.currentMode).toBe('GENERAL-MODE');
      expect(result.previousMode).toBe('BUILD-MODE');
    });
  });

  // ─── getBehaviorRules ─────────────────────────────────────────

  describe('getBehaviorRules', () => {
    it('returns rules for current mode when no argument', () => {
      router.morph('DESIGN-MODE');
      const rules = router.getBehaviorRules();
      expect(rules).toContain('Use semantic tokens');
    });

    it('returns rules for a specified mode', () => {
      const rules = router.getBehaviorRules('PLAN-MODE');
      expect(rules).toContain('Consider trade-offs');
    });

    it('returns empty array for unknown mode', () => {
      const rules = router.getBehaviorRules('FAKE-MODE' as OperationalMode);
      expect(rules).toEqual([]);
    });
  });

  // ─── registerMode ─────────────────────────────────────────────

  describe('registerMode', () => {
    const customMode: ModeConfig = {
      mode: 'CUSTOM-MODE' as OperationalMode,
      intent: 'general' as const,
      description: 'A custom test mode',
      behaviorRules: ['Rule A', 'Rule B'],
      keywords: ['custom', 'special'],
    };

    it('adds a new mode to the database', () => {
      router.registerMode(customMode);
      const modes = router.getModes();
      expect(modes.length).toBe(12);
      const found = modes.find((m) => m.mode === 'CUSTOM-MODE');
      expect(found).toBeDefined();
      expect(found!.keywords).toEqual(['custom', 'special']);
    });

    it('registered mode participates in routing', () => {
      router.registerMode(customMode);
      const result = router.routeIntent('do something custom and special');
      expect(result.mode).toBe('CUSTOM-MODE');
    });

    it('overwrites existing mode on re-register', () => {
      router.registerMode(customMode);
      router.registerMode({ ...customMode, description: 'Updated' });
      const modes = router.getModes();
      const found = modes.find((m) => m.mode === 'CUSTOM-MODE');
      expect(found!.description).toBe('Updated');
    });
  });

  // ─── updateModeRules ──────────────────────────────────────────

  describe('updateModeRules', () => {
    it('replaces behavior rules for an existing mode', () => {
      router.updateModeRules('BUILD-MODE', ['New Rule 1', 'New Rule 2']);
      const rules = router.getBehaviorRules('BUILD-MODE');
      expect(rules).toEqual(['New Rule 1', 'New Rule 2']);
    });

    it('throws for unknown mode', () => {
      expect(() => router.updateModeRules('NOPE-MODE' as OperationalMode, ['x'])).toThrow(
        /Unknown mode/,
      );
    });
  });

  // ─── Routing Feedback ─────────────────────────────────────────

  describe('recordRoutingFeedback / getRoutingAccuracy', () => {
    it('records feedback and reports accuracy', () => {
      const fb = router.recordRoutingFeedback({
        initialIntent: 'fix',
        actualIntent: 'fix',
        confidence: 0.8,
        correction: false,
      });
      expect(fb.recorded).toBe(true);
      expect(fb.id).toBeGreaterThan(0);

      const report = router.getRoutingAccuracy(30);
      expect(report.total).toBe(1);
      expect(report.correct).toBe(1);
      expect(report.accuracy).toBe(100);
    });

    it('tracks corrections and misroutes', () => {
      router.recordRoutingFeedback({
        initialIntent: 'fix',
        actualIntent: 'build',
        confidence: 0.5,
        correction: true,
      });

      const report = router.getRoutingAccuracy(30);
      expect(report.corrections).toBe(1);
      expect(report.commonMisroutes.length).toBe(1);
      expect(report.commonMisroutes[0]).toEqual({ from: 'fix', to: 'build', count: 1 });
    });

    it('groups confidence into calibration buckets', () => {
      router.recordRoutingFeedback({
        initialIntent: 'fix',
        actualIntent: 'fix',
        confidence: 0.9,
        correction: false,
      });
      router.recordRoutingFeedback({
        initialIntent: 'build',
        actualIntent: 'build',
        confidence: 0.5,
        correction: false,
      });
      router.recordRoutingFeedback({
        initialIntent: 'plan',
        actualIntent: 'review',
        confidence: 0.2,
        correction: true,
      });

      const report = router.getRoutingAccuracy(30);
      expect(report.confidenceCalibration['high']).toEqual({
        total: 1,
        correct: 1,
        accuracy: 100,
      });
      expect(report.confidenceCalibration['medium']).toEqual({
        total: 1,
        correct: 1,
        accuracy: 100,
      });
      expect(report.confidenceCalibration['low']).toEqual({
        total: 1,
        correct: 0,
        accuracy: 0,
      });
    });

    it('returns 100% accuracy when no feedback exists', () => {
      const report = router.getRoutingAccuracy(30);
      expect(report.accuracy).toBe(100);
      expect(report.total).toBe(0);
    });
  });

  // ─── getRoutingStats ──────────────────────────────────────────

  describe('getRoutingStats', () => {
    it('returns zeroes when no routing has occurred', () => {
      const stats = router.getRoutingStats();
      expect(stats.totalRouted).toBe(0);
      expect(stats.byIntent).toEqual({});
      expect(stats.byMode).toEqual({});
    });

    it('aggregates counts by intent and mode', () => {
      router.routeIntent('fix the bug');
      router.routeIntent('fix another issue');
      router.routeIntent('build a widget');

      const stats = router.getRoutingStats();
      expect(stats.totalRouted).toBe(3);
      expect(stats.byIntent['fix']).toBe(2);
      expect(stats.byIntent['build']).toBe(1);
      expect(stats.byMode['FIX-MODE']).toBe(2);
      expect(stats.byMode['BUILD-MODE']).toBe(1);
    });
  });

  // ─── YOLO-MODE ───────────────────────────────────────────────

  describe('YOLO-MODE', () => {
    it('route_intent with "yolo" returns YOLO-MODE', () => {
      const result = router.routeIntent('go yolo on this task');
      expect(result.intent).toBe('yolo');
      expect(result.mode).toBe('YOLO-MODE');
      expect(result.matchedKeywords).toContain('yolo');
    });

    it('morph to YOLO-MODE succeeds when hook pack is installed', () => {
      const result = router.morph('YOLO-MODE', { hookPackInstalled: true });
      expect(result.previousMode).toBe('GENERAL-MODE');
      expect(result.currentMode).toBe('YOLO-MODE');
      expect(result.behaviorRules.length).toBe(5);
      expect(result.blocked).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('morph to YOLO-MODE fails when hook pack is missing', () => {
      const result = router.morph('YOLO-MODE');
      expect(result.blocked).toBe(true);
      expect(result.error).toContain('yolo-safety hook pack');
      expect(result.error).toContain('soleri hooks add-pack yolo-safety');
      expect(result.currentMode).toBe('GENERAL-MODE'); // unchanged
      expect(router.getCurrentMode()).toBe('GENERAL-MODE'); // not switched
    });

    it('morph to YOLO-MODE fails when hookPackInstalled is explicitly false', () => {
      const result = router.morph('YOLO-MODE', { hookPackInstalled: false });
      expect(result.blocked).toBe(true);
      expect(result.error).toContain('yolo-safety hook pack');
      expect(router.getCurrentMode()).toBe('GENERAL-MODE');
    });

    it('morph to other modes is unaffected by the gate', () => {
      const result = router.morph('BUILD-MODE');
      expect(result.currentMode).toBe('BUILD-MODE');
      expect(result.blocked).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(router.getCurrentMode()).toBe('BUILD-MODE');
    });

    it('get_behavior_rules returns 5 rules', () => {
      const rules = router.getBehaviorRules('YOLO-MODE');
      expect(rules).toHaveLength(5);
      expect(rules[0]).toContain('Skip plan approval gates');
      expect(rules[1]).toContain('orchestrate_complete');
      expect(rules[2]).toContain('vault gather-before-execute');
      expect(rules[3]).toContain('Hook pack must be installed');
      expect(rules[4]).toContain('exit YOLO');
    });

    it('all keywords route to YOLO-MODE', () => {
      const keywords = [
        'yolo',
        'autonomous',
        'fire-and-forget',
        'hands-off',
        'no-approval',
        'skip-gates',
        'full-auto',
      ];
      for (const kw of keywords) {
        const result = router.routeIntent(kw);
        expect(result.mode).toBe('YOLO-MODE');
      }
    });
  });

  // ─── getModes ─────────────────────────────────────────────────

  describe('getModes', () => {
    it('returns all modes with BUILD-MODE last (tie-breaking order)', () => {
      const modes = router.getModes();
      const names = modes.map((m) => m.mode);
      expect(names[names.length - 1]).toBe('BUILD-MODE');
      // All non-BUILD modes are in alphabetical order
      const nonBuild = names.filter((n) => n !== 'BUILD-MODE');
      expect(nonBuild).toEqual([...nonBuild].sort());
    });

    it('each mode has intent, description, behaviorRules, and keywords', () => {
      const modes = router.getModes();
      for (const mode of modes) {
        expect(typeof mode.intent).toBe('string');
        expect(typeof mode.description).toBe('string');
        expect(Array.isArray(mode.behaviorRules)).toBe(true);
        expect(Array.isArray(mode.keywords)).toBe(true);
      }
    });
  });
});
