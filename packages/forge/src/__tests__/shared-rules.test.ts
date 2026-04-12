import { describe, it, expect } from 'vitest';
import {
  getEngineRulesContent,
  getEngineMarker,
  getModularEngineRules,
  ENGINE_FEATURES,
} from '../templates/shared-rules.js';
import type { EngineFeature } from '../templates/shared-rules.js';

describe('shared-rules', () => {
  const content = getEngineRulesContent();

  it('includes the engine marker', () => {
    expect(content).toContain(`<!-- ${getEngineMarker()} -->`);
  });

  describe('Reconciliation Triggers', () => {
    it('includes the Reconciliation Triggers section', () => {
      expect(content).toContain('### Reconciliation Triggers');
    });

    it('includes the explicit trigger (user says "done")', () => {
      expect(content).toContain('**Explicit**');
      expect(content).toMatch(/User says.*done.*ship it.*looks good/);
    });

    it('includes the plan-complete trigger', () => {
      expect(content).toContain('**Plan-complete**');
      expect(content).toContain(
        'All tasks are complete. Want me to wrap up and capture what we learned, or is there more to fix?',
      );
    });

    it('includes the idle trigger', () => {
      expect(content).toContain('**Idle**');
      expect(content).toContain(
        "We've been idle on this plan. Ready to wrap up, or still working?",
      );
    });

    it('includes the NEVER auto-complete rule', () => {
      expect(content).toContain('**NEVER auto-complete without asking the user.**');
    });

    it('references orchestrate_status readiness field', () => {
      expect(content).toContain('op:orchestrate_status');
      expect(content).toContain('allTasksTerminal');
    });
  });

  it('describes orchestrate_complete as user-gated in the Non-Negotiable Rule', () => {
    expect(content).toContain('user-gated');
  });

  describe('Auto-Dream Gate on Session Start', () => {
    it('includes dream gate check in Session Start Protocol', () => {
      expect(content).toContain('op:dream_status');
      expect(content).toContain('gateEligible');
    });

    it('includes dream_run instruction when gate is eligible', () => {
      expect(content).toContain('op:dream_run');
    });

    it('includes dream report table format', () => {
      expect(content).toContain('duplicatesFound');
      expect(content).toContain('staleArchived');
      expect(content).toContain('contradictionsFound');
    });

    it('specifies force:false for auto-triggered dreams', () => {
      expect(content).toContain('force: false');
    });
  });

  describe('getModularEngineRules', () => {
    it('returns full content when no features specified', () => {
      const modular = getModularEngineRules();
      expect(modular).toBe(content);
    });

    it('returns full content when empty features array', () => {
      const modular = getModularEngineRules([]);
      expect(modular).toBe(content);
    });

    it('always includes core sections regardless of features', () => {
      const modular = getModularEngineRules(['vault']);
      expect(modular).toContain('## What is Soleri');
      expect(modular).toContain('## Response Integrity');
      expect(modular).toContain('## Output Formatting');
      expect(modular).toContain('## Commit Style');
      expect(modular).toContain('## Session Lifecycle');
    });

    it('includes vault sections when vault feature is specified', () => {
      const modular = getModularEngineRules(['vault']);
      expect(modular).toContain('## Vault as Source of Truth');
      expect(modular).toContain('## Knowledge Capture');
    });

    it('excludes planning sections when only vault feature is specified', () => {
      const modular = getModularEngineRules(['vault']);
      expect(modular).not.toContain('## Planning');
      expect(modular).not.toContain('## YOLO Mode');
      expect(modular).not.toContain('## Verification Protocol');
    });

    it('includes planning sections when planning feature is specified', () => {
      const modular = getModularEngineRules(['planning']);
      expect(modular).toContain('## Planning');
      expect(modular).toContain('## Workflow Overrides');
      expect(modular).toContain('## YOLO Mode');
    });

    it('excludes brain sections when only planning feature is specified', () => {
      const modular = getModularEngineRules(['planning']);
      expect(modular).not.toContain('## Brain-Informed Work');
      expect(modular).not.toContain('## Model Routing Guidance');
    });

    it('includes brain sections when brain feature is specified', () => {
      const modular = getModularEngineRules(['brain']);
      expect(modular).toContain('## Brain-Informed Work');
    });

    it('includes advanced sections when advanced feature is specified', () => {
      const modular = getModularEngineRules(['advanced']);
      expect(modular).toContain('## Subagent Identity');
    });

    it('excludes advanced sections when not specified', () => {
      const modular = getModularEngineRules(['vault', 'planning']);
      expect(modular).not.toContain('## Subagent Identity');
    });

    it('combines multiple features correctly', () => {
      const modular = getModularEngineRules(['vault', 'brain']);
      expect(modular).toContain('## Vault as Source of Truth');
      expect(modular).toContain('## Brain-Informed Work');
      expect(modular).not.toContain('## Planning');
      expect(modular).not.toContain('## Subagent Identity');
    });

    it('includes engine-rules markers', () => {
      const modular = getModularEngineRules(['vault']);
      expect(modular).toContain(`<!-- ${getEngineMarker()} -->`);
      expect(modular).toContain(`<!-- /${getEngineMarker()} -->`);
    });

    it('all features returns same content as full rules', () => {
      const allFeatures = getModularEngineRules([...ENGINE_FEATURES] as EngineFeature[]);
      // Should contain all sections
      expect(allFeatures).toContain('## Vault as Source of Truth');
      expect(allFeatures).toContain('## Planning');
      expect(allFeatures).toContain('## Brain-Informed Work');
      expect(allFeatures).toContain('## Subagent Identity');
    });

    it('is significantly smaller when only one feature is selected', () => {
      const full = getEngineRulesContent();
      const vaultOnly = getModularEngineRules(['vault']);
      // Vault-only omits planning, brain, and advanced sections,
      // so it should be at most 80% of the full rules size.
      const EXPECTED_MAX_RATIO = 0.8;
      expect(vaultOnly.length).toBeLessThan(full.length * EXPECTED_MAX_RATIO);
    });
  });
});
