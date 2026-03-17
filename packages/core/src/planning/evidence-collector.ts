/**
 * Evidence Collector — cross-references plan tasks against git reality.
 *
 * Runs `git diff` to find what actually changed, then matches file changes
 * against planned tasks to produce an evidence-based drift report.
 */

import { execFileSync } from 'node:child_process';
import type { Plan, PlanTask } from './planner.js';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

export interface GitTaskEvidence {
  taskId: string;
  taskTitle: string;
  plannedStatus: string;
  matchedFiles: FileChange[];
  verdict: 'DONE' | 'PARTIAL' | 'MISSING' | 'SKIPPED';
}

export interface UnplannedChange {
  file: FileChange;
  possibleReason: string;
}

export interface EvidenceReport {
  planId: string;
  planObjective: string;
  accuracy: number;
  evidenceSources: string[];
  taskEvidence: GitTaskEvidence[];
  unplannedChanges: UnplannedChange[];
  missingWork: GitTaskEvidence[];
  summary: string;
}

/**
 * Collect git diff evidence for a plan.
 *
 * @param plan - The plan to verify
 * @param projectPath - Project root (must be a git repo)
 * @param baseBranch - Compare against this branch (default: 'main')
 */
export function collectGitEvidence(
  plan: Plan,
  projectPath: string,
  baseBranch: string = 'main',
): EvidenceReport {
  const fileChanges = getGitDiff(projectPath, baseBranch);
  const taskEvidence: GitTaskEvidence[] = [];
  const matchedFiles = new Set<string>();

  for (const task of plan.tasks) {
    const matches = findMatchingFiles(task, fileChanges);
    for (const m of matches) matchedFiles.add(m.path);

    const verdict = determineVerdict(task, matches);
    taskEvidence.push({
      taskId: task.id,
      taskTitle: task.title,
      plannedStatus: task.status,
      matchedFiles: matches,
      verdict,
    });
  }

  const unplannedChanges: UnplannedChange[] = fileChanges
    .filter((f) => !matchedFiles.has(f.path))
    .map((f) => ({
      file: f,
      possibleReason: inferReason(f),
    }));

  const missingWork = taskEvidence.filter((te) => te.verdict === 'MISSING');

  const totalTasks = taskEvidence.length;
  const doneTasks = taskEvidence.filter((te) => te.verdict === 'DONE').length;
  const partialTasks = taskEvidence.filter((te) => te.verdict === 'PARTIAL').length;
  const skippedTasks = taskEvidence.filter((te) => te.verdict === 'SKIPPED').length;
  const accuracy =
    totalTasks > 0
      ? Math.round(((doneTasks + partialTasks * 0.5 + skippedTasks * 0.25) / totalTasks) * 100)
      : 100;

  const summary = buildSummary(
    totalTasks,
    doneTasks,
    partialTasks,
    missingWork.length,
    unplannedChanges.length,
  );

  return {
    planId: plan.id,
    planObjective: plan.objective,
    accuracy,
    evidenceSources: ['git'],
    taskEvidence,
    unplannedChanges,
    missingWork,
    summary,
  };
}

function getGitDiff(projectPath: string, baseBranch: string): FileChange[] {
  try {
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    const diffTarget = currentBranch === baseBranch ? 'HEAD~10' : baseBranch;

    let output: string;
    try {
      output = execFileSync('git', ['diff', '--name-status', `${diffTarget}...HEAD`], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
      });
    } catch {
      output = execFileSync('git', ['diff', '--name-status', 'HEAD~5'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
      });
    }

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map(parseGitDiffLine)
      .filter((f): f is FileChange => f !== null);
  } catch {
    return [];
  }
}

function parseGitDiffLine(line: string): FileChange | null {
  const match = line.match(/^([AMDRC])\d*\t(.+?)(?:\t(.+))?$/);
  if (!match) return null;

  const statusChar = match[1];
  const path = match[3] ?? match[2];

  const statusMap: Record<string, FileChange['status']> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'added',
  };

  return { path, status: statusMap[statusChar] ?? 'modified' };
}

function findMatchingFiles(task: PlanTask, files: FileChange[]): FileChange[] {
  const keywords = extractKeywords(task.title + ' ' + task.description);
  if (keywords.length === 0) return [];

  return files.filter((f) => {
    const pathLower = f.path.toLowerCase();
    return keywords.some((kw) => pathLower.includes(kw));
  });
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'into',
    'add',
    'create',
    'implement',
    'update',
    'fix',
    'remove',
    'delete',
    'new',
    'use',
    'should',
    'must',
    'will',
    'can',
    'all',
    'each',
    'when',
    'not',
    'are',
    'has',
    'have',
    'been',
    'was',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/.]/g, ' ')
    .split(/[\s\-_/]+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  return [...new Set(words)];
}

function determineVerdict(task: PlanTask, matches: FileChange[]): GitTaskEvidence['verdict'] {
  if (task.status === 'skipped') return 'SKIPPED';
  if (matches.length === 0) return 'MISSING';
  if (task.status === 'completed') return 'DONE';
  if (matches.length > 0) return 'PARTIAL';
  return 'MISSING';
}

function inferReason(file: FileChange): string {
  const path = file.path.toLowerCase();
  if (path.includes('index.') || path.includes('barrel')) return 'likely re-export update';
  if (path.includes('config') || path.includes('.env')) return 'configuration change';
  if (path.includes('test') || path.includes('spec')) return 'test file';
  if (path.includes('package.json') || path.includes('lock')) return 'dependency update';
  if (path.includes('readme') || path.includes('.md')) return 'documentation';
  if (path.includes('types') || path.includes('.d.ts')) return 'type definition update';
  return 'unplanned scope';
}

function buildSummary(
  total: number,
  done: number,
  partial: number,
  missing: number,
  unplanned: number,
): string {
  const parts: string[] = [];
  parts.push(`${done}/${total} tasks verified by git evidence`);
  if (partial > 0) parts.push(`${partial} partially done`);
  if (missing > 0) parts.push(`${missing} with no file evidence`);
  if (unplanned > 0) parts.push(`${unplanned} unplanned file changes`);
  return parts.join(', ');
}
