#!/usr/bin/env node
/**
 * capture-hook.ts — Standalone script for capturing Claude Code transcripts.
 *
 * Called from a shell hook (PreCompact / Stop) to parse a JSONL transcript
 * file and persist it into Soleri's vault database.
 *
 * Usage:
 *   node capture-hook.js \
 *     --session-id <id> \
 *     --transcript-path <path> \
 *     --project-path <path> \
 *     --vault-path <path>
 *
 * Exit codes:
 *   0 — success or graceful skip (always safe for hooks)
 *   1 — fatal error (logged to stderr)
 *   NEVER exits 2 — that would block Claude Code
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import { initializeSchema } from '../vault/vault-schema.js';
import { captureTranscriptSession } from '../vault/vault-transcripts.js';
import { parseTranscriptJsonl } from './jsonl-parser.js';
import { captureMemory } from '../vault/vault-memories.js';

// ── Arg Parsing ──────────────────────────────────────────────────────

interface CaptureArgs {
  sessionId: string;
  transcriptPath: string;
  projectPath: string;
  vaultPath: string;
}

function parseArgs(): CaptureArgs | null {
  const args = process.argv.slice(2);
  let sessionId: string | undefined;
  let transcriptPath: string | undefined;
  let projectPath: string | undefined;
  let vaultPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--session-id' && next) {
      sessionId = next;
      i++;
    } else if (arg === '--transcript-path' && next) {
      transcriptPath = resolve(next);
      i++;
    } else if (arg === '--project-path' && next) {
      projectPath = resolve(next);
      i++;
    } else if (arg === '--vault-path' && next) {
      vaultPath = resolve(next);
      i++;
    }
  }

  if (!sessionId || !transcriptPath || !projectPath || !vaultPath) {
    return null;
  }

  return { sessionId, transcriptPath, projectPath, vaultPath };
}

// ── Git Context ─────────────────────────────────────────────────────

/** Git context collected from the project repo during session capture. */
export interface GitSessionContext {
  branch: string;
  commits: Array<{ hash: string; message: string }>;
  filesChanged: string[];
}

const GIT_TIMEOUT_MS = 3000;

/**
 * Collect git context for the session window.
 *
 * Runs git commands to get: branch name, recent commits since session start,
 * and files changed across those commits. Returns null on any failure —
 * the caller falls back to heuristic summary.
 */
export function collectSessionGitContext(
  projectPath: string,
  sessionStartTimestamp?: number,
): GitSessionContext | null {
  try {
    // 1. Branch name
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    }).trim();

    // 2. Recent commits — scoped to session window if we have a timestamp
    const logArgs = ['log', '--oneline', '--format=%h %s'];
    if (sessionStartTimestamp) {
      const sinceDate = new Date(sessionStartTimestamp).toISOString();
      logArgs.push(`--since=${sinceDate}`);
    } else {
      // No timestamp — grab last 20 commits as a reasonable window
      logArgs.push('-20');
    }

    const logOutput = execFileSync('git', logArgs, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
    }).trim();

    const commits = logOutput
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const spaceIdx = line.indexOf(' ');
        return spaceIdx > 0
          ? { hash: line.slice(0, spaceIdx), message: line.slice(spaceIdx + 1) }
          : { hash: line, message: '' };
      });

    if (commits.length === 0) {
      return { branch, commits: [], filesChanged: [] };
    }

    // 3. Files changed across the commit range
    const oldestHash = commits[commits.length - 1].hash;
    let diffOutput: string;
    try {
      diffOutput = execFileSync('git', ['diff', '--name-only', `${oldestHash}^..HEAD`], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
      }).trim();
    } catch {
      // oldestHash^ might not exist (first commit) — fall back to just that commit
      diffOutput = execFileSync(
        'git',
        ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'],
        {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: GIT_TIMEOUT_MS,
        },
      ).trim();
    }

    const filesChanged = diffOutput.split('\n').filter((f) => f.length > 0);

    return { branch, commits, filesChanged };
  } catch {
    // Not a git repo, git not installed, timeout, detached HEAD errors — all fine
    return null;
  }
}

// ── Auto-Memory ─────────────────────────────────────────────────────

/**
 * Build a heuristic session summary from transcript messages.
 *
 * Extracts: first user messages (topic), tool names used, message/token stats.
 * Returns a one-paragraph summary suitable for the memories table.
 */
function buildHeuristicSummary(
  transcriptPath: string,
  messagesStored: number,
  tokenEstimate: number,
): string {
  const messages = parseTranscriptJsonl(transcriptPath, { maxMessages: 500 });

  // Extract first 3 user messages as topic indicators
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .slice(0, 3)
    .map((m) => {
      const clean = m.content.replace(/\[Tool result:[^\]]*\]/g, '').trim();
      return clean.length > 120 ? clean.slice(0, 117) + '...' : clean;
    })
    .filter((t) => t.length > 0);

  // Extract unique tool names from assistant messages
  const toolPattern = /\[Tool: (\w+)\(/g;
  const tools = new Set<string>();
  for (const m of messages) {
    if (m.role === 'assistant') {
      let match;
      while ((match = toolPattern.exec(m.content)) !== null) {
        tools.add(match[1]);
      }
    }
  }

  const parts: string[] = [];

  if (userMessages.length > 0) {
    parts.push(userMessages.join('. '));
  }

  if (tools.size > 0) {
    const toolList = [...tools].slice(0, 10).join(', ');
    parts.push(`Tools: ${toolList}`);
  }

  parts.push(`${messagesStored} messages, ~${Math.round(tokenEstimate / 1000)}K tokens`);

  return parts.join('. ') + '.';
}

/**
 * Build a git-enriched summary from commit history + transcript context.
 */
function buildGitEnrichedSummary(
  git: GitSessionContext,
  transcriptPath: string,
  messagesStored: number,
): string {
  const parts: string[] = [];

  // Branch context
  parts.push(`[${git.branch}]`);

  // Commit summary
  if (git.commits.length > 0) {
    const commitMsgs = git.commits
      .slice(0, 5)
      .map((c) => c.message)
      .join('; ');
    parts.push(`${git.commits.length} commit(s): ${commitMsgs}`);
  }

  // Files changed
  if (git.filesChanged.length > 0) {
    const topFiles = git.filesChanged
      .slice(0, 8)
      .map((f) => f.split('/').pop() ?? f)
      .join(', ');
    const suffix = git.filesChanged.length > 8 ? ` (+${git.filesChanged.length - 8} more)` : '';
    parts.push(`Files: ${topFiles}${suffix}`);
  }

  parts.push(`${messagesStored} messages`);

  return parts.join('. ') + '.';
}

/**
 * Infer intent from branch name convention (feat/, fix/, refactor/, etc).
 */
function inferIntentFromBranch(branch: string): string | null {
  const match = branch.match(/^(feat|fix|refactor|chore|docs|test|ci|perf|style)\b/);
  return match ? match[1] : null;
}

/**
 * Get the timestamp of the first message in the transcript for session windowing.
 */
function getSessionStartTimestamp(transcriptPath: string): number | undefined {
  try {
    const messages = parseTranscriptJsonl(transcriptPath, { maxMessages: 1 });
    return messages.length > 0 ? messages[0].timestamp : undefined;
  } catch {
    return undefined;
  }
}

function generateSessionMemory(
  provider: SQLitePersistenceProvider,
  transcriptPath: string,
  projectPath: string,
  messagesStored: number,
  tokenEstimate: number,
): void {
  try {
    // Try git-enriched capture first
    const sessionStart = getSessionStartTimestamp(transcriptPath);
    const git = collectSessionGitContext(projectPath, sessionStart);

    if (git && (git.commits.length > 0 || git.filesChanged.length > 0)) {
      // Git-enriched path — real data from the repo
      const summary = buildGitEnrichedSummary(git, transcriptPath, messagesStored);
      const decisions = git.commits.map((c) => `${c.hash}: ${c.message}`);
      const intent = inferIntentFromBranch(git.branch);

      captureMemory(provider, {
        projectPath,
        type: 'session',
        context: `[auto-transcript] ${git.branch} — ${git.commits.length} commits, ${git.filesChanged.length} files`,
        summary,
        topics: [git.branch],
        filesModified: git.filesChanged,
        toolsUsed: [],
        intent,
        decisions,
        currentState: null,
        nextSteps: [],
        vaultEntriesReferenced: [],
      });

      console.error(
        `[soleri-capture] Git-enriched memory: ${git.branch}, ${git.commits.length} commits, ${git.filesChanged.length} files`,
      );
    } else {
      // Heuristic fallback — no git or no commits in window
      const summary = buildHeuristicSummary(transcriptPath, messagesStored, tokenEstimate);

      captureMemory(provider, {
        projectPath,
        type: 'session',
        context: '[auto-transcript] Generated from transcript capture hook',
        summary,
        topics: [],
        filesModified: [],
        toolsUsed: [],
        intent: null,
        decisions: [],
        currentState: null,
        nextSteps: [],
        vaultEntriesReferenced: [],
      });

      console.error(`[soleri-capture] Heuristic memory created for ${projectPath}`);
    }
  } catch (err) {
    // Never let memory generation break transcript capture
    console.error(
      `[soleri-capture] Auto-memory failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const parsed = parseArgs();
  if (!parsed) {
    console.error(
      '[soleri-capture] Missing required args: --session-id, --transcript-path, --project-path, --vault-path',
    );
    process.exit(1);
  }

  const { sessionId, transcriptPath, projectPath, vaultPath } = parsed;

  // Validate transcript file exists
  if (!existsSync(transcriptPath)) {
    console.error(`[soleri-capture] Transcript file not found: ${transcriptPath}`);
    process.exit(0); // Not an error — file may have been cleaned up
  }

  let provider: SQLitePersistenceProvider | null = null;

  try {
    // Create persistence provider and ensure schema
    provider = new SQLitePersistenceProvider(vaultPath);
    provider.run('PRAGMA journal_mode = WAL');
    provider.run('PRAGMA foreign_keys = ON');
    initializeSchema(provider);

    // Capture the transcript session
    const result = captureTranscriptSession(provider, {
      transcriptPath,
      sessionId,
      sourceKind: 'live_chat',
      projectPath,
    });

    console.error(
      `[soleri-capture] Captured session ${result.sessionId}: ${result.messagesStored} messages, ${result.segmentsStored} segments, ~${result.tokenEstimate} tokens`,
    );

    // Auto-generate a session memory so every session is discoverable
    // via memory_list, regardless of whether the agent called session_capture.
    generateSessionMemory(
      provider,
      transcriptPath,
      projectPath,
      result.messagesStored,
      result.tokenEstimate,
    );
  } catch (err) {
    console.error(`[soleri-capture] Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    if (provider) {
      try {
        provider.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

// Only run when executed directly, not when imported by tests
const isDirectExecution =
  process.argv[1]?.endsWith('capture-hook.js') || process.argv[1]?.endsWith('capture-hook.ts');
if (isDirectExecution) {
  main();
}
