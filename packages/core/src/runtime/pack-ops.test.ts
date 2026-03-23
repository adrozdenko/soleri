import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPackOps, setHotRegister } from './pack-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

function makeMockRuntime() {
  return {
    config: { agentId: 'test-agent' },
    packInstaller: {
      validate: vi.fn().mockReturnValue({ valid: true, manifest: { name: 'test-pack' } }),
      install: vi.fn().mockResolvedValue({ installed: true, id: 'pack-1', facades: 1 }),
      list: vi.fn().mockReturnValue([
        {
          id: 'pack-1',
          manifest: { name: 'test-pack', version: '1.0.0', domains: ['design'] },
          status: 'active',
          vaultEntries: 5,
          skills: 2,
          hooks: 1,
          facadesRegistered: 1,
        },
      ]),
      uninstall: vi.fn().mockReturnValue(true),
    },
    pluginRegistry: {
      get: vi.fn().mockReturnValue({
        facades: [{ name: 'design', description: 'Design facade', ops: [] }],
      }),
    },
  } as unknown as AgentRuntime;
}

describe('createPackOps', () => {
  let ops: OpDefinition[];
  let runtime: ReturnType<typeof makeMockRuntime>;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    setHotRegister(null as never);
  });

  it('returns 4 ops', () => {
    runtime = makeMockRuntime();
    ops = createPackOps(runtime);
    expect(ops).toHaveLength(4);
  });

  it('has correct op names', () => {
    runtime = makeMockRuntime();
    ops = createPackOps(runtime);
    expect(ops.map((o) => o.name)).toEqual([
      'pack_validate',
      'pack_install',
      'pack_list',
      'pack_uninstall',
    ]);
  });

  it('assigns correct auth levels', () => {
    runtime = makeMockRuntime();
    ops = createPackOps(runtime);
    expect(findOp('pack_validate').auth).toBe('read');
    expect(findOp('pack_install').auth).toBe('admin');
    expect(findOp('pack_list').auth).toBe('read');
    expect(findOp('pack_uninstall').auth).toBe('admin');
  });

  describe('pack_validate', () => {
    it('delegates to packInstaller.validate', async () => {
      runtime = makeMockRuntime();
      ops = createPackOps(runtime);
      const result = await findOp('pack_validate').handler({ packDir: '/packs/test' });
      expect(runtime.packInstaller.validate).toHaveBeenCalledWith('/packs/test');
      expect(result).toEqual({ valid: true, manifest: { name: 'test-pack' } });
    });
  });

  describe('pack_install', () => {
    it('delegates to packInstaller.install', async () => {
      runtime = makeMockRuntime();
      ops = createPackOps(runtime);
      const result = await findOp('pack_install').handler({ packDir: '/packs/test' });
      expect(runtime.packInstaller.install).toHaveBeenCalledWith('/packs/test', runtime);
      expect(result).toHaveProperty('installed', true);
    });

    it('hot-registers facades when callback is set', async () => {
      runtime = makeMockRuntime();
      const hotRegister = vi.fn();
      setHotRegister(hotRegister);
      ops = createPackOps(runtime);
      const result = (await findOp('pack_install').handler({ packDir: '/packs/test' })) as Record<
        string,
        unknown
      >;
      expect(hotRegister).toHaveBeenCalledWith('test-agent_design', 'Design facade', []);
      expect(result.hotReloaded).toBe(true);
    });

    it('skips hot-register when no callback set', async () => {
      runtime = makeMockRuntime();
      ops = createPackOps(runtime);
      const result = (await findOp('pack_install').handler({ packDir: '/packs/test' })) as Record<
        string,
        unknown
      >;
      expect(result.hotReloaded).toBeUndefined();
    });

    it('skips hot-register when no facades', async () => {
      runtime = makeMockRuntime();
      (runtime.packInstaller.install as ReturnType<typeof vi.fn>).mockResolvedValue({
        installed: true,
        id: 'pack-1',
        facades: 0,
      });
      const hotRegister = vi.fn();
      setHotRegister(hotRegister);
      ops = createPackOps(runtime);
      await findOp('pack_install').handler({ packDir: '/packs/test' });
      expect(hotRegister).not.toHaveBeenCalled();
    });
  });

  describe('pack_list', () => {
    it('returns formatted pack list', async () => {
      runtime = makeMockRuntime();
      ops = createPackOps(runtime);
      const result = (await findOp('pack_list').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(1);
      const packs = result.packs as Array<Record<string, unknown>>;
      expect(packs[0].name).toBe('test-pack');
      expect(packs[0].version).toBe('1.0.0');
      expect(packs[0].status).toBe('active');
    });

    it('returns empty list when no packs', async () => {
      runtime = makeMockRuntime();
      (runtime.packInstaller.list as ReturnType<typeof vi.fn>).mockReturnValue([]);
      ops = createPackOps(runtime);
      const result = (await findOp('pack_list').handler({})) as Record<string, unknown>;
      expect(result.count).toBe(0);
      expect(result.packs).toEqual([]);
    });
  });

  describe('pack_uninstall', () => {
    it('uninstalls a pack', async () => {
      runtime = makeMockRuntime();
      ops = createPackOps(runtime);
      const result = (await findOp('pack_uninstall').handler({ packId: 'pack-1' })) as Record<
        string,
        unknown
      >;
      expect(result.uninstalled).toBe(true);
      expect(result.id).toBe('pack-1');
    });

    it('returns error when pack not found', async () => {
      runtime = makeMockRuntime();
      (runtime.packInstaller.uninstall as ReturnType<typeof vi.fn>).mockReturnValue(false);
      ops = createPackOps(runtime);
      const result = (await findOp('pack_uninstall').handler({ packId: 'missing' })) as Record<
        string,
        unknown
      >;
      expect(result.error).toContain('Pack not found');
    });
  });
});
