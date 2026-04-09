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
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import { initializeSchema } from '../vault/vault-schema.js';
import { captureTranscriptSession } from '../vault/vault-transcripts.js';

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

main();
