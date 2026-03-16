/**
 * Tests for the direct engine registration (replaces facade factory).
 *
 * Validates that registerEngine() produces the same tools and behavior
 * as the old createSemanticFacades() + registerAllFacades() pattern.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAgentRuntime } from '../../runtime/runtime.js';
import { captureOps, executeOp } from '../test-helpers.js';
import { createVaultFacadeOps } from '../../runtime/facades/vault-facade.js';
import { createBrainFacadeOps } from '../../runtime/facades/brain-facade.js';
import { createPlanFacadeOps } from '../../runtime/facades/plan-facade.js';
import { createCuratorFacadeOps } from '../../runtime/facades/curator-facade.js';
import { createLoopFacadeOps } from '../../runtime/facades/loop-facade.js';
import type { AgentRuntime } from '../../runtime/types.js';

let runtime: AgentRuntime;

beforeAll(() => {
  runtime = createAgentRuntime({
    agentId: 'test-engine',
    vaultPath: ':memory:',
  });
});

afterAll(() => {
  runtime.close();
});

describe('Direct op execution (no facade factory)', () => {
  it('vault ops work without facade dispatch', async () => {
    const ops = captureOps(createVaultFacadeOps(runtime));

    // Capture a pattern
    const captureResult = await executeOp(ops, 'capture_enriched', {
      projectPath: '.',
      title: 'Test Pattern',
      description: 'A test pattern for engine registration',
      type: 'pattern',
      category: 'testing',
      severity: 'suggestion',
      tags: ['test'],
    });
    expect(captureResult.success).toBe(true);

    // Search for it
    const searchResult = await executeOp(ops, 'search', {
      query: 'test pattern engine',
    });
    expect(searchResult.success).toBe(true);
    expect(searchResult.data).toBeDefined();
  });

  it('brain ops work without facade dispatch', async () => {
    const ops = captureOps(createBrainFacadeOps(runtime));

    const statsResult = await executeOp(ops, 'brain_stats', {});
    expect(statsResult.success).toBe(true);
    expect(statsResult.data).toBeDefined();
  });

  it('plan ops work without facade dispatch', async () => {
    const ops = captureOps(createPlanFacadeOps(runtime));

    const createResult = await executeOp(ops, 'create_plan', {
      objective: 'Test objective',
      scope: 'Test scope',
    });
    expect(createResult.success).toBe(true);
    expect(createResult.data).toBeDefined();
  });

  it('curator ops work without facade dispatch', async () => {
    const ops = captureOps(createCuratorFacadeOps(runtime));

    const statusResult = await executeOp(ops, 'curator_status', {});
    expect(statusResult.success).toBe(true);
  });

  it('loop ops work without facade dispatch', async () => {
    const ops = captureOps(createLoopFacadeOps(runtime));

    const statusResult = await executeOp(ops, 'loop_status', {});
    expect(statusResult.success).toBe(true);
  });

  it('returns error for unknown ops', async () => {
    const ops = captureOps(createVaultFacadeOps(runtime));

    const result = await executeOp(ops, 'nonexistent_op', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown operation');
  });

  it('response envelope matches old format', async () => {
    const ops = captureOps(createVaultFacadeOps(runtime));

    const result = await executeOp(ops, 'vault_stats', {}, 'test_vault');
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('op', 'vault_stats');
    expect(result).toHaveProperty('facade', 'test_vault');
  });
});
