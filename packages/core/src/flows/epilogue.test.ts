/**
 * Epilogue — colocated contract tests.
 *
 * Contract:
 * - runEpilogue() calls capture_knowledge when vault is available
 * - runEpilogue() calls session_capture when sessionStore is available
 * - Returns { captured: true, sessionId } on success
 * - Silently ignores errors from dispatch (best-effort)
 * - Returns { captured: false } when no probes are available
 */

import { describe, it, expect, vi } from 'vitest';
import { runEpilogue } from './epilogue.js';
import type { ProbeResults } from './types.js';

function probes(overrides?: Partial<ProbeResults>): ProbeResults {
  return {
    vault: false,
    brain: false,
    designSystem: false,
    sessionStore: false,
    projectRules: false,
    active: true,
    ...overrides,
  };
}

describe('runEpilogue', () => {
  it('captures knowledge when vault is available', async () => {
    const dispatch = vi.fn(async () => ({ tool: 'capture_knowledge', status: 'ok', data: {} }));
    const result = await runEpilogue(dispatch, probes({ vault: true }), '/project', 'summary');

    expect(dispatch).toHaveBeenCalledWith('capture_knowledge', expect.objectContaining({
      title: 'Flow execution summary',
      content: 'summary',
      type: 'workflow',
      projectPath: '/project',
    }));
    expect(result.captured).toBe(true);
  });

  it('captures session when sessionStore is available', async () => {
    const dispatch = vi.fn(async () => ({
      tool: 'session_capture',
      status: 'ok',
      data: { sessionId: 'sess-123' },
    }));
    const result = await runEpilogue(
      dispatch,
      probes({ sessionStore: true }),
      '/project',
      'summary',
    );

    expect(dispatch).toHaveBeenCalledWith('session_capture', expect.objectContaining({
      summary: 'summary',
      projectPath: '/project',
    }));
    expect(result.captured).toBe(true);
    expect(result.sessionId).toBe('sess-123');
  });

  it('calls both when vault and sessionStore are available', async () => {
    const dispatch = vi.fn(async (tool: string) => ({
      tool,
      status: 'ok',
      data: tool === 'session_capture' ? { sessionId: 's-1' } : {},
    }));
    const result = await runEpilogue(
      dispatch,
      probes({ vault: true, sessionStore: true }),
      '/p',
      'done',
    );

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(result.captured).toBe(true);
    expect(result.sessionId).toBe('s-1');
  });

  it('returns captured=false when no probes are active', async () => {
    const dispatch = vi.fn();
    const result = await runEpilogue(dispatch, probes(), '/project', 'summary');

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.captured).toBe(false);
    expect(result.sessionId).toBeUndefined();
  });

  it('silently ignores dispatch errors for vault capture', async () => {
    const dispatch = vi.fn(async () => {
      throw new Error('vault down');
    });
    const result = await runEpilogue(dispatch, probes({ vault: true }), '/p', 'test');

    expect(result.captured).toBe(false);
  });

  it('silently ignores dispatch errors for session capture', async () => {
    const dispatch = vi.fn(async () => {
      throw new Error('session store down');
    });
    const result = await runEpilogue(dispatch, probes({ sessionStore: true }), '/p', 'test');

    expect(result.captured).toBe(false);
  });
});
