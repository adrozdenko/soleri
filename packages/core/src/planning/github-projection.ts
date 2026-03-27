/**
 * GitHub Projection — auto-link Ernesto plans to GitHub issues.
 *
 * After plan_split (tasks defined), the agent can detect a GitHub repo
 * and project plan tasks as GitHub issues with plan metadata linked.
 *
 * The plan is the source of truth; GitHub issues are the projection.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export interface GitHubMilestone {
  number: number;
  title: string;
  state: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  body?: string;
}

export interface GitHubLabel {
  name: string;
  color?: string;
}

export interface GitHubContext {
  repo: GitHubRepo;
  authenticated: boolean;
  milestones: GitHubMilestone[];
  existingIssues: GitHubIssue[];
  labels: GitHubLabel[];
}

export interface GitHubProjection {
  repo: string;
  milestone?: number;
  issues: Array<{
    taskId: string;
    issueNumber: number;
  }>;
  projectedAt: number;
}

export interface ProjectedIssue {
  taskId: string;
  issueNumber: number;
  issueUrl: string;
}

// ---------------------------------------------------------------------------
// Git remote detection
// ---------------------------------------------------------------------------

/**
 * Parse a GitHub owner/repo from a git remote URL.
 * Supports HTTPS (github.com/owner/repo.git) and SSH (git@github.com:owner/repo.git).
 */
export function parseGitHubRemote(remoteUrl: string): GitHubRepo | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

/**
 * Detect the GitHub remote from a project directory.
 * Returns null if no GitHub remote found or not a git repo.
 */
export async function detectGitHubRemote(projectPath: string): Promise<GitHubRepo | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      timeout: 5000,
      signal: AbortSignal.timeout(5000),
    });
    return parseGitHubRemote(stdout.trim());
  } catch {
    return null;
  }
}

/**
 * Check if the `gh` CLI is authenticated.
 */
export async function isGhAuthenticated(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status'], {
      timeout: 5000,
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GitHub API helpers (via `gh` CLI)
// ---------------------------------------------------------------------------

/**
 * List milestones for a GitHub repo.
 */
export async function listMilestones(repo: GitHubRepo): Promise<GitHubMilestone[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'api',
        `repos/${repo.owner}/${repo.repo}/milestones`,
        '--jq',
        '.[] | {number, title, state}',
      ],
      {
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
      },
    );

    const output = stdout.trim();
    if (!output) return [];

    // gh --jq outputs one JSON object per line
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as GitHubMilestone);
  } catch {
    return [];
  }
}

/**
 * List open issues for a GitHub repo.
 */
export async function listOpenIssues(
  repo: GitHubRepo,
  limit: number = 100,
): Promise<GitHubIssue[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'issue',
        'list',
        '--repo',
        `${repo.owner}/${repo.repo}`,
        '--state',
        'open',
        '--limit',
        String(limit),
        '--json',
        'number,title,state,body',
      ],
      {
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
      },
    );

    const output = stdout.trim();
    if (!output) return [];
    return JSON.parse(output) as GitHubIssue[];
  } catch {
    return [];
  }
}

/**
 * List labels for a GitHub repo.
 */
export async function listLabels(repo: GitHubRepo): Promise<GitHubLabel[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['label', 'list', '--repo', `${repo.owner}/${repo.repo}`, '--json', 'name,color'],
      {
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
      },
    );

    const output = stdout.trim();
    if (!output) return [];
    return JSON.parse(output) as GitHubLabel[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Full context detection
// ---------------------------------------------------------------------------

/**
 * Detect full GitHub context for a project.
 * Returns null if not a GitHub project or gh CLI not available.
 */
export async function detectGitHubContext(projectPath: string): Promise<GitHubContext | null> {
  const repo = await detectGitHubRemote(projectPath);
  if (!repo) return null;

  const authenticated = await isGhAuthenticated();
  if (!authenticated) return null;

  const [milestones, existingIssues, labels] = await Promise.all([
    listMilestones(repo),
    listOpenIssues(repo),
    listLabels(repo),
  ]);

  return { repo, authenticated, milestones, existingIssues, labels };
}

// ---------------------------------------------------------------------------
// Milestone matching
// ---------------------------------------------------------------------------

/**
 * Find the best matching milestone by name similarity.
 * Uses simple word overlap scoring.
 */
export function findMatchingMilestone(
  phaseName: string,
  milestones: GitHubMilestone[],
): GitHubMilestone | null {
  if (milestones.length === 0) return null;

  const phaseWords = new Set(phaseName.toLowerCase().split(/\s+/));

  let bestMatch: GitHubMilestone | null = null;
  let bestScore = 0;

  for (const ms of milestones) {
    if (ms.state !== 'open') continue;
    const msWords = ms.title.toLowerCase().split(/\s+/);
    let overlap = 0;
    for (const w of msWords) {
      if (phaseWords.has(w)) overlap++;
    }
    const score = overlap / Math.max(phaseWords.size, msWords.length);
    if (score > bestScore && score > 0.2) {
      bestScore = score;
      bestMatch = ms;
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Find an existing issue that likely covers the same task.
 * Uses title similarity (word overlap).
 */
export function findDuplicateIssue(
  taskTitle: string,
  existingIssues: GitHubIssue[],
): GitHubIssue | null {
  const taskWords = new Set(
    taskTitle
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  for (const issue of existingIssues) {
    const issueWords = issue.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    let overlap = 0;
    for (const w of issueWords) {
      if (taskWords.has(w)) overlap++;
    }
    const score = overlap / Math.max(taskWords.size, issueWords.length, 1);
    if (score >= 0.5) return issue;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Issue body formatting
// ---------------------------------------------------------------------------

export interface PlanMetadataForIssue {
  planId: string;
  grade: string;
  score: number;
  objective: string;
  decisions: Array<string | { decision: string; rationale: string }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    dependsOn?: string[];
  }>;
}

/**
 * Format an issue body with plan metadata.
 */
export function formatIssueBody(
  plan: PlanMetadataForIssue,
  taskTitle: string,
  taskDescription: string,
  options?: { goalContext?: string },
): string {
  const lines: string[] = [];

  lines.push(`## Ernesto Plan: \`${plan.planId}\` (Grade: ${plan.grade}, ${plan.score}/100)`);
  lines.push('');
  lines.push(`**Objective:** ${plan.objective}`);
  lines.push('');

  if (options?.goalContext) {
    lines.push(options.goalContext);
    lines.push('');
  }

  if (plan.decisions.length > 0) {
    lines.push('## Decisions');
    for (const d of plan.decisions) {
      if (typeof d === 'string') {
        lines.push(`- ${d}`);
      } else {
        lines.push(`- **${d.decision}** — ${d.rationale}`);
      }
    }
    lines.push('');
  }

  lines.push('## Task');
  lines.push(taskDescription);
  lines.push('');

  lines.push('## All Plan Tasks');
  lines.push('| # | Task | Depends On |');
  lines.push('|---|------|------------|');
  for (const t of plan.tasks) {
    const deps = t.dependsOn?.join(', ') || '—';
    lines.push(`| ${t.id} | ${t.title} | ${deps} |`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Issue creation
// ---------------------------------------------------------------------------

/**
 * Create a GitHub issue using the `gh` CLI.
 * Returns the issue number, or null on failure.
 */
export async function createGitHubIssue(
  repo: GitHubRepo,
  title: string,
  body: string,
  options?: {
    milestone?: number;
    labels?: string[];
  },
): Promise<number | null> {
  try {
    const args = [
      'issue',
      'create',
      '--repo',
      `${repo.owner}/${repo.repo}`,
      '--title',
      title,
      '--body',
      body,
    ];

    if (options?.milestone) {
      args.push('--milestone', String(options.milestone));
    }

    if (options?.labels && options.labels.length > 0) {
      args.push('--label', options.labels.join(','));
    }

    const { stdout } = await execFileAsync('gh', args, {
      timeout: 15000,
      signal: AbortSignal.timeout(15000),
    });

    // gh issue create returns the issue URL: https://github.com/owner/repo/issues/123
    const match = stdout.trim().match(/\/issues\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * Update an existing GitHub issue body (for linking plans to existing issues).
 */
export async function updateGitHubIssueBody(
  repo: GitHubRepo,
  issueNumber: number,
  body: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      'gh',
      [
        'issue',
        'edit',
        '--repo',
        `${repo.owner}/${repo.repo}`,
        String(issueNumber),
        '--body',
        body,
      ],
      {
        timeout: 15000,
        signal: AbortSignal.timeout(15000),
      },
    );
    return true;
  } catch {
    return false;
  }
}
