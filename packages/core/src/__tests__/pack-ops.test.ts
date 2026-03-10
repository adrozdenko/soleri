import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createPackOps } from '../runtime/pack-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('pack ops', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let testDir: string;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    runtime = createAgentRuntime({
      agentId: 'test-pack-ops',
      vaultPath: ':memory:',
    });
    ops = createPackOps(runtime);
    testDir = join(tmpdir(), `soleri-pack-ops-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    runtime?.close();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it('should return 4 pack ops', () => {
    expect(ops).toHaveLength(4);
    const names = ops.map((o) => o.name);
    expect(names).toContain('pack_validate');
    expect(names).toContain('pack_install');
    expect(names).toContain('pack_list');
    expect(names).toContain('pack_uninstall');
  });

  it('should validate a pack', async () => {
    const packDir = join(testDir, 'validate-me');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'soleri-pack.json'),
      JSON.stringify({
        id: 'validate-me',
        name: 'Validate Me',
        version: '1.0.0',
        domains: ['testing'],
      }),
    );

    const result = (await findOp('pack_validate').handler({
      packDir,
    })) as { valid: boolean; manifest: { id: string } };

    expect(result.valid).toBe(true);
    expect(result.manifest.id).toBe('validate-me');
  });

  it('should install a pack', async () => {
    const packDir = join(testDir, 'install-me');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'soleri-pack.json'),
      JSON.stringify({
        id: 'install-me',
        name: 'Install Me',
        version: '1.0.0',
      }),
    );

    const result = (await findOp('pack_install').handler({
      packDir,
    })) as { id: string; installed: boolean };

    expect(result.installed).toBe(true);
    expect(result.id).toBe('install-me');
  });

  it('should list installed packs', async () => {
    const packDir = join(testDir, 'listed');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'soleri-pack.json'),
      JSON.stringify({ id: 'listed', name: 'Listed', version: '1.0.0' }),
    );

    await findOp('pack_install').handler({ packDir });

    const result = (await findOp('pack_list').handler({})) as {
      packs: Array<{ id: string }>;
      count: number;
    };

    expect(result.count).toBe(1);
    expect(result.packs[0].id).toBe('listed');
  });

  it('should uninstall a pack', async () => {
    const packDir = join(testDir, 'uninstall-me');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'soleri-pack.json'),
      JSON.stringify({ id: 'uninstall-me', name: 'Uninstall', version: '1.0.0' }),
    );

    await findOp('pack_install').handler({ packDir });
    const result = (await findOp('pack_uninstall').handler({
      packId: 'uninstall-me',
    })) as { uninstalled: boolean };

    expect(result.uninstalled).toBe(true);

    const list = (await findOp('pack_list').handler({})) as { count: number };
    expect(list.count).toBe(0);
  });

  it('should return error for unknown pack uninstall', async () => {
    const result = (await findOp('pack_uninstall').handler({
      packId: 'nonexistent',
    })) as { error: string };
    expect(result.error).toContain('not found');
  });

  describe('auth levels', () => {
    it('should use read auth for validate and list', () => {
      expect(findOp('pack_validate').auth).toBe('read');
      expect(findOp('pack_list').auth).toBe('read');
    });

    it('should use admin auth for install and uninstall', () => {
      expect(findOp('pack_install').auth).toBe('admin');
      expect(findOp('pack_uninstall').auth).toBe('admin');
    });
  });
});
