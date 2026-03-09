import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createPluginOps } from '../runtime/plugin-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('plugin ops', () => {
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
      agentId: 'test-plugin-ops',
      vaultPath: ':memory:',
    });
    ops = createPluginOps(runtime);
    testDir = join(tmpdir(), `soleri-plugin-ops-test-${Date.now()}`);
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

  it('should return 5 plugin ops', () => {
    expect(ops).toHaveLength(5);
    const names = ops.map((o) => o.name);
    expect(names).toContain('plugin_list');
    expect(names).toContain('plugin_load');
    expect(names).toContain('plugin_activate');
    expect(names).toContain('plugin_deactivate');
    expect(names).toContain('plugin_status');
  });

  it('should list empty plugins initially', async () => {
    const result = (await findOp('plugin_list').handler({})) as {
      plugins: unknown[];
      count: number;
      active: number;
    };
    expect(result.count).toBe(0);
    expect(result.active).toBe(0);
    expect(result.plugins).toEqual([]);
  });

  it('should load plugins from a directory', async () => {
    // Create a test plugin
    const pluginDir = join(testDir, 'hello-plugin');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'hello-plugin',
        name: 'Hello Plugin',
        version: '1.0.0',
        description: 'A greeting plugin',
      }),
    );

    const result = (await findOp('plugin_load').handler({
      extraDirs: [testDir],
    })) as { registered: string[]; registeredCount: number };

    expect(result.registeredCount).toBe(1);
    expect(result.registered).toContain('hello-plugin');
  });

  it('should scan project plugins by default when projectPath is omitted', async () => {
    const originalCwd = process.cwd();
    const projectRoot = join(testDir, 'project-root');
    const projectPluginsDir = join(projectRoot, '.test-plugin-ops', 'plugins', 'proj-plugin');
    mkdirSync(projectPluginsDir, { recursive: true });
    writeFileSync(
      join(projectPluginsDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'proj-plugin',
        name: 'Project Plugin',
        version: '1.0.0',
      }),
    );

    try {
      process.chdir(projectRoot);
      const result = (await findOp('plugin_load').handler({})) as {
        registered: string[];
        registeredCount: number;
      };
      expect(result.registeredCount).toBe(1);
      expect(result.registered).toContain('proj-plugin');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should activate and list a loaded plugin', async () => {
    // Create and load
    const pluginDir = join(testDir, 'greet');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'greet',
        name: 'Greet',
        version: '1.0.0',
        facades: [
          {
            name: 'greet_facade',
            description: 'Greeting ops',
            ops: [{ name: 'say_hello', description: 'Say hello', auth: 'read' }],
          },
        ],
      }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    const activateResult = (await findOp('plugin_activate').handler({
      pluginId: 'greet',
    })) as { id: string; status: string; facades: number; ops: number };

    expect(activateResult.status).toBe('active');
    expect(activateResult.facades).toBe(1);
    expect(activateResult.ops).toBe(1);

    // Verify in list
    const listResult = (await findOp('plugin_list').handler({})) as {
      count: number;
      active: number;
    };
    expect(listResult.count).toBe(1);
    expect(listResult.active).toBe(1);
  });

  it('should inject activated plugin ops into the provided op sink', async () => {
    const opSink: OpDefinition[] = [];
    const pluginOps = createPluginOps(runtime, opSink);
    opSink.push(...pluginOps);
    ops = pluginOps;

    const pluginDir = join(testDir, 'inject');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'inject',
        name: 'Inject',
        version: '1.0.0',
        facades: [
          {
            name: 'inject_facade',
            description: 'Inject facade',
            ops: [{ name: 'inject_ping', description: 'Ping', auth: 'read' }],
          },
        ],
      }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    const activateResult = (await findOp('plugin_activate').handler({
      pluginId: 'inject',
    })) as { status: string; injectedOps: number };

    expect(activateResult.status).toBe('active');
    expect(activateResult.injectedOps).toBe(1);
    expect(opSink.some((o) => o.name === 'inject_ping')).toBe(true);
  });

  it('should deactivate a plugin', async () => {
    const pluginDir = join(testDir, 'deact');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({ id: 'deact', name: 'Deact', version: '1.0.0' }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    await findOp('plugin_activate').handler({ pluginId: 'deact' });

    const result = (await findOp('plugin_deactivate').handler({
      pluginId: 'deact',
    })) as { deactivated: boolean };
    expect(result.deactivated).toBe(true);

    const listResult = (await findOp('plugin_list').handler({})) as { active: number };
    expect(listResult.active).toBe(0);
  });

  it('should remove injected plugin ops on deactivate', async () => {
    const opSink: OpDefinition[] = [];
    const pluginOps = createPluginOps(runtime, opSink);
    opSink.push(...pluginOps);
    ops = pluginOps;

    const pluginDir = join(testDir, 'remove-injected');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'remove-injected',
        name: 'Remove Injected',
        version: '1.0.0',
        facades: [
          {
            name: 'remove_facade',
            description: 'Remove facade',
            ops: [{ name: 'remove_ping', description: 'Ping', auth: 'read' }],
          },
        ],
      }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    await findOp('plugin_activate').handler({ pluginId: 'remove-injected' });
    expect(opSink.some((o) => o.name === 'remove_ping')).toBe(true);

    const deactivateResult = (await findOp('plugin_deactivate').handler({
      pluginId: 'remove-injected',
    })) as { deactivated: boolean; removedOps: number };

    expect(deactivateResult.deactivated).toBe(true);
    expect(deactivateResult.removedOps).toBe(1);
    expect(opSink.some((o) => o.name === 'remove_ping')).toBe(false);
  });

  it('should report plugin op collisions during activation', async () => {
    const opSink: OpDefinition[] = [];
    const pluginOps = createPluginOps(runtime, opSink);
    opSink.push(...pluginOps);
    ops = pluginOps;

    const pluginDir = join(testDir, 'collision');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'collision',
        name: 'Collision',
        version: '1.0.0',
        facades: [
          {
            name: 'collision_facade',
            description: 'Collision facade',
            ops: [{ name: 'plugin_list', description: 'Collision', auth: 'read' }],
          },
        ],
      }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    const activateResult = (await findOp('plugin_activate').handler({
      pluginId: 'collision',
    })) as { status: string; injectedOps: number; injectionError?: string };

    expect(activateResult.status).toBe('active');
    expect(activateResult.injectedOps).toBe(0);
    expect(activateResult.injectionError).toContain('collision');
  });

  it('should get plugin status', async () => {
    const pluginDir = join(testDir, 'status-test');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'status-test',
        name: 'Status Test',
        version: '2.0.0',
        domain: 'testing',
      }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });

    const result = (await findOp('plugin_status').handler({
      pluginId: 'status-test',
    })) as {
      id: string;
      name: string;
      version: string;
      domain: string;
      status: string;
    };

    expect(result.id).toBe('status-test');
    expect(result.name).toBe('Status Test');
    expect(result.version).toBe('2.0.0');
    expect(result.domain).toBe('testing');
    expect(result.status).toBe('registered');
  });

  it('should return error for unknown plugin in status', async () => {
    const result = (await findOp('plugin_status').handler({
      pluginId: 'nonexistent',
    })) as { error: string };
    expect(result.error).toContain('not found');
  });

  it('should activate all plugins when no pluginId specified', async () => {
    const p1 = join(testDir, 'p1');
    const p2 = join(testDir, 'p2');
    mkdirSync(p1, { recursive: true });
    mkdirSync(p2, { recursive: true });
    writeFileSync(
      join(p1, 'soleri-plugin.json'),
      JSON.stringify({ id: 'p1', name: 'P1', version: '1.0.0' }),
    );
    writeFileSync(
      join(p2, 'soleri-plugin.json'),
      JSON.stringify({ id: 'p2', name: 'P2', version: '1.0.0' }),
    );

    await findOp('plugin_load').handler({ extraDirs: [testDir] });
    const result = (await findOp('plugin_activate').handler({})) as {
      activated: number;
    };

    expect(result.activated).toBe(2);
  });

  it('should report dependency errors on load', async () => {
    const pluginDir = join(testDir, 'dep-fail');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'dep-fail',
        name: 'Dep Fail',
        version: '1.0.0',
        dependencies: ['missing-dep'],
      }),
    );

    const result = (await findOp('plugin_load').handler({
      extraDirs: [testDir],
    })) as {
      registered: string[];
      registeredCount: number;
      loadErrors: Array<{ error: string }>;
      dependencyErrors: Array<{ id: string; dependency: string; error: string }>;
      registrationErrors: Array<{ id: string; error: string }>;
      errors: Array<{ error: string }>;
    };

    expect(result.registeredCount).toBe(0);
    expect(result.registered).toEqual([]);
    expect(result.loadErrors).toEqual([]);
    expect(result.registrationErrors).toEqual([]);
    expect(result.dependencyErrors.length).toBeGreaterThan(0);
    expect(result.dependencyErrors[0].dependency).toBe('missing-dep');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.error.includes('missing-dep'))).toBe(true);
  });

  it('should return a consistent plugin_load response shape on success', async () => {
    const pluginDir = join(testDir, 'shape-ok');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'soleri-plugin.json'),
      JSON.stringify({
        id: 'shape-ok',
        name: 'Shape OK',
        version: '1.0.0',
      }),
    );

    const result = (await findOp('plugin_load').handler({
      extraDirs: [testDir],
    })) as {
      registered: string[];
      registeredCount: number;
      loadErrors: unknown[];
      dependencyErrors: unknown[];
      registrationErrors: unknown[];
      errors: unknown[];
    };

    expect(result.registeredCount).toBe(1);
    expect(result.registered).toContain('shape-ok');
    expect(result.loadErrors).toEqual([]);
    expect(result.dependencyErrors).toEqual([]);
    expect(result.registrationErrors).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  describe('auth levels', () => {
    it('should use read auth for list and status ops', () => {
      expect(findOp('plugin_list').auth).toBe('read');
      expect(findOp('plugin_status').auth).toBe('read');
    });

    it('should use admin auth for load, activate, deactivate ops', () => {
      expect(findOp('plugin_load').auth).toBe('admin');
      expect(findOp('plugin_activate').auth).toBe('admin');
      expect(findOp('plugin_deactivate').auth).toBe('admin');
    });
  });
});
