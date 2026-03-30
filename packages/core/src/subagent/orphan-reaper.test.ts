import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrphanReaper } from './orphan-reaper.js';

describe('OrphanReaper', () => {
  describe('killProcessGroup', () => {
    let reaper: OrphanReaper;
    let killSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      reaper = new OrphanReaper();
      killSpy = vi.spyOn(process, 'kill');
    });

    afterEach(() => {
      killSpy.mockRestore();
    });

    it('kills the entire process group with -pid', () => {
      killSpy.mockImplementation(() => true);

      const result = reaper.killProcessGroup(1234);

      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGTERM');
      expect(result).toEqual({ killed: true, method: 'group' });
    });

    it('accepts a custom signal', () => {
      killSpy.mockImplementation(() => true);

      const result = reaper.killProcessGroup(1234, 'SIGKILL');

      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGKILL');
      expect(result).toEqual({ killed: true, method: 'group' });
    });

    it('falls back to single-process kill when group ESRCH', () => {
      killSpy.mockImplementation((pid: number) => {
        if (pid < 0) {
          const err = new Error('No such process') as NodeJS.ErrnoException;
          err.code = 'ESRCH';
          throw err;
        }
        return true;
      });

      const result = reaper.killProcessGroup(1234);

      expect(killSpy).toHaveBeenCalledWith(-1234, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
      expect(result).toEqual({ killed: true, method: 'single' });
    });

    it('returns killed:false when both group and single fail', () => {
      killSpy.mockImplementation(() => {
        const err = new Error('No such process') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      });

      const result = reaper.killProcessGroup(1234);

      expect(result).toEqual({ killed: false, method: 'single' });
    });

    it('returns killed:false on EPERM for group kill', () => {
      killSpy.mockImplementation(() => {
        const err = new Error('Operation not permitted') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      });

      const result = reaper.killProcessGroup(1234);

      expect(result).toEqual({ killed: false, method: 'group' });
    });
  });

  describe('killAll', () => {
    let reaper: OrphanReaper;
    let killSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      reaper = new OrphanReaper();
      killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    });

    afterEach(() => {
      killSpy.mockRestore();
    });

    it('kills all tracked processes and clears tracking', () => {
      reaper.register(100, 'task-a');
      reaper.register(200, 'task-b');

      const results = reaper.killAll();

      expect(results.size).toBe(2);
      expect(results.get(100)).toEqual({ killed: true, method: 'group' });
      expect(results.get(200)).toEqual({ killed: true, method: 'group' });
      // Tracking is cleared
      expect(reaper.listTracked()).toEqual([]);
    });

    it('returns empty map when nothing is tracked', () => {
      const results = reaper.killAll();
      expect(results.size).toBe(0);
    });

    it('uses custom signal for all kills', () => {
      reaper.register(100, 'task-a');

      reaper.killAll('SIGKILL');

      expect(killSpy).toHaveBeenCalledWith(-100, 'SIGKILL');
    });

    it('handles mixed success/failure', () => {
      reaper.register(100, 'task-a');
      reaper.register(200, 'task-b');

      killSpy.mockImplementation((pid: number) => {
        // PID 100 group kill works, PID 200 is already dead
        if (pid === -100) return true;
        const err = new Error('No such process') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      });

      const results = reaper.killAll();

      expect(results.get(100)).toEqual({ killed: true, method: 'group' });
      expect(results.get(200)).toEqual({ killed: false, method: 'single' });
    });
  });
});
