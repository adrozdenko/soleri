import { spawn } from 'node:child_process';

/**
 * Remove a temp scaffold without blocking vitest teardown.
 *
 * An awaited rm in afterAll risks the birpc teardown timeout on CI, while a
 * fire-and-forget promise dies with the worker process and leaks the
 * directory (~1.7GB per scaffold run). A detached node child survives worker
 * exit and completes the delete.
 */
export function cleanupDirDetached(dir: string): void {
  try {
    spawn(
      process.execPath,
      ['-e', 'require("node:fs").rmSync(process.argv[1], {recursive: true, force: true})', dir],
      { detached: true, stdio: 'ignore' },
    ).unref();
  } catch {
    // Best-effort — never fail teardown over cleanup
  }
}
