import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import {
  isGitInstalled,
  isGhInstalled,
  gitInit,
  gitInitialCommit,
  gitAddRemote,
  gitPush,
  ghCreateRepo,
} from '../utils/git.js';

const mockExecFile = vi.mocked(execFile);

/** Helper: make execFile call its callback with success (stdout). */
function mockSuccess(stdout = '') {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    (callback as Function)(null, stdout, '');
    return undefined as any;
  });
}

/** Helper: make execFile call its callback with an error. */
function mockFailure(message: string, stderr = '') {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const err = new Error(message);
    (callback as Function)(err, '', stderr);
    return undefined as any;
  });
}

/**
 * Helper: make execFile succeed N times then fail.
 * Useful for testing gitInitialCommit where `git add` must succeed before `git commit` fails.
 */
function mockSequence(calls: Array<{ stdout?: string; error?: string; stderr?: string }>) {
  let callIndex = 0;
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const spec = calls[callIndex] ?? calls[calls.length - 1];
    callIndex++;
    if (spec.error) {
      const err = new Error(spec.error);
      (callback as Function)(err, '', spec.stderr ?? spec.error);
    } else {
      (callback as Function)(null, spec.stdout ?? '', '');
    }
    return undefined as any;
  });
}

describe('git utilities', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── isGitInstalled ──────────────────────────────────────────────
  describe('isGitInstalled', () => {
    it('returns true when git binary is found', async () => {
      mockSuccess('/usr/bin/git');
      const result = await isGitInstalled();
      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'which',
        ['git'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.any(Function),
      );
    });

    it('returns false when git binary is not found', async () => {
      mockFailure('not found');
      const result = await isGitInstalled();
      expect(result).toBe(false);
    });
  });

  // ── isGhInstalled ──────────────────────────────────────────────
  describe('isGhInstalled', () => {
    it('returns true when gh binary is found', async () => {
      mockSuccess('/usr/bin/gh');
      const result = await isGhInstalled();
      expect(result).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'which',
        ['gh'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
        expect.any(Function),
      );
    });

    it('returns false when gh binary is not found', async () => {
      mockFailure('not found');
      const result = await isGhInstalled();
      expect(result).toBe(false);
    });
  });

  // ── gitInit ─────────────────────────────────────────────────────
  describe('gitInit', () => {
    it('returns { ok: true } on success', async () => {
      mockSuccess('Initialized empty Git repository');
      const result = await gitInit('/tmp/my-project');
      expect(result).toEqual({ ok: true });
    });

    it('returns { ok: false, error } on failure', async () => {
      mockFailure('fatal: not a git repository', 'fatal: not a git repository');
      const result = await gitInit('/tmp/my-project');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('passes correct args with cwd', async () => {
      mockSuccess();
      await gitInit('/tmp/my-project');
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['init'],
        expect.objectContaining({ cwd: '/tmp/my-project' }),
        expect.any(Function),
      );
    });
  });

  // ── gitInitialCommit ────────────────────────────────────────────
  describe('gitInitialCommit', () => {
    it('returns { ok: true } when both add and commit succeed', async () => {
      mockSequence([{ stdout: '' }, { stdout: '' }]);
      const result = await gitInitialCommit('/tmp/proj', 'Initial commit');
      expect(result).toEqual({ ok: true });
      // Two calls: git add . and git commit -m ...
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('returns { ok: false } when git add fails (does not attempt commit)', async () => {
      mockSequence([{ error: 'add failed', stderr: 'add failed' }]);
      const result = await gitInitialCommit('/tmp/proj', 'Initial commit');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('add failed');
      // Only one call — git add; commit should not be attempted
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('returns { ok: false } when add succeeds but commit fails', async () => {
      mockSequence([{ stdout: '' }, { error: 'nothing to commit', stderr: 'nothing to commit' }]);
      const result = await gitInitialCommit('/tmp/proj', 'Initial commit');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('nothing to commit');
      expect(mockExecFile).toHaveBeenCalledTimes(2);
    });

    it('passes the correct commit message', async () => {
      mockSequence([{ stdout: '' }, { stdout: '' }]);
      await gitInitialCommit('/tmp/proj', 'feat: initial scaffold');
      // Second call should be git commit -m <message>
      const commitCall = mockExecFile.mock.calls[1];
      expect(commitCall[0]).toBe('git');
      expect(commitCall[1]).toEqual(['commit', '-m', 'feat: initial scaffold']);
    });
  });

  // ── gitAddRemote ────────────────────────────────────────────────
  describe('gitAddRemote', () => {
    it('returns { ok: true } on success', async () => {
      mockSuccess();
      const result = await gitAddRemote('/tmp/proj', 'https://github.com/user/repo.git');
      expect(result).toEqual({ ok: true });
    });

    it('passes correct args', async () => {
      mockSuccess();
      await gitAddRemote('/tmp/proj', 'https://github.com/user/repo.git');
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['remote', 'add', 'origin', 'https://github.com/user/repo.git'],
        expect.objectContaining({ cwd: '/tmp/proj' }),
        expect.any(Function),
      );
    });

    it('returns { ok: false } on failure', async () => {
      mockFailure('remote origin already exists', 'remote origin already exists');
      const result = await gitAddRemote('/tmp/proj', 'https://github.com/user/repo.git');
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ── gitPush ─────────────────────────────────────────────────────
  describe('gitPush', () => {
    it('returns { ok: true } on success', async () => {
      mockSuccess();
      const result = await gitPush('/tmp/proj');
      expect(result).toEqual({ ok: true });
    });

    it('returns { ok: false } on network error', async () => {
      mockFailure('Could not resolve host', 'Could not resolve host');
      const result = await gitPush('/tmp/proj');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could not resolve host');
    });

    it('uses NETWORK_TIMEOUT (60s) via AbortSignal', async () => {
      mockSuccess();
      await gitPush('/tmp/proj');
      const callOpts = mockExecFile.mock.calls[0][2] as { signal: AbortSignal };
      // AbortSignal.timeout(60000) — verify it is an AbortSignal (we can't read the timeout
      // value directly, but we can verify it's present and is an AbortSignal)
      expect(callOpts.signal).toBeInstanceOf(AbortSignal);
    });
  });

  // ── ghCreateRepo ────────────────────────────────────────────────
  describe('ghCreateRepo', () => {
    it('returns { ok: true, url } on success', async () => {
      mockSuccess('https://github.com/user/my-repo\n');
      const result = await ghCreateRepo('my-repo', { visibility: 'public', dir: '/tmp/proj' });
      expect(result.ok).toBe(true);
      expect(result.url).toBe('https://github.com/user/my-repo');
    });

    it('returns { ok: false } on failure', async () => {
      mockFailure('authentication required', 'authentication required');
      const result = await ghCreateRepo('my-repo', { visibility: 'public', dir: '/tmp/proj' });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('passes --public flag for public visibility', async () => {
      mockSuccess('https://github.com/user/my-repo');
      await ghCreateRepo('my-repo', { visibility: 'public', dir: '/tmp/proj' });
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--public');
      expect(args).not.toContain('--private');
    });

    it('passes --private flag for private visibility', async () => {
      mockSuccess('https://github.com/user/my-repo');
      await ghCreateRepo('my-repo', { visibility: 'private', dir: '/tmp/proj' });
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--private');
      expect(args).not.toContain('--public');
    });

    it('includes --source, --remote, and --push flags', async () => {
      mockSuccess('https://github.com/user/my-repo');
      await ghCreateRepo('my-repo', { visibility: 'public', dir: '/tmp/proj' });
      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain('--source=/tmp/proj');
      expect(args).toContain('--remote=origin');
      expect(args).toContain('--push');
    });

    it('returns undefined url when stdout is empty', async () => {
      mockSuccess('');
      const result = await ghCreateRepo('my-repo', { visibility: 'public', dir: '/tmp/proj' });
      expect(result.ok).toBe(true);
      expect(result.url).toBeUndefined();
    });
  });
});
