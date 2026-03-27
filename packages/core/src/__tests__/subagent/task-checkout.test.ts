import { describe, it, expect, beforeEach } from 'vitest';
import { TaskCheckout } from '../../subagent/task-checkout.js';

describe('TaskCheckout', () => {
  let checkout: TaskCheckout;

  beforeEach(() => {
    checkout = new TaskCheckout();
  });

  it('claim() returns true for an unclaimed task', () => {
    expect(checkout.claim('task-1', 'agent-a')).toBe(true);
  });

  it('claim() returns false when a different claimer tries the same task', () => {
    checkout.claim('task-1', 'agent-a');
    expect(checkout.claim('task-1', 'agent-b')).toBe(false);
  });

  it('claim() returns true for the same claimer (idempotent)', () => {
    checkout.claim('task-1', 'agent-a');
    expect(checkout.claim('task-1', 'agent-a')).toBe(true);
  });

  it('claim() stores claimerId and taskId in ClaimInfo', () => {
    checkout.claim('task-1', 'agent-a');
    const info = checkout.getClaimer('task-1');
    expect(info).toBeDefined();
    expect(info!.taskId).toBe('task-1');
    expect(info!.claimerId).toBe('agent-a');
    expect(info!.claimedAt).toBeGreaterThan(0);
  });

  it('release() returns true for a claimed task', () => {
    checkout.claim('task-1', 'agent-a');
    expect(checkout.release('task-1')).toBe(true);
  });

  it('release() returns false for an unclaimed task', () => {
    expect(checkout.release('task-1')).toBe(false);
  });

  it('getClaimer() returns ClaimInfo for a claimed task', () => {
    checkout.claim('task-1', 'agent-a');
    const info = checkout.getClaimer('task-1');
    expect(info).toBeDefined();
    expect(info!.claimerId).toBe('agent-a');
  });

  it('getClaimer() returns undefined for an unclaimed task', () => {
    expect(checkout.getClaimer('task-1')).toBeUndefined();
  });

  it('isAvailable() returns true for an unclaimed task', () => {
    expect(checkout.isAvailable('task-1')).toBe(true);
  });

  it('isAvailable() returns false for a claimed task', () => {
    checkout.claim('task-1', 'agent-a');
    expect(checkout.isAvailable('task-1')).toBe(false);
  });

  it('listClaimed() returns all active claims', () => {
    checkout.claim('task-1', 'agent-a');
    checkout.claim('task-2', 'agent-b');
    const claims = checkout.listClaimed();
    expect(claims).toHaveLength(2);
    expect(claims.map((c) => c.taskId).sort()).toEqual(['task-1', 'task-2']);
  });

  it('releaseAll() clears all claims', () => {
    checkout.claim('task-1', 'agent-a');
    checkout.claim('task-2', 'agent-b');
    checkout.releaseAll();
    expect(checkout.listClaimed()).toHaveLength(0);
    expect(checkout.isAvailable('task-1')).toBe(true);
    expect(checkout.isAvailable('task-2')).toBe(true);
  });

  it('release() makes the task available for a new claimer', () => {
    checkout.claim('task-1', 'agent-a');
    checkout.release('task-1');
    expect(checkout.claim('task-1', 'agent-b')).toBe(true);
    expect(checkout.getClaimer('task-1')!.claimerId).toBe('agent-b');
  });
});
