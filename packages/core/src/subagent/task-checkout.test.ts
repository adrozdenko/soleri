import { describe, it, expect, beforeEach } from 'vitest';
import { TaskCheckout } from './task-checkout.js';

describe('TaskCheckout', () => {
  let checkout: TaskCheckout;

  beforeEach(() => {
    checkout = new TaskCheckout();
  });

  describe('claim', () => {
    it('returns true for a new claim', () => {
      expect(checkout.claim('task-1', 'agent-a')).toBe(true);
    });

    it('returns true when the same claimer reclaims', () => {
      checkout.claim('task-1', 'agent-a');
      expect(checkout.claim('task-1', 'agent-a')).toBe(true);
    });

    it('returns false when a different claimer tries to claim', () => {
      checkout.claim('task-1', 'agent-a');
      expect(checkout.claim('task-1', 'agent-b')).toBe(false);
    });

    it('allows different tasks to be claimed by different claimers', () => {
      expect(checkout.claim('task-1', 'agent-a')).toBe(true);
      expect(checkout.claim('task-2', 'agent-b')).toBe(true);
    });
  });

  describe('release', () => {
    it('returns true when releasing a claimed task', () => {
      checkout.claim('task-1', 'agent-a');
      expect(checkout.release('task-1')).toBe(true);
    });

    it('returns false when releasing an unclaimed task', () => {
      expect(checkout.release('task-1')).toBe(false);
    });

    it('makes task available again after release', () => {
      checkout.claim('task-1', 'agent-a');
      checkout.release('task-1');
      expect(checkout.claim('task-1', 'agent-b')).toBe(true);
    });
  });

  describe('getClaimer', () => {
    it('returns claim info for a claimed task', () => {
      checkout.claim('task-1', 'agent-a');
      const info = checkout.getClaimer('task-1');
      expect(info).toBeDefined();
      expect(info!.taskId).toBe('task-1');
      expect(info!.claimerId).toBe('agent-a');
      expect(info!.claimedAt).toBeGreaterThan(0);
    });

    it('returns undefined for an unclaimed task', () => {
      expect(checkout.getClaimer('task-1')).toBeUndefined();
    });
  });

  describe('listClaimed', () => {
    it('returns empty array when nothing is claimed', () => {
      expect(checkout.listClaimed()).toEqual([]);
    });

    it('returns all active claims', () => {
      checkout.claim('task-1', 'agent-a');
      checkout.claim('task-2', 'agent-b');
      const claimed = checkout.listClaimed();
      expect(claimed).toHaveLength(2);
      expect(claimed.map((c) => c.taskId).sort()).toEqual(['task-1', 'task-2']);
    });
  });

  describe('isAvailable', () => {
    it('returns true for unclaimed tasks', () => {
      expect(checkout.isAvailable('task-1')).toBe(true);
    });

    it('returns false for claimed tasks', () => {
      checkout.claim('task-1', 'agent-a');
      expect(checkout.isAvailable('task-1')).toBe(false);
    });

    it('returns true after release', () => {
      checkout.claim('task-1', 'agent-a');
      checkout.release('task-1');
      expect(checkout.isAvailable('task-1')).toBe(true);
    });
  });

  describe('releaseAll', () => {
    it('clears all claims', () => {
      checkout.claim('task-1', 'agent-a');
      checkout.claim('task-2', 'agent-b');
      checkout.releaseAll();
      expect(checkout.listClaimed()).toEqual([]);
      expect(checkout.isAvailable('task-1')).toBe(true);
      expect(checkout.isAvailable('task-2')).toBe(true);
    });

    it('is a no-op when nothing is claimed', () => {
      checkout.releaseAll(); // should not throw
      expect(checkout.listClaimed()).toEqual([]);
    });
  });
});
