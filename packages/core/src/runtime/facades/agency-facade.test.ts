import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgencyFacadeOps } from './agency-facade.js';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

function mockRuntime(): AgentRuntime {
  return {
    agencyManager: {
      enable: vi.fn(),
      disable: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ enabled: false, watching: false }),
      updateConfig: vi.fn(),
      scanFile: vi.fn().mockReturnValue([]),
      getPendingWarnings: vi.fn().mockReturnValue([]),
      surfacePatterns: vi.fn().mockReturnValue([]),
      generateClarification: vi.fn(),
      generateSuggestions: vi.fn().mockReturnValue([]),
      generateRichClarification: vi.fn(),
      suppressWarning: vi.fn(),
      unsuppressWarning: vi.fn(),
      dismissPattern: vi.fn(),
      drainNotifications: vi.fn().mockReturnValue([]),
      getFullStatus: vi.fn().mockReturnValue({ enabled: false }),
    },
  } as unknown as AgentRuntime;
}

function findOp(ops: OpDefinition[], name: string): OpDefinition {
  const op = ops.find((o) => o.name === name);
  if (!op) throw new Error(`Op "${name}" not found`);
  return op;
}

describe('createAgencyFacadeOps', () => {
  let runtime: ReturnType<typeof mockRuntime>;
  let ops: OpDefinition[];

  beforeEach(() => {
    runtime = mockRuntime();
    ops = createAgencyFacadeOps(runtime);
  });

  describe('agency_enable', () => {
    it('enables with default project path', async () => {
      const status = { enabled: true, watching: true };
      vi.mocked(runtime.agencyManager.getStatus).mockReturnValue(status as never);

      const result = await findOp(ops, 'agency_enable').handler({});
      expect(runtime.agencyManager.enable).toHaveBeenCalledWith('.');
      expect(result).toEqual(status);
    });

    it('enables with custom project path', async () => {
      const status = { enabled: true, watching: true };
      vi.mocked(runtime.agencyManager.getStatus).mockReturnValue(status as never);

      await findOp(ops, 'agency_enable').handler({ projectPath: '/my/project' });
      expect(runtime.agencyManager.enable).toHaveBeenCalledWith('/my/project');
    });
  });

  describe('agency_disable', () => {
    it('disables and returns status', async () => {
      const status = { enabled: false, watching: false };
      vi.mocked(runtime.agencyManager.getStatus).mockReturnValue(status as never);

      const result = await findOp(ops, 'agency_disable').handler({});
      expect(runtime.agencyManager.disable).toHaveBeenCalled();
      expect(result).toEqual(status);
    });
  });

  describe('agency_status', () => {
    it('returns current status', async () => {
      const status = { enabled: true, watching: true, detectors: 3 };
      vi.mocked(runtime.agencyManager.getStatus).mockReturnValue(status as never);

      const result = await findOp(ops, 'agency_status').handler({});
      expect(result).toEqual(status);
    });
  });

  describe('agency_config', () => {
    it('updates config and returns status', async () => {
      const config = { watchPaths: ['/src'], debounceMs: 500 };
      const status = { enabled: true };
      vi.mocked(runtime.agencyManager.getStatus).mockReturnValue(status as never);

      const result = await findOp(ops, 'agency_config').handler(config);
      expect(runtime.agencyManager.updateConfig).toHaveBeenCalledWith(config);
      expect(result).toEqual(status);
    });
  });

  describe('agency_scan_file', () => {
    it('returns warnings and count', async () => {
      const warnings = [{ id: 'w1', message: 'issue' }];
      vi.mocked(runtime.agencyManager.scanFile).mockReturnValue(warnings as never);

      const result = (await findOp(ops, 'agency_scan_file').handler({
        filePath: '/src/foo.ts',
      })) as { warnings: unknown[]; count: number };
      expect(result.warnings).toEqual(warnings);
      expect(result.count).toBe(1);
    });

    it('returns empty when no warnings', async () => {
      vi.mocked(runtime.agencyManager.scanFile).mockReturnValue([] as never);

      const result = (await findOp(ops, 'agency_scan_file').handler({
        filePath: '/src/clean.ts',
      })) as { warnings: unknown[]; count: number };
      expect(result.count).toBe(0);
    });
  });

  describe('agency_warnings', () => {
    it('returns pending warnings', async () => {
      const warnings = [{ id: 'w1' }, { id: 'w2' }];
      vi.mocked(runtime.agencyManager.getPendingWarnings).mockReturnValue(warnings as never);

      const result = (await findOp(ops, 'agency_warnings').handler({})) as {
        warnings: unknown[];
        count: number;
      };
      expect(result.count).toBe(2);
    });
  });

  describe('agency_surface_patterns', () => {
    it('returns patterns for a file', async () => {
      const patterns = [{ id: 'p1', title: 'Pattern A' }];
      vi.mocked(runtime.agencyManager.surfacePatterns).mockReturnValue(patterns as never);

      const result = (await findOp(ops, 'agency_surface_patterns').handler({
        filePath: '/src/comp.tsx',
      })) as { patterns: unknown[]; count: number };
      expect(result.patterns).toEqual(patterns);
      expect(result.count).toBe(1);
    });
  });

  describe('agency_clarify', () => {
    it('returns clarification question when needed', async () => {
      const question = { question: 'Did you mean...?', options: ['A', 'B'] };
      vi.mocked(runtime.agencyManager.generateClarification).mockReturnValue(question as never);

      const result = await findOp(ops, 'agency_clarify').handler({
        prompt: 'fix the thing',
        confidence: 0.3,
      });
      expect(result).toEqual(question);
    });

    it('returns clarificationNeeded:false when not needed', async () => {
      vi.mocked(runtime.agencyManager.generateClarification).mockReturnValue(null as never);

      const result = await findOp(ops, 'agency_clarify').handler({
        prompt: 'build a button',
        confidence: 0.9,
      });
      expect(result).toEqual({ clarificationNeeded: false });
    });
  });

  describe('agency_suggestions', () => {
    it('returns triggered suggestions', async () => {
      const suggestions = [{ rule: 'lint', priority: 1 }];
      vi.mocked(runtime.agencyManager.generateSuggestions).mockReturnValue(suggestions as never);

      const result = await findOp(ops, 'agency_suggestions').handler({});
      expect(result).toEqual(suggestions);
    });
  });

  describe('agency_rich_clarify', () => {
    it('returns structured clarification', async () => {
      const rich = { questions: [{ text: 'What scope?', urgency: 'high' }] };
      vi.mocked(runtime.agencyManager.generateRichClarification).mockReturnValue(rich as never);

      const result = await findOp(ops, 'agency_rich_clarify').handler({
        prompt: 'refactor something',
      });
      expect(result).toEqual(rich);
    });
  });

  describe('agency_suppress_warning', () => {
    it('suppresses and returns confirmation', async () => {
      const result = (await findOp(ops, 'agency_suppress_warning').handler({
        warningId: 'w1',
      })) as Record<string, unknown>;
      expect(result.suppressed).toBe(true);
      expect(result.warningId).toBe('w1');
      expect(runtime.agencyManager.suppressWarning).toHaveBeenCalledWith('w1');
    });
  });

  describe('agency_unsuppress_warning', () => {
    it('unsuppresses and returns confirmation', async () => {
      const result = (await findOp(ops, 'agency_unsuppress_warning').handler({
        warningId: 'w1',
      })) as Record<string, unknown>;
      expect(result.unsuppressed).toBe(true);
      expect(result.warningId).toBe('w1');
    });
  });

  describe('agency_dismiss_pattern', () => {
    it('dismisses and returns ttl info', async () => {
      const result = (await findOp(ops, 'agency_dismiss_pattern').handler({
        entryId: 'e1',
      })) as Record<string, unknown>;
      expect(result.dismissed).toBe(true);
      expect(result.entryId).toBe('e1');
      expect(result.ttlHours).toBe(24);
    });
  });

  describe('agency_notifications', () => {
    it('drains notification queue', async () => {
      const notifications = [{ type: 'warning', message: 'stale entry' }];
      vi.mocked(runtime.agencyManager.drainNotifications).mockReturnValue(notifications as never);

      const result = await findOp(ops, 'agency_notifications').handler({});
      expect(result).toEqual(notifications);
    });
  });

  describe('agency_full_status', () => {
    it('returns full status', async () => {
      const fullStatus = { enabled: true, suppressions: [], dismissals: [] };
      vi.mocked(runtime.agencyManager.getFullStatus).mockReturnValue(fullStatus as never);

      const result = await findOp(ops, 'agency_full_status').handler({});
      expect(result).toEqual(fullStatus);
    });
  });
});
