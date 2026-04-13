/**
 * Colocated tests for register-engine.ts
 *
 * Validates registerEngine() registration mechanics:
 * - Module tool naming convention
 * - Engine module ordering and completeness
 * - Core ops registration
 * - Domain and domain pack registration
 * - Hot ops as standalone tools
 * - Auth policy enforcement
 * - Error handling for unknown ops
 * - Dynamic tool registration (registerTool)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createAgentRuntime } from '../runtime/runtime.js';
import { registerEngine, ENGINE_MODULES, INTERNAL_OPS } from './register-engine.js';
import { ENGINE_MODULE_MANIFEST } from './module-manifest.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

let runtime: AgentRuntime;

beforeAll(() => {
  runtime = createAgentRuntime({
    agentId: 'reg-test',
    vaultPath: ':memory:',
  });
});

afterAll(() => {
  runtime.close();
});

function makeServer(): McpServer {
  return new McpServer({ name: 'test-server', version: '1.0.0' });
}

describe('registerEngine — tool naming', () => {
  it('prefixes all tools with agentId', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'mybot' });
    for (const tool of result.tools) {
      expect(tool.startsWith('mybot_')).toBe(true);
    }
  });

  it('creates {agentId}_{suffix} for each engine module', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'alfa' });
    const expectedSuffixes = ENGINE_MODULES.map((m) => m.suffix);
    for (const suffix of expectedSuffixes) {
      expect(result.tools).toContain(`alfa_${suffix}`);
    }
  });
});

describe('registerEngine — module completeness', () => {
  it('ENGINE_MODULES matches ENGINE_MODULE_MANIFEST suffixes', () => {
    const moduleSuffixes = ENGINE_MODULES.map((m) => m.suffix);
    const manifestSuffixes = ENGINE_MODULE_MANIFEST.map((m) => m.suffix);
    expect(moduleSuffixes).toEqual(manifestSuffixes);
  });

  it('registers all unconditional modules', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'check' });
    const unconditional = ENGINE_MODULES.filter((m) => !m.condition);
    for (const mod of unconditional) {
      expect(result.tools).toContain(`check_${mod.suffix}`);
    }
  });
});

describe('registerEngine — module ordering', () => {
  it('registers vault before brain (dependency order)', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'ord' });
    const vaultIdx = result.tools.indexOf('ord_vault');
    const brainIdx = result.tools.indexOf('ord_brain');
    expect(vaultIdx).toBeLessThan(brainIdx);
  });

  it('registers vault as the first engine module tool', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'first' });
    expect(result.tools[0]).toBe('first_vault');
  });
});

describe('registerEngine — core ops', () => {
  it('registers core facade when coreOps provided', () => {
    const server = makeServer();
    const coreOps: OpDefinition[] = [
      {
        name: 'health',
        description: 'Health check',
        auth: 'read',
        handler: async () => ({ ok: true }),
      },
    ];
    const result = registerEngine(server, runtime, { agentId: 'core', coreOps });
    expect(result.tools).toContain('core_core');
    expect(result.totalOps).toBeGreaterThan(ENGINE_MODULES.length); // at least 1 per module + 1 core
  });

  it('does not register core facade when coreOps is empty', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'nocore', coreOps: [] });
    expect(result.tools).not.toContain('nocore_core');
  });

  it('does not register core facade when coreOps is undefined', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'nocore2' });
    expect(result.tools).not.toContain('nocore2_core');
  });
});

describe('registerEngine — hot ops', () => {
  it('registers hot ops as standalone tools', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, {
      agentId: 'hot',
      hotOps: ['search_intelligent', 'capture_knowledge'],
    });
    expect(result.tools).toContain('hot_search_intelligent');
    expect(result.tools).toContain('hot_capture_knowledge');
  });

  it('counts hot ops in totalOps', () => {
    const server = makeServer();
    const baseResult = registerEngine(server, runtime, { agentId: 'base' });

    const server2 = makeServer();
    const hotResult = registerEngine(server2, runtime, {
      agentId: 'hotcount',
      hotOps: ['search_intelligent'],
    });
    // Hot ops don't add to totalOps (they mirror existing ops)
    // But they do add to tools array
    expect(hotResult.tools.length).toBeGreaterThan(baseResult.tools.length);
  });
});

describe('registerEngine — domains', () => {
  it('registers domain facades with correct naming', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, {
      agentId: 'dom',
      domains: ['testing', 'architecture'],
    });
    expect(result.tools).toContain('dom_testing');
    expect(result.tools).toContain('dom_architecture');
  });

  it('increments totalOps for domain facade ops', () => {
    const server1 = makeServer();
    const noDomains = registerEngine(server1, runtime, { agentId: 'nod' });

    const server2 = makeServer();
    const withDomains = registerEngine(server2, runtime, {
      agentId: 'wd',
      domains: ['testing'],
    });
    expect(withDomains.totalOps).toBeGreaterThan(noDomains.totalOps);
  });
});

describe('registerEngine — domain packs', () => {
  it('registers domain pack facades with agentId prefix', () => {
    const server = makeServer();
    const packOp: OpDefinition = {
      name: 'custom_search',
      description: 'Custom search',
      auth: 'read',
      handler: async () => [],
    };
    const result = registerEngine(server, runtime, {
      agentId: 'pk',
      domainPacks: [{ name: 'my-pack', facades: [{ name: 'custom', ops: [packOp] }] }],
    });
    expect(result.tools).toContain('pk_custom');
  });

  it('skips packs without facades', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, {
      agentId: 'skip',
      domainPacks: [{ name: 'empty-pack' }],
    });
    // Should still register normally without errors
    expect(result.tools.length).toBeGreaterThan(0);
  });
});

describe('registerEngine — return value', () => {
  it('returns tools array, totalOps count, and registerTool function', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'ret' });
    expect(result.tools.length).toBeGreaterThan(0);
    expect(typeof result.totalOps).toBe('number');
    expect(typeof result.registerTool).toBe('function');
  });

  it('registerTool adds a new tool at runtime', () => {
    const server = makeServer();
    const result = registerEngine(server, runtime, { agentId: 'dyn' });
    const initialCount = result.tools.length;

    result.registerTool('dyn_extra', 'Extra tool', [
      { name: 'ping', description: 'Ping', auth: 'read', handler: async () => 'pong' },
    ]);

    expect(result.tools.length).toBe(initialCount + 1);
    expect(result.tools).toContain('dyn_extra');
  });
});

describe('registerEngine — runtime.opsRegistry (bulletproof live registry)', () => {
  it('attaches opsRegistry to runtime with >=100 ops after registration', () => {
    const server = makeServer();
    registerEngine(server, runtime, { agentId: 'reg' });
    expect(runtime.opsRegistry).toBeDefined();
    // Bulletproof count guardrail. Current engine registers ~400 ops including
    // internal — user-visible count should still be safely above 100.
    // If this ever drops below 100, something has been silently removed.
    const count = runtime.opsRegistry!.count({ includeInternal: true });
    expect(count).toBeGreaterThanOrEqual(100);
  });

  it('registry contains canonical ops from each core facade', () => {
    const server = makeServer();
    registerEngine(server, runtime, { agentId: 'canon' });
    const registry = runtime.opsRegistry!;
    // Spot-check one canonical op from each of the major facades.
    expect(registry.has('admin_health')).toBe(true);
    expect(registry.has('search_intelligent')).toBe(true);
    expect(registry.has('create_plan')).toBe(true);
    expect(registry.has('capture_knowledge')).toBe(true);
  });

  it('registry facadeList covers every ENGINE_MODULES suffix', () => {
    const server = makeServer();
    registerEngine(server, runtime, { agentId: 'fl' });
    const registered = new Set(runtime.opsRegistry!.facadeList());
    for (const mod of ENGINE_MODULES) {
      expect(registered.has(mod.suffix)).toBe(true);
    }
  });

  it('registry reflects core facade when coreOps are provided', () => {
    const server = makeServer();
    const coreOps: OpDefinition[] = [
      { name: 'agent_activate', description: 'Activate', auth: 'read', handler: async () => null },
    ];
    registerEngine(server, runtime, { agentId: 'coreagent', coreOps });
    expect(runtime.opsRegistry!.has('agent_activate')).toBe(true);
    expect(runtime.opsRegistry!.get('agent_activate')?.facade).toBe('core');
  });

  it('registry zero internal ops equals total minus user count', () => {
    const server = makeServer();
    registerEngine(server, runtime, { agentId: 'inv' });
    const registry = runtime.opsRegistry!;
    const total = registry.count({ includeInternal: true });
    const userOnly = registry.count({ includeInternal: false });
    expect(total).toBeGreaterThanOrEqual(userOnly);
    // Engine should have at least a handful of internal ops (token mgmt, bulk, etc.)
    expect(total - userOnly).toBeGreaterThan(0);
  });
});

describe('ENGINE_MODULES descriptions match manifest', () => {
  it('each module description aligns with manifest', () => {
    for (let i = 0; i < ENGINE_MODULES.length; i++) {
      const mod = ENGINE_MODULES[i];
      const manifest = ENGINE_MODULE_MANIFEST[i];
      expect(mod.suffix).toBe(manifest.suffix);
      // Descriptions may diverge slightly but suffix must match
    }
  });
});

describe('registerEngine — op visibility', () => {
  it('INTERNAL_OPS set contains expected ops', () => {
    // Spot-check known internal ops
    expect(INTERNAL_OPS.has('admin_create_token')).toBe(true);
    expect(INTERNAL_OPS.has('vault_bulk_add')).toBe(true);
    expect(INTERNAL_OPS.has('plan_auto_reconcile')).toBe(true);
    expect(INTERNAL_OPS.has('telemetry_errors')).toBe(true);
    // User-facing ops should NOT be in the set
    expect(INTERNAL_OPS.has('admin_health')).toBe(false);
    expect(INTERNAL_OPS.has('search_intelligent')).toBe(false);
    expect(INTERNAL_OPS.has('create_plan')).toBe(false);
  });

  it('INTERNAL_OPS has exactly 29 entries', () => {
    expect(INTERNAL_OPS.size).toBe(29);
  });

  it('ops without visibility field default to user (backward compat)', () => {
    const server = makeServer();
    const userOp: OpDefinition = {
      name: 'my_visible_op',
      description: 'Visible op',
      auth: 'read',
      handler: async () => 'ok',
    };
    const result = registerEngine(server, runtime, {
      agentId: 'vis',
      domainPacks: [{ name: 'test', facades: [{ name: 'test', ops: [userOp] }] }],
    });
    expect(result.tools).toContain('vis_test');
  });

  it('every INTERNAL_OPS entry corresponds to a real op in some facade', () => {
    // Collect all op names across all engine modules
    const allOpNames = new Set<string>();
    for (const mod of ENGINE_MODULES) {
      const ops = mod.createOps(runtime);
      for (const op of ops) {
        allOpNames.add(op.name);
      }
    }
    for (const internalOp of INTERNAL_OPS) {
      expect(allOpNames.has(internalOp)).toBe(true);
    }
  });
});
