/**
 * Unit tests for plugin-ops — 5 ops for runtime plugin management.
 */

import { describe, it, expect, vi } from 'vitest';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import { createPluginOps } from './plugin-ops.js';
import type { AgentRuntime } from './types.js';
import type { OpDefinition } from '../facades/types.js';

/** Minimal plugin registry stub. */
function makePluginRegistryStub() {
  const plugins = new Map<
    string,
    {
      id: string;
      manifest: {
        id: string;
        name: string;
        version: string;
        domain: string;
        description: string;
        dependencies: string[];
        intelligence: unknown[];
      };
      status: string;
      provenance: string;
      directory: string;
      error?: string;
      facades: Array<{ name: string; description: string; ops: OpDefinition[] }>;
      registeredAt: number;
      activatedAt?: number;
    }
  >();

  return {
    get: (id: string) => plugins.get(id) ?? null,
    list: () => [...plugins.values()],
    register: vi.fn((plugin: { manifest: { id: string } }) => {
      const existing = plugins.get(plugin.manifest.id);
      if (existing) throw new Error(`Already registered: ${plugin.manifest.id}`);
      plugins.set(plugin.manifest.id, plugin as never);
    }),
    activate: vi.fn(async (pluginId: string, _ctx: unknown) => {
      const plugin = plugins.get(pluginId);
      if (!plugin) return { id: pluginId, status: 'error', error: 'Not found', facades: [] };
      plugin.status = 'active';
      plugin.activatedAt = Date.now();
      return { id: pluginId, status: 'active', facades: plugin.facades, error: undefined };
    }),
    deactivate: vi.fn((pluginId: string) => {
      const plugin = plugins.get(pluginId);
      if (!plugin) return false;
      plugin.status = 'registered';
      return true;
    }),
    _seed: (
      id: string,
      overrides?: Partial<{
        status: string;
        facades: Array<{ name: string; description: string; ops: OpDefinition[] }>;
      }>,
    ) => {
      plugins.set(id, {
        id,
        manifest: {
          id,
          name: `Plugin ${id}`,
          version: '1.0.0',
          domain: 'test',
          description: 'Test plugin',
          dependencies: [],
          intelligence: [],
        },
        status: overrides?.status ?? 'registered',
        provenance: 'local',
        directory: `/plugins/${id}`,
        facades: overrides?.facades ?? [],
        registeredAt: Date.now(),
      });
    },
  };
}

describe('plugin-ops', () => {
  function setup(opts?: { opSink?: OpDefinition[] }) {
    const pluginRegistry = makePluginRegistryStub();
    const config = { agentId: 'test-agent' };
    const opSink = opts?.opSink;
    const ops = captureOps(
      createPluginOps({ pluginRegistry, config } as unknown as AgentRuntime, opSink),
    );
    return { pluginRegistry, ops, opSink };
  }

  describe('plugin_list', () => {
    it('returns empty when no plugins registered', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'plugin_list');
      expect(res.success).toBe(true);
      const data = res.data as { plugins: unknown[]; count: number; active: number };
      expect(data.count).toBe(0);
      expect(data.active).toBe(0);
    });

    it('lists registered plugins with status', async () => {
      const { ops, pluginRegistry } = setup();
      pluginRegistry._seed('plug-a', {
        status: 'active',
        facades: [
          {
            name: 'f1',
            description: 'F1',
            ops: [{ name: 'op1', handler: async () => ({}), auth: 'read', description: '' }],
          },
        ],
      });
      pluginRegistry._seed('plug-b', { status: 'registered' });

      const res = await executeOp(ops, 'plugin_list');
      const data = res.data as {
        count: number;
        active: number;
        plugins: Array<{ id: string; status: string; facades: number; ops: number }>;
      };
      expect(data.count).toBe(2);
      expect(data.active).toBe(1);
      expect(data.plugins[0].facades).toBe(1);
      expect(data.plugins[0].ops).toBe(1);
    });
  });

  describe('plugin_status', () => {
    it('returns error for missing plugin', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'plugin_status', { pluginId: 'nope' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not found');
    });

    it('returns detailed status for existing plugin', async () => {
      const { ops, pluginRegistry } = setup();
      pluginRegistry._seed('my-plug');

      const res = await executeOp(ops, 'plugin_status', { pluginId: 'my-plug' });
      const data = res.data as {
        id: string;
        name: string;
        version: string;
        status: string;
        directory: string;
      };
      expect(data.id).toBe('my-plug');
      expect(data.version).toBe('1.0.0');
      expect(data.directory).toBe('/plugins/my-plug');
    });
  });

  describe('plugin_activate', () => {
    it('returns error for missing plugin', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'plugin_activate', { pluginId: 'nope' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not found');
    });

    it('activates a specific plugin', async () => {
      const { ops, pluginRegistry } = setup();
      pluginRegistry._seed('plug-a', { facades: [] });

      const res = await executeOp(ops, 'plugin_activate', { pluginId: 'plug-a' });
      expect(res.success).toBe(true);
      const data = res.data as { id: string; status: string };
      expect(data.status).toBe('active');
      expect(pluginRegistry.activate).toHaveBeenCalled();
    });

    it('activates all registered (non-active) plugins when no pluginId', async () => {
      const { ops, pluginRegistry } = setup();
      pluginRegistry._seed('p1', { status: 'registered', facades: [] });
      pluginRegistry._seed('p2', { status: 'registered', facades: [] });

      const res = await executeOp(ops, 'plugin_activate', {});
      const data = res.data as {
        activated: number;
        results: Array<{ id: string; status: string }>;
      };
      expect(data.activated).toBe(2);
      expect(data.results).toHaveLength(2);
    });

    it('injects plugin ops into opSink on activation', async () => {
      const opSink: OpDefinition[] = [];
      const { ops, pluginRegistry } = setup({ opSink });
      const testOp: OpDefinition = {
        name: 'injected_op',
        handler: async () => 'hi',
        auth: 'read',
        description: 'test',
      };
      pluginRegistry._seed('plug-inject', {
        facades: [{ name: 'test-facade', description: 'TF', ops: [testOp] }],
      });

      await executeOp(ops, 'plugin_activate', { pluginId: 'plug-inject' });
      expect(opSink.some((o) => o.name === 'injected_op')).toBe(true);
    });
  });

  describe('plugin_deactivate', () => {
    it('returns error for missing plugin', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'plugin_deactivate', { pluginId: 'nope' });
      expect(res.success).toBe(true);
      expect((res.data as { error: string }).error).toContain('not found');
    });

    it('deactivates an active plugin', async () => {
      const { ops, pluginRegistry } = setup();
      pluginRegistry._seed('d-plug', { status: 'active' });

      const res = await executeOp(ops, 'plugin_deactivate', { pluginId: 'd-plug' });
      const data = res.data as { deactivated: boolean; removedOps: number };
      expect(data.deactivated).toBe(true);
      expect(pluginRegistry.deactivate).toHaveBeenCalledWith('d-plug');
    });

    it('removes injected ops from opSink on deactivation', async () => {
      const opSink: OpDefinition[] = [];
      const { ops, pluginRegistry } = setup({ opSink });
      const testOp: OpDefinition = {
        name: 'to_remove',
        handler: async () => 'hi',
        auth: 'read',
        description: 'test',
      };
      pluginRegistry._seed('plug-rm', {
        facades: [{ name: 'f', description: 'F', ops: [testOp] }],
      });

      await executeOp(ops, 'plugin_activate', { pluginId: 'plug-rm' });
      expect(opSink.some((o) => o.name === 'to_remove')).toBe(true);

      await executeOp(ops, 'plugin_deactivate', { pluginId: 'plug-rm' });
      expect(opSink.some((o) => o.name === 'to_remove')).toBe(false);
    });
  });

  describe('plugin_load', () => {
    it('runs without crashing (loadPlugins scans filesystem)', async () => {
      const { ops } = setup();
      // loadPlugins scans directories — with non-existent paths it returns empty
      const res = await executeOp(ops, 'plugin_load', { projectPath: '/nonexistent' });
      expect(res.success).toBe(true);
      const data = res.data as { registered: string[]; registeredCount: number };
      expect(data.registeredCount).toBe(0);
    });
  });
});
