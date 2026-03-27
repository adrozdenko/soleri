import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeRuntimeAdapter } from '../../adapters/claude-code-adapter.js';
import type { AdapterExecutionContext } from '../../adapters/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

function makeContext(overrides?: Partial<AdapterExecutionContext>): AdapterExecutionContext {
  return {
    runId: 'test-run-1',
    prompt: 'Hello world',
    workspace: '/tmp/test-workspace',
    ...overrides,
  };
}

describe('ClaudeCodeRuntimeAdapter', () => {
  let adapter: ClaudeCodeRuntimeAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeCodeRuntimeAdapter();
  });

  describe('type', () => {
    it('should have type property set to "claude-code"', () => {
      expect(adapter.type).toBe('claude-code');
    });
  });

  describe('execute()', () => {
    it('should call the dispatch function with correct args', async () => {
      const dispatch = vi.fn().mockResolvedValue({ exitCode: 0 });
      adapter = new ClaudeCodeRuntimeAdapter(dispatch);
      const ctx = makeContext();

      await adapter.execute(ctx);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith('Hello world', '/tmp/test-workspace', undefined);
    });

    it('should return a proper AdapterExecutionResult shape', async () => {
      const dispatch = vi.fn().mockResolvedValue({ exitCode: 0, output: 'Done' });
      adapter = new ClaudeCodeRuntimeAdapter(dispatch);

      const result = await adapter.execute(makeContext());

      expect(result).toHaveProperty('exitCode');
      expect(typeof result.exitCode).toBe('number');
      expect(result.exitCode).toBe(0);
    });

    it('should handle dispatch that returns an error exit code', async () => {
      const dispatch = vi.fn().mockResolvedValue({ exitCode: 1 });
      adapter = new ClaudeCodeRuntimeAdapter(dispatch);

      const result = await adapter.execute(makeContext());

      expect(result.exitCode).toBe(1);
    });

    it('should work without a dispatch function and return a default result', async () => {
      adapter = new ClaudeCodeRuntimeAdapter();

      const result = await adapter.execute(makeContext());

      expect(result).toHaveProperty('exitCode');
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('testEnvironment()', () => {
    it('should return available: true when CLI exists', async () => {
      const { execSync } = await import('node:child_process');
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockReturnValue('/usr/local/bin/claude' as any);

      const result = await adapter.testEnvironment();

      expect(result.available).toBe(true);
    });

    it('should return available: false when CLI is missing', async () => {
      const { execSync } = await import('node:child_process');
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockImplementation(() => {
        throw new Error('command not found: claude');
      });

      const result = await adapter.testEnvironment();

      expect(result.available).toBe(false);
    });

    it('should never throw even if the environment check fails', async () => {
      const { execSync } = await import('node:child_process');
      const mockedExecSync = vi.mocked(execSync);
      mockedExecSync.mockImplementation(() => {
        throw new Error('unexpected catastrophic error');
      });

      // Should not throw — returns a result with available: false
      const result = await adapter.testEnvironment();
      expect(result).toHaveProperty('available');
      expect(result.available).toBe(false);
    });
  });

  describe('sessionCodec', () => {
    it('should have a sessionCodec property', () => {
      expect(adapter.sessionCodec).toBeDefined();
    });

    it('should serialize session state to valid JSON', () => {
      const state = {
        adapterType: 'claude-code',
        data: { sessionId: 'sess-123', conversationId: 'conv-456' },
      };

      const serialized = adapter.sessionCodec!.serialize(state);

      expect(() => JSON.parse(serialized)).not.toThrow();
      const parsed = JSON.parse(serialized);
      expect(parsed.adapterType).toBe('claude-code');
    });

    it('should round-trip serialize and deserialize', () => {
      const state = {
        adapterType: 'claude-code',
        data: { sessionId: 'sess-123', conversationId: 'conv-456' },
      };

      const serialized = adapter.sessionCodec!.serialize(state);
      const deserialized = adapter.sessionCodec!.deserialize(serialized);

      expect(deserialized).toEqual(state);
    });

    it('should return a display ID from getDisplayId()', () => {
      const state = {
        adapterType: 'claude-code',
        data: { sessionId: 'sess-123' },
      };

      const displayId = adapter.sessionCodec!.getDisplayId(state);

      expect(typeof displayId).toBe('string');
      expect(displayId).toContain('sess-123');
    });

    it('should throw on invalid JSON in deserialize()', () => {
      expect(() => adapter.sessionCodec!.deserialize('not-valid-json{')).toThrow();
    });
  });

  describe('syncSkills()', () => {
    it('should be callable without throwing (smoke test)', async () => {
      if (adapter.syncSkills) {
        await expect(adapter.syncSkills([])).resolves.not.toThrow();
      }
      // If syncSkills is not defined, that's also acceptable per the interface
      expect(true).toBe(true);
    });
  });
});
