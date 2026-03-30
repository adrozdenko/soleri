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

  it('reap() returns empty when all processes are alive', () => {
    // process.kill(pid, 0) succeeds = process alive
    killSpy.mockImplementation(() => true);

    const reaper = new OrphanReaper();
    reaper.register(1234, 'task-1');
    reaper.register(5678, 'task-2');

    const reaped = reaper.reap();
    expect(reaped).toHaveLength(0);
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

    const reaped = reaper.reap();
    expect(reaped).toHaveLength(1);
    expect(reaped[0].taskId).toBe('task-1');
    expect(reaped[0].pid).toBe(1234);
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

    const reaped = reaper.reap();
    expect(reaped).toHaveLength(0);
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

    const reaped = reaper.reap();
    expect(reaped).toHaveLength(1);
    expect(reaped[0].taskId).toBe('task-dead');
    expect(reaper.isTracked(1234)).toBe(true);
    expect(reaper.isTracked(5678)).toBe(false);
  });

  // ── isAlive (public) ──────────────────────────────────────────────

  it('isAlive() returns true when process.kill(pid, 0) succeeds', () => {
    killSpy.mockImplementation(() => true);
    const reaper = new OrphanReaper();
    expect(reaper.isAlive(1234)).toBe(true);
  });

  it('isAlive() returns true for EPERM (process exists, no permission)', () => {
    killSpy.mockImplementation(() => {
      const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      throw err;
    });
    const reaper = new OrphanReaper();
    expect(reaper.isAlive(1234)).toBe(true);
  });

  it('isAlive() returns false for ESRCH (process dead)', () => {
    killSpy.mockImplementation(() => {
      const err = new Error('No such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });
    const reaper = new OrphanReaper();
    expect(reaper.isAlive(1234)).toBe(false);
  });

  // ── killProcess ───────────────────────────────────────────────────

  describe('killProcess', () => {
    it('returns killed=true with SIGTERM when process is already dead', async () => {
      killSpy.mockImplementation(() => {
        const err = new Error('No such process') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      });

      const reaper = new OrphanReaper();
      const result = await reaper.killProcess(9999);
      expect(result.killed).toBe(true);
      expect(result.signal).toBe('SIGTERM');
    });

    it('sends SIGTERM and returns killed=true when process dies from SIGTERM', async () => {
      let termSent = false;
      killSpy.mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          // isAlive check: alive before SIGTERM, dead after
          if (termSent) {
            const err = new Error('No such process') as NodeJS.ErrnoException;
            err.code = 'ESRCH';
            throw err;
          }
          return true;
        }
        if (signal === 'SIGTERM') {
          termSent = true;
          return true;
        }
        return true;
      });

      const reaper = new OrphanReaper();
      // Use escalate=false to avoid the 5s wait
      const result = await reaper.killProcess(1234, false);
      expect(result.killed).toBe(true);
      expect(result.signal).toBe('SIGTERM');
    });

    it('escalates to SIGKILL when SIGTERM does not kill within grace period', async () => {
      vi.useFakeTimers();

      let sigkillSent = false;
      killSpy.mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          // Process stays alive until SIGKILL
          if (sigkillSent) {
            const err = new Error('No such process') as NodeJS.ErrnoException;
            err.code = 'ESRCH';
            throw err;
          }
          return true;
        }
        if (signal === 'SIGTERM') return true;
        if (signal === 'SIGKILL') {
          sigkillSent = true;
          return true;
        }
        return true;
      });

      const reaper = new OrphanReaper();
      const promise = reaper.killProcess(1234, true);

      // Advance past the 5s grace period
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await promise;
      expect(result.killed).toBe(true);
      expect(result.signal).toBe('SIGKILL');

      vi.useRealTimers();
    });

    it('handles SIGTERM throwing (process dies between check and signal)', async () => {
      let firstCheck = true;
      killSpy.mockImplementation((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          if (firstCheck) {
            firstCheck = false;
            return true; // alive on first check
          }
          // Dead after
          const err = new Error('No such process') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        if (signal === 'SIGTERM') {
          // Process died between isAlive check and SIGTERM send
          const err = new Error('No such process') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return true;
      });

      const reaper = new OrphanReaper();
      const result = await reaper.killProcess(1234, false);
      // Process is dead, so killed=true
      expect(result.killed).toBe(true);
      expect(result.signal).toBe('SIGTERM');
    });
  });
});
