import { describe, it, expect } from 'vitest';
import { getEngineRulesContent, getEngineMarker } from '../templates/shared-rules.js';

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
});
