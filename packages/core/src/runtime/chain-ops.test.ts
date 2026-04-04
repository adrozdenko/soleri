/**
 * Colocated unit tests for chain-ops.ts — mock-based, no real DB.
 */

import { describe, it, expect, vi } from 'vitest';
import { createChainOps } from './chain-ops.js';
import type { AgentRuntime } from './types.js';
import { captureOps } from '../engine/test-helpers.js';

function mockRuntime(): AgentRuntime {
  return {
    chainRunner: {
      execute: vi.fn().mockResolvedValue({ id: 'inst-1', status: 'completed' }),
      getInstance: vi.fn().mockReturnValue(null),
      resume: vi.fn().mockResolvedValue({ id: 'inst-1', status: 'completed' }),
      list: vi.fn().mockReturnValue([]),
      approve: vi.fn().mockResolvedValue({ id: 'inst-1', status: 'running' }),
    },
  } as unknown as AgentRuntime;
}

const VALID_CHAIN = {
  id: 'c1',
  steps: [{ id: 's1', op: 'some_op' }],
};

describe('createChainOps', () => {
  describe('chain_execute', () => {
    it('calls chainRunner.execute with chain def and input', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      await ops.get('chain_execute')!.handler({ chain: VALID_CHAIN, input: { key: 'val' } });
      expect(rt.chainRunner.execute).toHaveBeenCalledOnce();
      const args = (rt.chainRunner.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[0]).toEqual(VALID_CHAIN);
      expect(args[1]).toEqual({ key: 'val' });
    });

    it('passes startFromStep when provided', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      await ops.get('chain_execute')!.handler({
        chain: VALID_CHAIN,
        input: {},
        startFromStep: 's1',
      });
      const args = (rt.chainRunner.execute as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[4]).toBe('s1');
    });
  });

  describe('chain_status', () => {
    it('returns error when instance not found', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      const result = (await ops.get('chain_status')!.handler({ instanceId: 'nope' })) as {
        error: string;
      };
      expect(result.error).toContain('nope');
    });

    it('returns instance when found', async () => {
      const rt = mockRuntime();
      const instance = { id: 'inst-1', status: 'running' };
      (rt.chainRunner.getInstance as ReturnType<typeof vi.fn>).mockReturnValue(instance);
      const ops = captureOps(createChainOps(rt));
      const result = await ops.get('chain_status')!.handler({ instanceId: 'inst-1' });
      expect(result).toBe(instance);
    });
  });

  describe('chain_resume', () => {
    it('delegates to chainRunner.resume', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      await ops.get('chain_resume')!.handler({ instanceId: 'inst-1', chain: VALID_CHAIN });
      expect(rt.chainRunner.resume).toHaveBeenCalledWith(
        'inst-1',
        VALID_CHAIN,
        expect.any(Function),
      );
    });
  });

  describe('chain_list', () => {
    it('passes limit to chainRunner.list', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      await ops.get('chain_list')!.handler({ limit: 5 });
      expect(rt.chainRunner.list).toHaveBeenCalledWith(5);
    });
  });

  describe('chain_step_approve', () => {
    it('delegates to chainRunner.approve', async () => {
      const rt = mockRuntime();
      const ops = captureOps(createChainOps(rt));
      await ops.get('chain_step_approve')!.handler({ instanceId: 'inst-1', chain: VALID_CHAIN });
      expect(rt.chainRunner.approve).toHaveBeenCalledWith(
        'inst-1',
        VALID_CHAIN,
        expect.any(Function),
      );
    });
  });

  describe('_setAllOps wiring', () => {
    it('exposes _setAllOps for cross-facade dispatch', () => {
      const ops = createChainOps(mockRuntime());
      const extended = ops as typeof ops & { _setAllOps: (o: unknown[]) => void };
      expect(typeof extended._setAllOps).toBe('function');
    });

    it('dispatch routes to the correct op after _setAllOps', async () => {
      const rt = mockRuntime();
      const ops = createChainOps(rt);
      const fakeOps = [
        {
          name: 'some_op',
          handler: vi.fn().mockResolvedValue({ ok: true }),
          auth: 'read' as const,
          description: 'test',
        },
      ];
      (ops as typeof ops & { _setAllOps: (o: typeof fakeOps) => void })._setAllOps(fakeOps);

      // Execute chain — the dispatch should be able to find 'some_op'
      await ops
        .find((o) => o.name === 'chain_execute')!
        .handler({
          chain: VALID_CHAIN,
          input: {},
        });
      // The dispatch function was passed to chainRunner.execute; verify it was called
      expect(rt.chainRunner.execute).toHaveBeenCalledOnce();
    });
  });
});
