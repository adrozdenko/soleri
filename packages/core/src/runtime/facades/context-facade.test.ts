import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createContextFacadeOps } from './context-facade.js';
import { captureOps, executeOp } from '../../engine/test-helpers.js';
import type { CapturedOp } from '../../engine/test-helpers.js';
import type { AgentRuntime } from '../types.js';

// ─── Mock ContextEngine ─────────────────────────────────────────────

function makeMockContextEngine() {
  return {
    extractEntities: vi.fn().mockReturnValue({
      files: ['src/app.ts'],
      functions: ['main'],
      domains: ['general'],
      actions: ['build'],
      technologies: ['typescript'],
      patterns: [],
    }),
    retrieveKnowledge: vi.fn().mockReturnValue({
      items: [{ title: 'pattern-1', score: 0.9, source: 'vault' }],
      total: 1,
    }),
    analyze: vi.fn().mockReturnValue({
      entities: { files: ['src/app.ts'], functions: [], domains: ['general'], actions: ['build'], technologies: [], patterns: [] },
      knowledge: { items: [], total: 0 },
      confidence: 0.7,
      detectedDomains: ['general'],
    }),
  };
}

function makeRuntime(contextEngine = makeMockContextEngine()): AgentRuntime {
  return { contextEngine } as unknown as AgentRuntime;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('context-facade', () => {
  let ops: Map<string, CapturedOp>;
  let mockEngine: ReturnType<typeof makeMockContextEngine>;

  beforeEach(() => {
    mockEngine = makeMockContextEngine();
    ops = captureOps(createContextFacadeOps(makeRuntime(mockEngine)));
  });

  it('registers all 3 ops', () => {
    expect(ops.size).toBe(3);
    expect([...ops.keys()]).toEqual(
      expect.arrayContaining(['context_extract_entities', 'context_retrieve_knowledge', 'context_analyze']),
    );
  });

  it('has correct auth levels', () => {
    expect(ops.get('context_extract_entities')!.auth).toBe('read');
    expect(ops.get('context_retrieve_knowledge')!.auth).toBe('read');
    expect(ops.get('context_analyze')!.auth).toBe('read');
  });

  // ─── context_extract_entities ──────────────────────────────────

  it('context_extract_entities calls engine with prompt', async () => {
    const result = await executeOp(ops, 'context_extract_entities', { prompt: 'build a button' });
    expect(result.success).toBe(true);
    expect(mockEngine.extractEntities).toHaveBeenCalledWith('build a button');
    expect((result.data as Record<string, unknown>).files).toEqual(['src/app.ts']);
  });

  it('context_extract_entities fails without prompt', async () => {
    const result = await executeOp(ops, 'context_extract_entities', {});
    expect(result.success).toBe(false);
  });

  // ─── context_retrieve_knowledge ────────────────────────────────

  it('context_retrieve_knowledge calls engine with prompt', async () => {
    const result = await executeOp(ops, 'context_retrieve_knowledge', { prompt: 'contrast patterns' });
    expect(result.success).toBe(true);
    expect(mockEngine.retrieveKnowledge).toHaveBeenCalledWith('contrast patterns', undefined);
  });

  it('context_retrieve_knowledge passes domain filter', async () => {
    await executeOp(ops, 'context_retrieve_knowledge', { prompt: 'test', domain: 'design' });
    expect(mockEngine.retrieveKnowledge).toHaveBeenCalledWith('test', 'design');
  });

  // ─── context_analyze ───────────────────────────────────────────

  it('context_analyze returns combined analysis', async () => {
    const result = await executeOp(ops, 'context_analyze', { prompt: 'build auth' });
    expect(result.success).toBe(true);
    expect(mockEngine.analyze).toHaveBeenCalledWith('build auth', undefined);
    const data = result.data as Record<string, unknown>;
    expect(data.confidence).toBe(0.7);
  });

  it('context_analyze passes domain hint', async () => {
    await executeOp(ops, 'context_analyze', { prompt: 'test', domain: 'security' });
    expect(mockEngine.analyze).toHaveBeenCalledWith('test', 'security');
  });

  it('context_analyze propagates engine errors', async () => {
    mockEngine.analyze.mockImplementation(() => { throw new Error('Engine failure'); });
    const result = await executeOp(ops, 'context_analyze', { prompt: 'fail' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Engine failure');
  });
});
