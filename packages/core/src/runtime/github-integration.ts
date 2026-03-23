/**
 * GitHub integration helpers for the planning lifecycle.
 *
 * Provides lightweight wrappers around git and the `gh` CLI for:
 *   - Detecting the GitHub remote from a project path
 *   - Extracting issue numbers from text
 *   - Closing issues with a comment
 *   - Fetching issue details
 *
 * All functions degrade gracefully — if `gh` is not installed or not
 * authenticated, they return null / no-op instead of throwing.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRemote {
  owner: string;
  repo: string;
}

export interface GitHubIssueDetails {
  title: string;
  body: string;
  labels: string[];
}

// ---------------------------------------------------------------------------
// detectGitHubRemote
// ---------------------------------------------------------------------------

/**
 * Detect the GitHub owner/repo from the git remote in a project directory.
 * Parses both HTTPS and SSH remote URLs.
 * Returns null if not a git repo or no GitHub remote found.
 */
export async function detectGitHubRemote(projectPath: string): Promise<GitHubRemote | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      timeout: 10_000,
      signal: AbortSignal.timeout(10_000),
    });
    return parseRemoteUrl(stdout.trim());
  } catch {
    return null;
  }
}

/**
 * Parse a GitHub owner/repo from a remote URL.
 * Supports HTTPS and SSH formats.
 */
export function parseRemoteUrl(url: string): GitHubRemote | null {
  // HTTPS: https://github.com/owner/repo.git
  const https = url.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (https) return { owner: https[1], repo: https[2] };

  // SSH: git@github.com:owner/repo.git
  const ssh = url.match(/github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  return null;
}

// ---------------------------------------------------------------------------
// extractIssueNumber
// ---------------------------------------------------------------------------

/**
 * Extract a GitHub issue number (#NNN) from arbitrary text.
 * Matches patterns like "#123", "issue #456", "fixes #789", "closes #42".
 * Returns the first match, or null if none found.
 */
export function extractIssueNumber(text: string): number | null {
  const match = text.match(/#(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isFinite(num) ? num : null;
}

// ---------------------------------------------------------------------------
// getIssueDetails
// ---------------------------------------------------------------------------

/**
 * Fetch issue details (title, body, labels) using the `gh` CLI.
 * Returns null if `gh` is not available or the issue cannot be fetched.
 */
export async function getIssueDetails(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GitHubIssueDetails | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'issue',
        'view',
        String(issueNumber),
        '--repo',
        `${owner}/${repo}`,
        '--json',
        'title,body,labels',
      ],
      {
        timeout: 10_000,
        signal: AbortSignal.timeout(10_000),
      },
    );
    const parsed = JSON.parse(stdout.trim()) as {
      title: string;
      body: string;
      labels: Array<{ name: string }>;
    };
    return {
      title: parsed.title,
      body: parsed.body ?? '',
      labels: (parsed.labels ?? []).map((l) => l.name),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// closeIssueWithComment
// ---------------------------------------------------------------------------

/**
 * Close a GitHub issue and leave a comment summarizing what was done.
 * No-ops gracefully if `gh` is not available.
 */
export async function closeIssueWithComment(
  owner: string,
  repo: string,
  issueNumber: number,
  comment: string,
): Promise<void> {
  const repoSlug = `${owner}/${repo}`;
  try {
    // Add comment first, then close
    await execFileAsync(
      'gh',
      ['issue', 'comment', String(issueNumber), '--repo', repoSlug, '--body', comment],
      { timeout: 10_000, signal: AbortSignal.timeout(10_000) },
    );
    await execFileAsync('gh', ['issue', 'close', String(issueNumber), '--repo', repoSlug], {
      timeout: 10_000,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Graceful degradation — gh not available or auth expired
  }
}
