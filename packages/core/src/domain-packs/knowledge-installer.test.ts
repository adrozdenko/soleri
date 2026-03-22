/**
 * Colocated tests for domain-packs/knowledge-installer.ts
 *
 * Tests: three-tier installation, immutable canonical skip, empty knowledge,
 * missing directories.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installKnowledge } from './knowledge-installer.js';
import type { DomainPack } from './types.js';
import type { AgentRuntime } from '../runtime/types.js';

let tempDir: string;

function mockPack(overrides: Partial<DomainPack> = {}): DomainPack {
  return {
    name: 'test-pack',
    version: '1.0.0',
    domains: ['testing'],
    ops: [],
    ...overrides,
  };
}

function mockRuntime(): AgentRuntime {
  const entries = new Map<string, any>();
  return {
    vault: {
      get: vi.fn((id: string) => entries.get(id) ?? null),
      add: vi.fn((entry: any) => entries.set(entry.id, entry)),
      search: vi.fn(() => []),
    },
  } as any;
}

function writeMdFiles(dir: string, files: Record<string, string>) {
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('installKnowledge', () => {
  it('returns zeros when pack has no knowledge', async () => {
    const result = await installKnowledge(mockPack(), mockRuntime(), tempDir);
    expect(result).toEqual({ canonical: 0, curated: 0, captured: 0, skipped: 0 });
  });

  it('installs canonical entries', async () => {
    const canonicalDir = join(tempDir, 'canonical');
    writeMdFiles(canonicalDir, {
      'no-raw-colors.md': '# No Raw Colors\nAlways use tokens.',
      'token-priority.md': '# Token Priority\nSemantic first.',
    });
    const runtime = mockRuntime();
    const result = await installKnowledge(
      mockPack({ knowledge: { canonical: 'canonical' } }),
      runtime,
      tempDir,
    );
    expect(result.canonical).toBe(2);
    expect(runtime.vault.add).toHaveBeenCalledTimes(2);
  });

  it('installs curated entries', async () => {
    const curatedDir = join(tempDir, 'curated');
    writeMdFiles(curatedDir, { 'pattern-a.md': 'Pattern A content.' });
    const runtime = mockRuntime();
    const result = await installKnowledge(
      mockPack({ knowledge: { curated: 'curated' } }),
      runtime,
      tempDir,
    );
    expect(result.curated).toBe(1);
  });

  it('installs captured entries', async () => {
    const capturedDir = join(tempDir, 'captured');
    writeMdFiles(capturedDir, { 'lesson-1.md': 'A lesson.' });
    const runtime = mockRuntime();
    const result = await installKnowledge(
      mockPack({ knowledge: { captured: 'captured' } }),
      runtime,
      tempDir,
    );
    expect(result.captured).toBe(1);
  });

  it('skips canonical entries that already exist (immutable)', async () => {
    const canonicalDir = join(tempDir, 'canonical');
    writeMdFiles(canonicalDir, { 'existing.md': 'Content.' });
    const runtime = mockRuntime();
    // Pre-populate vault with existing entry
    (runtime.vault.get as any).mockImplementation((id: string) =>
      id === 'pack-test-pack-existing' ? { id } : null,
    );
    const result = await installKnowledge(
      mockPack({ knowledge: { canonical: 'canonical' } }),
      runtime,
      tempDir,
    );
    expect(result.canonical).toBe(0);
  });

  it('skips non-existing directories gracefully', async () => {
    const runtime = mockRuntime();
    const result = await installKnowledge(
      mockPack({ knowledge: { canonical: 'no-such-dir', curated: 'also-missing' } }),
      runtime,
      tempDir,
    );
    expect(result.canonical).toBe(0);
    expect(result.curated).toBe(0);
  });

  it('tags entries with pack source and tier', async () => {
    const canonicalDir = join(tempDir, 'canonical');
    writeMdFiles(canonicalDir, { 'tagged.md': 'Tagged entry.' });
    const runtime = mockRuntime();
    await installKnowledge(
      mockPack({ knowledge: { canonical: 'canonical' } }),
      runtime,
      tempDir,
    );
    const addCall = (runtime.vault.add as any).mock.calls[0][0];
    expect(addCall.tags).toContain('pack:test-pack');
    expect(addCall.tags).toContain('tier:canonical');
    expect(addCall.origin).toBe('pack');
    expect(addCall.domain).toBe('test-pack');
  });

  it('generates correct entry id from pack name and filename', async () => {
    const curatedDir = join(tempDir, 'curated');
    writeMdFiles(curatedDir, { 'my-pattern.md': 'Content.' });
    const runtime = mockRuntime();
    await installKnowledge(
      mockPack({ knowledge: { curated: 'curated' } }),
      runtime,
      tempDir,
    );
    const addCall = (runtime.vault.add as any).mock.calls[0][0];
    expect(addCall.id).toBe('pack-test-pack-my-pattern');
  });

  it('installs all three tiers in a single call', async () => {
    writeMdFiles(join(tempDir, 'c'), { 'a.md': 'A' });
    writeMdFiles(join(tempDir, 'u'), { 'b.md': 'B' });
    writeMdFiles(join(tempDir, 'p'), { 'c.md': 'C' });
    const runtime = mockRuntime();
    const result = await installKnowledge(
      mockPack({ knowledge: { canonical: 'c', curated: 'u', captured: 'p' } }),
      runtime,
      tempDir,
    );
    expect(result.canonical).toBe(1);
    expect(result.curated).toBe(1);
    expect(result.captured).toBe(1);
    expect(runtime.vault.add).toHaveBeenCalledTimes(3);
  });
});
