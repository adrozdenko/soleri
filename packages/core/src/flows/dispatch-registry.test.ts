/**
 * Dispatch registry — colocated contract tests.
 *
 * Contract:
 * - createDispatcher() returns a function that routes tool calls to facade ops
 * - Tool names follow convention: {agentId}_{facadeName}_{opName}
 * - Strips agent prefix, splits remaining into facade + op
 * - Tries progressively shorter facade prefixes for multi-segment names
 * - Falls back to params.op when tool name matches a whole facade
 * - Returns { status: 'unregistered' } for unknown tools
 * - Catches handler errors and returns { status: 'error' }
 */

import { describe, it, expect, vi } from 'vitest';
import { createDispatcher } from './dispatch-registry.js';
import type { FacadeConfig } from '../facades/types.js';

function facade(name: string, ops: Array<{ name: string; result?: unknown }>): FacadeConfig {
  return {
    name,
    description: `Test facade ${name}`,
    ops: ops.map((o) => ({
      name: o.name,
      description: `op ${o.name}`,
      auth: 'read' as const,
      handler: vi.fn(async () => o.result ?? { ok: true }),
    })),
  };
}

describe('createDispatcher', () => {
  it('routes a prefixed tool call to the correct facade op', async () => {
    const f = facade('agent_vault', [{ name: 'search', result: { items: [] } }]);
    const dispatch = createDispatcher('agent', [f]);

    const result = await dispatch('agent_vault_search', { query: 'test' });

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ items: [] });
    expect(result.tool).toBe('agent_vault_search');
    expect(f.ops[0].handler).toHaveBeenCalledWith({ query: 'test' });
  });

  it('handles multi-segment facade names', async () => {
    const f = facade('agent_design_rules', [{ name: 'get', result: { rules: [] } }]);
    const dispatch = createDispatcher('agent', [f]);

    const result = await dispatch('agent_design_rules_get', {});

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ rules: [] });
  });

  it('returns unregistered for unknown tool', async () => {
    const dispatch = createDispatcher('agent', []);

    const result = await dispatch('agent_unknown_op', {});

    expect(result.status).toBe('unregistered');
    expect(result.tool).toBe('agent_unknown_op');
  });

  it('returns unregistered for known facade but unknown op', async () => {
    const f = facade('agent_vault', [{ name: 'search' }]);
    const dispatch = createDispatcher('agent', [f]);

    const result = await dispatch('agent_vault_nonexistent', {});

    expect(result.status).toBe('unregistered');
  });

  it('catches handler errors and returns error status', async () => {
    const f: FacadeConfig = {
      name: 'agent_vault',
      description: 'Vault',
      ops: [
        {
          name: 'search',
          description: 'search',
          auth: 'read',
          handler: vi.fn(async () => {
            throw new Error('DB connection failed');
          }),
        },
      ],
    };
    const dispatch = createDispatcher('agent', [f]);

    const result = await dispatch('agent_vault_search', {});

    expect(result.status).toBe('error');
    expect(result.error).toBe('DB connection failed');
  });

  it('supports params.op fallback for whole-facade tool names', async () => {
    const f = facade('agent_vault', [{ name: 'search', result: { found: true } }]);
    const dispatch = createDispatcher('agent', [f]);

    const result = await dispatch('agent_vault', { op: 'search', query: 'x' });

    expect(result.status).toBe('ok');
    expect(result.data).toEqual({ found: true });
  });

  it('routes tool names without agent prefix by prepending it', async () => {
    const f = facade('agent_brain', [{ name: 'recommend' }]);
    const dispatch = createDispatcher('agent', [f]);

    // Tool name without agent_ prefix — dispatcher tries unprefixed path
    // which becomes "brain_recommend", then tries facade "agent_brain" + op "recommend"
    const result = await dispatch('brain_recommend', {});

    // The dispatcher prepends the prefix internally, so it still resolves
    expect(result.status).toBe('ok');
  });

  it('dispatches to multiple facades independently', async () => {
    const vaultFacade = facade('agent_vault', [{ name: 'search', result: { v: 1 } }]);
    const brainFacade = facade('agent_brain', [{ name: 'recommend', result: { b: 2 } }]);
    const dispatch = createDispatcher('agent', [vaultFacade, brainFacade]);

    const r1 = await dispatch('agent_vault_search', {});
    const r2 = await dispatch('agent_brain_recommend', {});

    expect(r1.data).toEqual({ v: 1 });
    expect(r2.data).toEqual({ b: 2 });
  });
});
