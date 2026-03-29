/**
 * Git utility functions for the Soleri CLI scaffold flow.
 *
 * Uses child_process.execFile (not exec) for security — no shell interpolation.
 * Never throws — all functions return { ok, error? } for graceful handling.
 */

import { execFile } from 'node:child_process';

export interface GitResult {
  ok: boolean;
  error?: string;
}

/** Default timeout for local git operations (30s). */
const LOCAL_TIMEOUT = 30_000;

/** Timeout for network operations — push, gh create (60s). */
const NETWORK_TIMEOUT = 60_000;

/**
 * Run a command via execFile and return stdout on success, or an error string on failure.
 */
function run(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeout: number },
): Promise<{ stdout: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      execFile(
        cmd,
        args,
        {
          cwd: options.cwd,
          signal: AbortSignal.timeout(options.timeout),
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({ stdout: '', error: stderr?.trim() || error.message });
          } else {
            resolve({ stdout: stdout ?? '' });
          }
        },
      );
    } catch (err: unknown) {
      // execFile itself can throw (e.g. ENOENT)
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ stdout: '', error: msg });
    }
  });
}

/** Check if the `git` binary is available on PATH. */
export async function isGitInstalled(): Promise<boolean> {
  const { error } = await run('which', ['git'], { timeout: LOCAL_TIMEOUT });
  return !error;
}

/** Check if the `gh` (GitHub CLI) binary is available on PATH. */
export async function isGhInstalled(): Promise<boolean> {
  const { error } = await run('which', ['gh'], { timeout: LOCAL_TIMEOUT });
  return !error;
}

/** Run `git init` in the given directory. */
export async function gitInit(dir: string): Promise<GitResult> {
  const { error } = await run('git', ['init'], { cwd: dir, timeout: LOCAL_TIMEOUT });
  return error ? { ok: false, error } : { ok: true };
}

/** Stage all files and create an initial commit. */
export async function gitInitialCommit(dir: string, message: string): Promise<GitResult> {
  const add = await run('git', ['add', '.'], { cwd: dir, timeout: LOCAL_TIMEOUT });
  if (add.error) return { ok: false, error: add.error };

  const commit = await run('git', ['commit', '-m', message], { cwd: dir, timeout: LOCAL_TIMEOUT });
  if (commit.error) return { ok: false, error: commit.error };

  return { ok: true };
}

/** Add a remote origin URL. */
export async function gitAddRemote(dir: string, url: string): Promise<GitResult> {
  const { error } = await run('git', ['remote', 'add', 'origin', url], {
    cwd: dir,
    timeout: LOCAL_TIMEOUT,
  });
  return error ? { ok: false, error } : { ok: true };
}

/** Push to origin main with the -u flag. */
export async function gitPush(dir: string): Promise<GitResult> {
  const { error } = await run('git', ['push', '-u', 'origin', 'main'], {
    cwd: dir,
    timeout: NETWORK_TIMEOUT,
  });
  return error ? { ok: false, error } : { ok: true };
}

/** Create a GitHub repo using the `gh` CLI. */
export async function ghCreateRepo(
  name: string,
  options: { visibility: 'public' | 'private'; dir: string },
): Promise<GitResult & { url?: string }> {
  const visFlag = options.visibility === 'public' ? '--public' : '--private';
  const { stdout, error } = await run(
    'gh',
    ['repo', 'create', name, visFlag, `--source=${options.dir}`, '--remote=origin', '--push'],
    { cwd: options.dir, timeout: NETWORK_TIMEOUT },
  );

  if (error) return { ok: false, error };

  // gh repo create prints the repo URL on stdout
  const url = stdout.trim() || undefined;
  return { ok: true, url };
}
