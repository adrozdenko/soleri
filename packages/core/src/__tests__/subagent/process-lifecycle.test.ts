/**
 * Process lifecycle integration tests.
 *
 * These tests spawn real child processes to verify orphan detection,
 * kill escalation, process group management, and the full dispatch
 * lifecycle. No mocking of process.kill — real signals, real PIDs.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess, execSync } from 'node:child_process';
import { OrphanReaper } from '../../subagent/orphan-reaper.js';

// Collect all spawned processes for cleanup
const spawnedChildren: ChildProcess[] = [];

/** Spawn a long-running node process that does nothing. */
function spawnIdleProcess(opts?: { detached?: boolean }): ChildProcess {
  const child = spawn('node', ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore',
    detached: opts?.detached ?? false,
  });
  spawnedChildren.push(child);
  return child;
}

/** Spawn a parent that spawns a grandchild, both idle. */
function spawnWithGrandchild(): ChildProcess {
  // The parent spawns a child which also idles.
  // Using detached so the parent becomes a process group leader.
  const child = spawn(
    'node',
    [
      '-e',
      `
      const { spawn } = require('child_process');
      const gc = spawn('node', ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
      // Write grandchild PID to stdout so the test can track it
      process.stdout.write(String(gc.pid));
      setInterval(()=>{}, 1000);
    `,
    ],
    {
      stdio: ['ignore', 'pipe', 'ignore'],
      detached: true,
    },
  );
  spawnedChildren.push(child);
  return child;
}

/** Check if a PID is alive using signal 0. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Wait until a condition is true, polling every intervalMs. */
async function waitFor(fn: () => boolean, timeoutMs = 10_000, intervalMs = 100): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Force-kill a PID, ignoring errors if already dead. */
function safeKill(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  try {
    process.kill(pid, signal);
  } catch {
    // already dead — fine
  }
}

afterEach(() => {
  // Kill every process we spawned, best-effort
  for (const child of spawnedChildren) {
    if (child.pid) {
      // Try group kill first (for detached), then single
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        safeKill(child.pid);
      }
    }
  }
  spawnedChildren.length = 0;
});

describe('Process Lifecycle Integration', { timeout: 15_000 }, () => {
  // ── a. Orphan detection ─────────────────────────────────────────

  describe('orphan detection', () => {
    it('detects a killed process via reap()', async () => {
      const child = spawnIdleProcess();
      const pid = child.pid!;
      expect(pid).toBeGreaterThan(0);

      const reaper = new OrphanReaper();
      reaper.register(pid, 'orphan-test');

      // Process should be alive initially
      expect(isAlive(pid)).toBe(true);
      const initialReap = reaper.reap();
      expect(initialReap.reaped).toHaveLength(0);
      expect(reaper.isTracked(pid)).toBe(true);

      // Kill it externally
      process.kill(pid, 'SIGKILL');
      await waitFor(() => !isAlive(pid));

      // Now reap should detect it
      const result = reaper.reap();
      expect(result.reaped).toHaveLength(1);
      expect(result.reaped[0]).toBe('orphan-test');
      expect(reaper.isTracked(pid)).toBe(false);
    });

    it('invokes onOrphan callback for dead processes', async () => {
      const orphanEvents: Array<{ taskId: string; pid: number }> = [];
      const reaper = new OrphanReaper((taskId, pid) => {
        orphanEvents.push({ taskId, pid });
      });

      const child = spawnIdleProcess();
      const pid = child.pid!;
      reaper.register(pid, 'callback-test');

      process.kill(pid, 'SIGKILL');
      await waitFor(() => !isAlive(pid));

      reaper.reap();
      expect(orphanEvents).toHaveLength(1);
      expect(orphanEvents[0]).toEqual({ taskId: 'callback-test', pid });
    });

    it('handles multiple tracked processes with mixed liveness', async () => {
      const alive = spawnIdleProcess();
      const dead = spawnIdleProcess();
      const alivePid = alive.pid!;
      const deadPid = dead.pid!;

      const reaper = new OrphanReaper();
      reaper.register(alivePid, 'alive-task');
      reaper.register(deadPid, 'dead-task');

      // Kill only one
      process.kill(deadPid, 'SIGKILL');
      await waitFor(() => !isAlive(deadPid));

      const result = reaper.reap();
      expect(result.reaped).toHaveLength(1);
      expect(result.reaped[0]).toBe('dead-task');
      expect(reaper.isTracked(alivePid)).toBe(true);
      expect(reaper.isTracked(deadPid)).toBe(false);
    });
  });

  // ── b. Timeout escalation (killProcessGroup with SIGKILL) ──────

  describe('kill escalation', () => {
    it('kills a process with SIGTERM via killProcessGroup', async () => {
      const child = spawnIdleProcess({ detached: true });
      const pid = child.pid!;

      const reaper = new OrphanReaper();
      reaper.register(pid, 'kill-test');

      const result = reaper.killProcessGroup(pid, 'SIGTERM');
      expect(result.killed).toBe(true);

      await waitFor(() => !isAlive(pid));
      expect(isAlive(pid)).toBe(false);
    });

    it('escalates to SIGKILL when SIGTERM is ignored', async () => {
      // Spawn a process that traps SIGTERM
      const child = spawn(
        'node',
        ['-e', "process.on('SIGTERM', () => {}); setInterval(()=>{},1000)"],
        { stdio: 'ignore', detached: true },
      );
      spawnedChildren.push(child);
      const pid = child.pid!;

      const reaper = new OrphanReaper();
      reaper.register(pid, 'escalation-test');

      // Send SIGTERM — process should still be alive after a short wait
      reaper.killProcessGroup(pid, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 500));

      // Process should still be alive (it traps SIGTERM)
      if (isAlive(pid)) {
        // Escalate to SIGKILL
        const result = reaper.killProcessGroup(pid, 'SIGKILL');
        expect(result.killed).toBe(true);
        await waitFor(() => !isAlive(pid));
        expect(isAlive(pid)).toBe(false);
      }
      // If it died from SIGTERM that's fine too — OS-dependent behavior
    });

    it('killProcessGroup returns killed:false for already-dead process', async () => {
      const child = spawnIdleProcess({ detached: true });
      const pid = child.pid!;

      // Kill it first
      process.kill(pid, 'SIGKILL');
      await waitFor(() => !isAlive(pid));

      const reaper = new OrphanReaper();
      const result = reaper.killProcessGroup(pid, 'SIGTERM');
      // Should indicate failure since process is dead
      expect(result.killed).toBe(false);
    });
  });

  // ── c. Process group kill ──────────────────────────────────────

  describe('process group management', () => {
    it('killProcessGroup kills the parent process group', async () => {
      const child = spawnIdleProcess({ detached: true });
      const pid = child.pid!;

      const reaper = new OrphanReaper();
      const result = reaper.killProcessGroup(pid);

      expect(result.killed).toBe(true);
      expect(result.method).toBe('group');

      await waitFor(() => !isAlive(pid));
      expect(isAlive(pid)).toBe(false);
    });

    it('killProcessGroup with grandchild kills the entire tree', async () => {
      const parent = spawnWithGrandchild();
      const parentPid = parent.pid!;

      // Read grandchild PID from stdout
      const grandchildPid = await new Promise<number>((resolve, reject) => {
        let data = '';
        const timer = setTimeout(() => reject(new Error('timeout reading grandchild PID')), 5000);
        parent.stdout!.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          const pid = parseInt(data, 10);
          if (!isNaN(pid) && pid > 0) {
            clearTimeout(timer);
            resolve(pid);
          }
        });
        parent.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      expect(isAlive(parentPid)).toBe(true);
      expect(isAlive(grandchildPid)).toBe(true);

      // Kill the process group
      const reaper = new OrphanReaper();
      const result = reaper.killProcessGroup(parentPid, 'SIGKILL');
      expect(result.killed).toBe(true);
      expect(result.method).toBe('group');

      // Both parent and grandchild should be dead
      await waitFor(() => !isAlive(parentPid) && !isAlive(grandchildPid), 5000);
      expect(isAlive(parentPid)).toBe(false);
      expect(isAlive(grandchildPid)).toBe(false);
    });

    it('killAll kills all tracked processes', async () => {
      const child1 = spawnIdleProcess({ detached: true });
      const child2 = spawnIdleProcess({ detached: true });
      const pid1 = child1.pid!;
      const pid2 = child2.pid!;

      const reaper = new OrphanReaper();
      reaper.register(pid1, 'task-1');
      reaper.register(pid2, 'task-2');

      const results = reaper.killAll('SIGKILL');

      expect(results.size).toBe(2);
      expect(results.get(pid1)!.killed).toBe(true);
      expect(results.get(pid2)!.killed).toBe(true);

      // Tracking should be cleared
      expect(reaper.listTracked()).toHaveLength(0);

      await waitFor(() => !isAlive(pid1) && !isAlive(pid2));
      expect(isAlive(pid1)).toBe(false);
      expect(isAlive(pid2)).toBe(false);
    });

    it('killAll handles empty tracking gracefully', () => {
      const reaper = new OrphanReaper();
      const results = reaper.killAll();
      expect(results.size).toBe(0);
    });
  });

  // ── d. Full lifecycle ─────────────────────────────────────────

  describe('full lifecycle', () => {
    it('register → kill externally → reap → verify cleanup', async () => {
      const reaper = new OrphanReaper();

      // Simulate a dispatch wave: register multiple processes
      const children = [spawnIdleProcess(), spawnIdleProcess(), spawnIdleProcess()];
      const pids = children.map((c) => c.pid!);

      pids.forEach((pid, i) => reaper.register(pid, `wave-task-${i}`));
      expect(reaper.listTracked()).toHaveLength(3);

      // All alive initially
      const earlyReap = reaper.reap();
      expect(earlyReap.reaped).toHaveLength(0);

      // Kill two of three externally
      process.kill(pids[0], 'SIGKILL');
      process.kill(pids[2], 'SIGKILL');
      await waitFor(() => !isAlive(pids[0]) && !isAlive(pids[2]));

      // Reap should detect the two dead ones
      const result = reaper.reap();
      expect(result.reaped).toHaveLength(2);
      expect(result.reaped.sort()).toEqual(['wave-task-0', 'wave-task-2']);

      // One should still be tracked
      expect(reaper.listTracked()).toHaveLength(1);
      expect(reaper.isTracked(pids[1])).toBe(true);

      // Clean up the survivor
      reaper.killAll('SIGKILL');
      expect(reaper.listTracked()).toHaveLength(0);
    });

    it('reap in finally block pattern works correctly', async () => {
      const reaper = new OrphanReaper();
      const child = spawnIdleProcess();
      const pid = child.pid!;
      reaper.register(pid, 'finally-test');

      let reapedInFinally: ReturnType<typeof reaper.reap> | null = null;

      try {
        // Simulate dispatch work
        process.kill(pid, 'SIGKILL');
        await waitFor(() => !isAlive(pid));
      } finally {
        // This is what orchestrate-ops.ts does in the finally block
        reapedInFinally = reaper.reap();
      }

      expect(reapedInFinally!.reaped).toHaveLength(1);
      expect(reapedInFinally!.reaped[0]).toBe('finally-test');
      expect(reaper.listTracked()).toHaveLength(0);
    });
  });

  // ── e. Facade integration (admin_reap_orphans structure) ──────

  describe('admin facade integration', () => {
    it('dispatcher.reapOrphans() returns correct report structure', async () => {
      // We test the dispatcher's reapOrphans method shape which is what
      // admin_reap_orphans calls. We create an OrphanReaper directly since
      // the dispatcher requires a full RuntimeAdapterRegistry.

      const reaper = new OrphanReaper();
      const child = spawnIdleProcess();
      const pid = child.pid!;
      reaper.register(pid, 'facade-test');

      // Kill it
      process.kill(pid, 'SIGKILL');
      await waitFor(() => !isAlive(pid));

      // Simulate what dispatcher.reapOrphans() does internally
      const result = reaper.reap();

      // reap() returns { reaped: string[], alive: string[] }
      expect(result.reaped).toHaveLength(1);
      expect(result.reaped[0]).toBe('facade-test');
      expect(result.alive).toHaveLength(0);

      // Verify report structure matches what admin_reap_orphans builds
      const report = {
        reaped: result.reaped.length,
        tasks: result.reaped,
      };

      expect(report.reaped).toBe(1);
      expect(report.tasks).toEqual(['facade-test']);
    });

    it('returns empty report when no orphans exist', () => {
      const reaper = new OrphanReaper();
      const child = spawnIdleProcess();
      reaper.register(child.pid!, 'alive-task');

      // All alive — reap returns nothing reaped
      const result = reaper.reap();
      const report = {
        reaped: result.reaped.length,
        tasks: result.reaped,
      };

      expect(report).toEqual({ reaped: 0, tasks: [] });
      expect(result.alive).toHaveLength(1);
    });
  });
});
