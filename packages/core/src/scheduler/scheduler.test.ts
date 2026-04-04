/**
 * Unit tests for the cross-platform task scheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler, InMemorySchedulerStore } from './scheduler.js';
import { validateCron, estimateMinIntervalHours } from './cron-validator.js';
import type { PlatformAdapter, ScheduledTask } from './types.js';

// ---------------------------------------------------------------------------
// Stub adapter — no OS calls
// ---------------------------------------------------------------------------

function makeStubAdapter(): PlatformAdapter {
  const registry = new Set<string>();
  return {
    create: vi.fn(async (task: ScheduledTask) => {
      const id = `stub-${task.name}`;
      registry.add(id);
      return id;
    }),
    remove: vi.fn(async (platformId: string) => {
      registry.delete(platformId);
    }),
    exists: vi.fn(async (platformId: string) => registry.has(platformId)),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
  };
}

// ---------------------------------------------------------------------------
// cron-validator
// ---------------------------------------------------------------------------

describe('validateCron', () => {
  it('accepts valid 5-field cron', () => {
    expect(validateCron('0 2 * * *')).toBeNull();
    expect(validateCron('30 9 * * 1')).toBeNull();
    expect(validateCron('0 2,4,6 * * *')).toBeNull();
    expect(validateCron('0 */6 * * *')).toBeNull();
  });

  it('rejects wildcard minute field', () => {
    expect(validateCron('* 2 * * *')).toContain('Minute field');
    expect(validateCron('*/1 2 * * *')).toContain('Minute field');
  });

  it('rejects wrong field count', () => {
    expect(validateCron('0 2 *')).toContain('5 fields');
    expect(validateCron('0 2 * * * *')).toContain('5 fields');
  });
});

describe('estimateMinIntervalHours', () => {
  it('returns 24 for daily schedule', () => {
    expect(estimateMinIntervalHours('0 2 * * *')).toBe(24);
  });

  it('returns 6 for */6 hours', () => {
    expect(estimateMinIntervalHours('0 */6 * * *')).toBe(6);
  });

  it('returns 2 for comma-separated hours 2,4,6', () => {
    expect(estimateMinIntervalHours('0 2,4,6 * * *')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

describe('Scheduler', () => {
  let adapter: PlatformAdapter;
  let store: InMemorySchedulerStore;
  let scheduler: Scheduler;

  beforeEach(() => {
    adapter = makeStubAdapter();
    store = new InMemorySchedulerStore();
    scheduler = new Scheduler(adapter, store);
  });

  describe('create', () => {
    it('creates a task and stores it', async () => {
      const result = await scheduler.create({
        name: 'nightly-dream',
        cronExpression: '0 2 * * *',
        prompt: 'run dream',
        projectPath: '/tmp/agent',
      });

      expect('error' in result).toBe(false);
      if ('error' in result) return;

      expect(result.id).toMatch(/^sched-/);
      expect(result.name).toBe('nightly-dream');
      expect(result.enabled).toBe(true);
      expect(result.platformId).toBe('stub-nightly-dream');
      expect(adapter.create).toHaveBeenCalledOnce();
    });

    it('rejects invalid cron expression', async () => {
      const result = await scheduler.create({
        name: 'bad-cron',
        cronExpression: '* * * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('Minute field');
    });

    it('rejects duplicate name', async () => {
      await scheduler.create({
        name: 'task-a',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      const result = await scheduler.create({
        name: 'task-a',
        cronExpression: '0 4 * * *',
        prompt: 'run again',
        projectPath: '/tmp/agent',
      });

      expect((result as { error: string }).error).toContain('already exists');
    });

    it('enforces max 10 tasks limit', async () => {
      for (let i = 0; i < 10; i++) {
        await scheduler.create({
          name: `task-${i}`,
          cronExpression: '0 2 * * *',
          prompt: 'run',
          projectPath: '/tmp/agent',
        });
      }

      const result = await scheduler.create({
        name: 'task-overflow',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      expect((result as { error: string }).error).toContain('Maximum');
    });
  });

  describe('list', () => {
    it('returns empty list when no tasks exist', async () => {
      const result = await scheduler.list();
      expect(result).toHaveLength(0);
    });

    it('lists tasks with platform sync status', async () => {
      await scheduler.create({
        name: 'task-1',
        cronExpression: '0 3 * * *',
        prompt: 'vault-curate',
        projectPath: '/tmp/agent',
      });

      const result = await scheduler.list();
      expect(result).toHaveLength(1);
      expect(result[0].platformSynced).toBe(true);
      expect(result[0].name).toBe('task-1');
    });
  });

  describe('delete', () => {
    it('deletes an existing task', async () => {
      const created = await scheduler.create({
        name: 'to-delete',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      if ('error' in created) throw new Error('Create failed');

      const result = await scheduler.delete(created.id);
      expect(result.deleted).toBe(true);
      expect(adapter.remove).toHaveBeenCalledOnce();

      const tasks = await scheduler.list();
      expect(tasks).toHaveLength(0);
    });

    it('returns error for unknown id', async () => {
      const result = await scheduler.delete('nonexistent');
      expect(result.deleted).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('pause / resume', () => {
    it('pauses an enabled task', async () => {
      const created = await scheduler.create({
        name: 'pauseable',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      if ('error' in created) throw new Error('Create failed');

      const result = await scheduler.pause(created.id);
      expect(result.paused).toBe(true);
      expect(adapter.pause).toHaveBeenCalledOnce();
    });

    it('resumes a paused task', async () => {
      const created = await scheduler.create({
        name: 'resumeable',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      if ('error' in created) throw new Error('Create failed');
      await scheduler.pause(created.id);

      const result = await scheduler.resume(created.id);
      expect(result.resumed).toBe(true);
      expect(adapter.resume).toHaveBeenCalledOnce();
    });

    it('returns error when pausing already-paused task', async () => {
      const created = await scheduler.create({
        name: 'double-pause',
        cronExpression: '0 2 * * *',
        prompt: 'run',
        projectPath: '/tmp/agent',
      });

      if ('error' in created) throw new Error('Create failed');
      await scheduler.pause(created.id);
      const result = await scheduler.pause(created.id);
      expect(result.paused).toBe(false);
      expect(result.error).toContain('already paused');
    });
  });
});
