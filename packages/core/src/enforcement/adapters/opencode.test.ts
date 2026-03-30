import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeAdapter } from './opencode.js';
import type { EnforcementAction, EnforcementRule } from '../types.js';

// Mock node:fs so detectHost() doesn't hit real filesystem
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

import { existsSync } from 'node:fs';
import { detectHost, createHostAdapter } from './index.js';

const mockedExistsSync = vi.mocked(existsSync);

// ─── Helpers ──────────────────────────────────────────────────────

function makeRule(overrides: Partial<EnforcementRule> = {}): EnforcementRule {
  return {
    id: 'test-rule',
    description: 'Test rule',
    trigger: 'pre-tool-use',
    action: 'block',
    message: 'Blocked',
    ...overrides,
  };
}

// ─── OpenCodeAdapter ──────────────────────────────────────────────

describe('OpenCodeAdapter', () => {
  const adapter = new OpenCodeAdapter();

  // ─── supports() ─────────────────────────────────────────────────

  describe('supports', () => {
    it('returns true for pre-tool-use', () => {
      expect(adapter.supports('pre-tool-use')).toBe(true);
    });

    it('returns true for post-tool-use', () => {
      expect(adapter.supports('post-tool-use')).toBe(true);
    });

    it('returns true for pre-compact', () => {
      expect(adapter.supports('pre-compact')).toBe(true);
    });

    it('returns true for session-start', () => {
      expect(adapter.supports('session-start')).toBe(true);
    });

    it('returns false for pre-commit', () => {
      expect(adapter.supports('pre-commit')).toBe(false);
    });

    it('returns false for on-save', () => {
      expect(adapter.supports('on-save')).toBe(false);
    });
  });

  // ─── translate() — empty config ─────────────────────────────────

  describe('translate with empty config', () => {
    it('returns empty files array when no rules provided', () => {
      const result = adapter.translate({ rules: [] });
      expect(result.host).toBe('opencode');
      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });

  // ─── translate() — config generation format ─────────────────────

  describe('translate config generation', () => {
    it('generates plugin file at .opencode/plugins/soleri-enforcement.ts', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'r1', trigger: 'pre-tool-use', pattern: 'test' })],
      });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('.opencode/plugins/soleri-enforcement.ts');
    });

    it('includes auto-generated header comment', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'r1', trigger: 'pre-tool-use', pattern: 'test' })],
      });

      expect(result.files[0].content).toContain('Auto-generated');
      expect(result.files[0].content).toContain('do not edit manually');
    });

    it('exports a default object with hooks', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'r1', trigger: 'pre-tool-use', pattern: 'test' })],
      });

      const content = result.files[0].content;
      expect(content).toContain('export default {');
      expect(content).toContain('hooks: {');
    });

    it('maps pre-tool-use to tool.execute.before event', () => {
      const result = adapter.translate({
        rules: [makeRule({ trigger: 'pre-tool-use', pattern: 'test' })],
      });

      expect(result.files[0].content).toContain("'tool.execute.before'");
    });

    it('maps post-tool-use to tool.execute.after event', () => {
      const result = adapter.translate({
        rules: [makeRule({ trigger: 'post-tool-use', pattern: 'test' })],
      });

      expect(result.files[0].content).toContain("'tool.execute.after'");
    });

    it('maps pre-compact to session.compacted event', () => {
      const result = adapter.translate({
        rules: [makeRule({ trigger: 'pre-compact', pattern: 'test' })],
      });

      expect(result.files[0].content).toContain("'session.compacted'");
    });

    it('maps session-start to session.created event', () => {
      const result = adapter.translate({
        rules: [makeRule({ trigger: 'session-start', pattern: 'test' })],
      });

      expect(result.files[0].content).toContain("'session.created'");
    });

    it('groups handlers by event when multiple rules share a trigger', () => {
      const result = adapter.translate({
        rules: [
          makeRule({
            id: 'r1',
            trigger: 'pre-tool-use',
            pattern: 'foo',
            action: 'block',
            message: 'No foo',
          }),
          makeRule({
            id: 'r2',
            trigger: 'pre-tool-use',
            pattern: 'bar',
            action: 'warn',
            message: 'No bar',
          }),
        ],
      });

      const content = result.files[0].content;
      // Should have only one 'tool.execute.before' event entry with both checks
      const eventMatches = content.match(/tool\.execute\.before/g);
      expect(eventMatches).toHaveLength(1);
      expect(content).toContain('r1');
      expect(content).toContain('r2');
    });
  });

  // ─── translate() — block/warn/suggest actions ───────────────────

  describe('action code generation', () => {
    it('block action generates throw new Error', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 'no-exec', action: 'block', message: 'Do not execute', pattern: 'exec' }),
        ],
      });

      const content = result.files[0].content;
      expect(content).toContain('throw new Error');
      expect(content).toContain('[no-exec] BLOCKED: Do not execute');
    });

    it('warn action generates console.warn', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 'risky', action: 'warn', message: 'Risky operation', pattern: 'risk' }),
        ],
      });

      const content = result.files[0].content;
      expect(content).toContain('console.warn');
      expect(content).toContain('[risky] WARNING: Risky operation');
    });

    it('suggest action generates console.info', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 'tip', action: 'suggest', message: 'Consider this', pattern: 'maybe' }),
        ],
      });

      const content = result.files[0].content;
      expect(content).toContain('console.info');
      expect(content).toContain('[tip] SUGGESTION: Consider this');
    });

    it('unknown action falls back to console.warn', () => {
      const result = adapter.translate({
        rules: [
          makeRule({
            id: 'unk',
            action: 'unknown' as unknown as EnforcementAction,
            message: 'Fallback msg',
            pattern: 'x',
          }),
        ],
      });

      const content = result.files[0].content;
      expect(content).toContain('console.warn');
      expect(content).toContain('[unk] Fallback msg');
    });

    it('rules without pattern generate action code without regex test', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'always', action: 'block', message: 'Always block' })],
      });

      const content = result.files[0].content;
      expect(content).toContain('throw new Error');
      expect(content).not.toContain('.test(');
    });

    it('rules with pattern generate regex test against ctx.input', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'pat', action: 'warn', message: 'Match found', pattern: 'danger' })],
      });

      const content = result.files[0].content;
      expect(content).toContain('/danger/.test(JSON.stringify(ctx.input');
    });
  });

  // ─── translate() — skipped triggers ─────────────────────────────

  describe('skipped triggers', () => {
    it('skips pre-commit with reason', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'commit-check', trigger: 'pre-commit' })],
      });

      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].ruleId).toBe('commit-check');
      expect(result.skipped[0].reason).toContain('not supported by OpenCode');
    });

    it('skips on-save with reason', () => {
      const result = adapter.translate({
        rules: [makeRule({ id: 'save-check', trigger: 'on-save' })],
      });

      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].ruleId).toBe('save-check');
      expect(result.skipped[0].reason).toContain('not supported by OpenCode');
    });

    it('handles mix of supported and unsupported triggers', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 'ok', trigger: 'pre-tool-use', pattern: 'test' }),
          makeRule({ id: 'skip1', trigger: 'pre-commit' }),
          makeRule({ id: 'skip2', trigger: 'on-save' }),
        ],
      });

      expect(result.files).toHaveLength(1);
      expect(result.skipped).toHaveLength(2);
      expect(result.skipped.map((s) => s.ruleId)).toEqual(['skip1', 'skip2']);
    });

    it('returns only skipped items when all rules are unsupported', () => {
      const result = adapter.translate({
        rules: [
          makeRule({ id: 's1', trigger: 'pre-commit' }),
          makeRule({ id: 's2', trigger: 'on-save' }),
        ],
      });

      expect(result.files).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
    });
  });

  // ─── host property ──────────────────────────────────────────────

  describe('host', () => {
    it('identifies as opencode', () => {
      expect(adapter.host).toBe('opencode');
    });
  });
});

// ─── detectHost() ─────────────────────────────────────────────────

describe('detectHost', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.OPENCODE;
    delete process.env.OPENCODE_SESSION;
    delete process.env.CLAUDE_CODE;
    mockedExistsSync.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns opencode when OPENCODE env var is set and no Claude indicators', () => {
    process.env.OPENCODE = '1';
    mockedExistsSync.mockReturnValue(false);

    expect(detectHost()).toBe('opencode');
  });

  it('returns opencode when OPENCODE_SESSION env var is set and no Claude indicators', () => {
    process.env.OPENCODE_SESSION = 'abc123';
    mockedExistsSync.mockReturnValue(false);

    expect(detectHost()).toBe('opencode');
  });

  it('returns claude-code when CLAUDE_CODE env var is set and no OpenCode indicators', () => {
    process.env.CLAUDE_CODE = '1';
    mockedExistsSync.mockReturnValue(false);

    expect(detectHost()).toBe('claude-code');
  });

  it('returns claude-code when both OpenCode and Claude indicators present', () => {
    process.env.OPENCODE = '1';
    process.env.CLAUDE_CODE = '1';
    mockedExistsSync.mockReturnValue(false);

    expect(detectHost()).toBe('claude-code');
  });

  it('returns claude-code when neither host is detected (default)', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(detectHost()).toBe('claude-code');
  });

  it('detects opencode via filesystem config when env vars absent', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      // Normalize to forward slashes so the check works on Windows too
      const path = String(p).replace(/\\/g, '/');
      if (path.includes('opencode/opencode.json')) return true;
      if (path.includes('.claude')) return false;
      return false;
    });

    expect(detectHost()).toBe('opencode');
  });

  it('detects claude-code via filesystem when .claude dir exists', () => {
    mockedExistsSync.mockImplementation((p: unknown) => {
      // Normalize to forward slashes so the check works on Windows too
      const path = String(p).replace(/\\/g, '/');
      if (path.includes('.claude')) return true;
      return false;
    });

    expect(detectHost()).toBe('claude-code');
  });
});

// ─── createHostAdapter() ──────────────────────────────────────────

describe('createHostAdapter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.OPENCODE;
    delete process.env.OPENCODE_SESSION;
    delete process.env.CLAUDE_CODE;
    mockedExistsSync.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns OpenCodeAdapter when opencode is detected', () => {
    process.env.OPENCODE = '1';

    const adapter = createHostAdapter();
    expect(adapter.host).toBe('opencode');
    expect(adapter).toBeInstanceOf(OpenCodeAdapter);
  });

  it('returns ClaudeCodeAdapter by default', () => {
    const adapter = createHostAdapter();
    expect(adapter.host).toBe('claude-code');
  });
});
