import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrphanReaper } from '../../subagent/orphan-reaper.js';

describe('OrphanReaper', () => {
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    killSpy = vi.spyOn(process, 'kill');
  });

  afterEach(() => {
    killSpy.mockRestore();
  });

  it('register() tracks a process', () => {
    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');
    expect(reaper.isTracked(1234)).toBe(true);
    expect(reaper.listTracked()).toHaveLength(1);
    expect(reaper.listTracked()[0].taskId).toBe('task-1');
  });

  it('unregister() stops tracking a process', () => {
    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');
    reaper.unregister(1234);
    expect(reaper.isTracked(1234)).toBe(false);
    expect(reaper.listTracked()).toHaveLength(0);
  });

  it('reap() returns empty reaped when all processes are alive', () => {
    // process.kill(pid, 0) succeeds = process alive
    killSpy.mockImplementation(() => true);

    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');
    reaper.register(5678, 'task-2');

    const result = reaper.reap();
    expect(result.reaped).toHaveLength(0);
    expect(result.alive).toEqual(['task-1', 'task-2']);
    expect(reaper.listTracked()).toHaveLength(2);
  });

  it('reap() detects dead processes via ESRCH', () => {
    killSpy.mockImplementation((_pid: number, _signal?: number) => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');

    const result = reaper.reap();
    expect(result.reaped).toEqual(['task-1']);
    expect(result.alive).toHaveLength(0);
    // Dead process should be removed from tracking
    expect(reaper.isTracked(1234)).toBe(false);
  });

  it('reap() calls onOrphan callback for dead processes', () => {
    killSpy.mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const onOrphan = vi.fn();
    const reaper = new OrphanReaper(onOrphan);
    reaper.register(1234, 'task-1');

    reaper.reap();
    expect(onOrphan).toHaveBeenCalledWith('task-1', 1234);
  });

  it('reap() treats EPERM as alive (process exists but no permission)', () => {
    killSpy.mockImplementation(() => {
      const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });

    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');

    const result = reaper.reap();
    expect(result.reaped).toHaveLength(0);
    expect(result.alive).toEqual(['task-1']);
    expect(reaper.isTracked(1234)).toBe(true);
  });

  it('listTracked() returns all tracked processes', () => {
    const reaper = new OrphanReaper();
    reaper.register(100, 'task-a');
    reaper.register(200, 'task-b');
    reaper.register(300, 'task-c');

    const tracked = reaper.listTracked();
    expect(tracked).toHaveLength(3);
    expect(tracked.map((t) => t.pid).sort()).toEqual([100, 200, 300]);
  });

  it('isTracked() returns correct boolean', () => {
    const reaper = new OrphanReaper();
    expect(reaper.isTracked(999)).toBe(false);
    reaper.register(999, 'task-x');
    expect(reaper.isTracked(999)).toBe(true);
  });

  it('clear() removes all tracked processes', () => {
    const reaper = new OrphanReaper();
    reaper.register(100, 'task-a');
    reaper.register(200, 'task-b');

    reaper.clear();
    expect(reaper.listTracked()).toHaveLength(0);
    expect(reaper.isTracked(100)).toBe(false);
    expect(reaper.isTracked(200)).toBe(false);
  });

  it('reap() handles mixed alive and dead processes', () => {
    killSpy.mockImplementation((pid: number, _signal?: number) => {
      if (pid === 1234) {
        return true; // alive
      }
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });

    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-alive');
    reaper.register(5678, 'task-dead');

    const result = reaper.reap();
    expect(result.reaped).toEqual(['task-dead']);
    expect(result.alive).toEqual(['task-alive']);
    expect(reaper.isTracked(1234)).toBe(true);
    expect(reaper.isTracked(5678)).toBe(false);
  });
});
