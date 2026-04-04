/**
 * Colocated tests for core-ops.ts
 *
 * Validates createCoreOps() — the 5 agent-specific ops:
 * health, identity, activate, session_start, setup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCoreOps, type AgentIdentityConfig } from './core-ops.js';
import { captureOps, executeOp } from './test-helpers.js';
import { createAgentRuntime } from '../runtime/runtime.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { CapturedOp } from './test-helpers.js';

const TEST_IDENTITY: AgentIdentityConfig = {
  id: 'test-agent',
  name: 'TestBot',
  role: 'Testing Assistant',
  description: 'An agent for unit testing',
  domains: ['testing', 'quality'],
  principles: ['test everything', 'assert precisely'],
  tone: 'pragmatic',
  greeting: 'Hello from tests!',
};

let runtime: AgentRuntime;
let ops: Map<string, CapturedOp>;

beforeAll(() => {
  runtime = createAgentRuntime({
    agentId: 'test-agent',
    vaultPath: ':memory:',
  });
  ops = captureOps(createCoreOps(runtime, TEST_IDENTITY));
});

afterAll(() => {
  runtime.close();
});

describe('health op', () => {
  it('returns status ok with agent info', async () => {
    const result = await executeOp(ops, 'health');
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.status).toBe('ok');
    expect(data.agent).toEqual({
      name: 'TestBot',
      role: 'Testing Assistant',
      format: 'filetree',
    });
  });

  it('includes vault stats', async () => {
    const result = await executeOp(ops, 'health');
    const data = result.data as Record<string, unknown>;
    const vault = data.vault as Record<string, unknown>;
    expect(typeof vault.entries).toBe('number');
    expect(vault.domains).toEqual([]);
  });

  it('has read auth level', () => {
    expect(ops.get('health')!.auth).toBe('read');
  });
});

describe('identity op', () => {
  it('returns identity fields from config', async () => {
    const result = await executeOp(ops, 'identity');
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.name).toBe('TestBot');
    expect(data.role).toBe('Testing Assistant');
    expect(data.description).toBe('An agent for unit testing');
    expect(data.domains).toEqual(['testing', 'quality']);
    expect(data.principles).toEqual(['test everything', 'assert precisely']);
    expect(data.tone).toBe('pragmatic');
  });

  it('has read auth level', () => {
    expect(ops.get('identity')!.auth).toBe('read');
  });
});

describe('activate op', () => {
  it('returns activation context when activated', async () => {
    const result = await executeOp(ops, 'activate', { projectPath: '.' });
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.activated).toBe(true);
    expect(data.domains).toEqual(['testing', 'quality']);

    const agent = data.agent as Record<string, unknown>;
    expect(agent.id).toBe('test-agent');
    expect(agent.format).toBe('filetree');
  });

  it('includes vault connection info', async () => {
    const result = await executeOp(ops, 'activate', { projectPath: '.' });
    const data = result.data as Record<string, unknown>;
    const vault = data.vault as Record<string, unknown>;
    expect(vault.connected).toBe(true);
    expect(typeof vault.entries).toBe('number');
    expect(vault.domains).toEqual([]);
  });

  it('returns deactivation response when deactivate=true', async () => {
    const result = await executeOp(ops, 'activate', { deactivate: true });
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(data.deactivated).toBe(true);
    expect(data.agent).toBe('test-agent');
  });

  it('handles default projectPath', async () => {
    const result = await executeOp(ops, 'activate', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.activated).toBe(true);
  });

  it('offers persona setup when no persona configured', async () => {
    // Default runtime has persona template 'none' or a default
    const result = await executeOp(ops, 'activate', {});
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;

    // Either persona or personaSetup should be present
    const hasPersonaOrSetup = 'persona' in data || 'personaSetup' in data;
    expect(hasPersonaOrSetup).toBe(true);
  });

  it('has read auth level', () => {
    expect(ops.get('activate')!.auth).toBe('read');
  });
});

describe('session_start op', () => {
  it('registers a project path', async () => {
    const result = await executeOp(ops, 'session_start', { projectPath: '/tmp/test-project' });
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    expect(typeof data.registered).toBe('boolean');
  });

  it('handles default projectPath', async () => {
    const result = await executeOp(ops, 'session_start', {});
    expect(result.success).toBe(true);
  });

  it('has write auth level', () => {
    expect(ops.get('session_start')!.auth).toBe('write');
  });
});

describe('setup op', () => {
  it('returns agent info and vault stats', async () => {
    const result = await executeOp(ops, 'setup');
    expect(result.success).toBe(true);

    const data = result.data as Record<string, unknown>;
    const agent = data.agent as Record<string, unknown>;
    expect(agent.id).toBe('test-agent');
    expect(agent.name).toBe('TestBot');
    expect(agent.format).toBe('filetree');
  });

  it('returns engine capabilities', async () => {
    const result = await executeOp(ops, 'setup');
    const data = result.data as Record<string, unknown>;
    const engine = data.engine as Record<string, unknown>;
    expect(engine.brain).toBe(true);
    expect(engine.curator).toBe(true);
    expect(engine.planner).toBe(true);
  });

  it('returns vault domain and type breakdown', async () => {
    const result = await executeOp(ops, 'setup');
    const data = result.data as Record<string, unknown>;
    const vault = data.vault as Record<string, unknown>;
    expect(typeof vault.entries).toBe('number');
    expect(vault.domains).toEqual([]);
    expect(vault.byType).toEqual({});
  });

  it('recommends action when vault is empty', async () => {
    const result = await executeOp(ops, 'setup');
    const data = result.data as Record<string, unknown>;
    const recommendations = data.recommendations as string[];
    expect(Array.isArray(recommendations)).toBe(true);

    // Empty vault should yield a recommendation
    const stats = runtime.vault.stats();
    if (stats.totalEntries === 0) {
      expect(recommendations.length).toBe(1);
      expect(recommendations[0]).toContain('Vault is empty');
    } else {
      expect(recommendations).toHaveLength(0);
    }
  });

  it('has read auth level', () => {
    expect(ops.get('setup')!.auth).toBe('read');
  });
});

describe('identity with IdentityManager', () => {
  it('seeds identity on first activation', async () => {
    // Create a fresh runtime to ensure no identity is seeded yet
    const freshRuntime = createAgentRuntime({
      agentId: 'identity-test',
      vaultPath: ':memory:',
    });

    const freshOps = captureOps(createCoreOps(freshRuntime, TEST_IDENTITY));

    // Before activation, identity manager should not have this agent
    const beforeId = freshRuntime.identityManager?.getIdentity(TEST_IDENTITY.id);
    expect(beforeId).toBeFalsy();

    // Activate seeds identity
    await executeOp(freshOps, 'activate', { projectPath: '.' });

    const afterId = freshRuntime.identityManager?.getIdentity(TEST_IDENTITY.id);
    expect(afterId).toBeDefined();
    expect(afterId!.name).toBe('TestBot');
    expect(afterId!.role).toBe('Testing Assistant');

    freshRuntime.close();
  });
});
