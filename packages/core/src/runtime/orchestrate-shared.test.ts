/**
 * Tests for orchestrate-shared.ts — buildHealthWarning gating.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildHealthWarning } from './orchestrate-shared.js';
import type { ContextHealthStatus } from './context-health.js';
import type { AgentRuntime } from './types.js';

function makeStatus(level: ContextHealthStatus['level']): ContextHealthStatus {
  return {
    level,
    estimatedFill: level === 'red' ? 0.95 : level === 'yellow' ? 0.5 : 0.1,
    estimatedTokens: 50_000,
    toolCallCount: 100,
    recommendation: `level=${level}`,
  };
}

function makeVault(): { vault: AgentRuntime['vault']; captureMemory: ReturnType<typeof vi.fn> } {
  const captureMemory = vi.fn();
  const vault = { captureMemory } as unknown as AgentRuntime['vault'];
  return { vault, captureMemory };
}

describe('buildHealthWarning', () => {
  it('returns null when status is green regardless of autoCapture', () => {
    const { vault, captureMemory } = makeVault();
    expect(buildHealthWarning(makeStatus('green'), vault, true)).toBeNull();
    expect(captureMemory).not.toHaveBeenCalled();
  });

  it('returns yellow warning without writing a session memory', () => {
    const { vault, captureMemory } = makeVault();
    const warning = buildHealthWarning(makeStatus('yellow'), vault, true);
    expect(warning?.level).toBe('yellow');
    expect(warning?.sessionCaptured).toBeUndefined();
    expect(captureMemory).not.toHaveBeenCalled();
  });

  it('does NOT write a session memory on red when autoCapture is false', () => {
    const { vault, captureMemory } = makeVault();
    const warning = buildHealthWarning(makeStatus('red'), vault, false);
    expect(warning?.level).toBe('red');
    expect(warning?.sessionCaptured).toBe(false);
    expect(captureMemory).not.toHaveBeenCalled();
  });

  it('writes a session memory on red when autoCapture is true', () => {
    const { vault, captureMemory } = makeVault();
    const warning = buildHealthWarning(makeStatus('red'), vault, true);
    expect(warning?.level).toBe('red');
    expect(warning?.sessionCaptured).toBe(true);
    expect(captureMemory).toHaveBeenCalledTimes(1);
    const call = captureMemory.mock.calls[0]?.[0] as { type: string };
    expect(call.type).toBe('session');
  });

  it('reports sessionCaptured=false when captureMemory throws', () => {
    const { vault, captureMemory } = makeVault();
    captureMemory.mockImplementation(() => {
      throw new Error('vault unavailable');
    });
    const warning = buildHealthWarning(makeStatus('red'), vault, true);
    expect(warning?.sessionCaptured).toBe(false);
  });
});
