/**
 * Session lifecycle, query, quality, and replay functions.
 * Extracted from BrainIntelligence to keep the coordinator thin.
 */

import { randomUUID } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  BrainSession,
  SessionLifecycleInput,
  SessionListQuery,
  SessionQuality,
  SessionReplay,
  SessionContext,
  KnowledgeProposal,
} from './types.js';
import {
  buildSessionFrequencies,
  rowToSession,
  type BrainSessionRow,
} from './intelligence-rows.js';

// ─── Helpers ──────────────────────────────────────────────────────

export function getSession(provider: PersistenceProvider, id: string): BrainSession | null {
  const row = provider.get<BrainSessionRow>('SELECT * FROM brain_sessions WHERE id = ?', [id]);
  if (!row) return null;
  return rowToSession(row);
}

// ─── Lifecycle ────────────────────────────────────────────────────

export function startOrEndSession(
  provider: PersistenceProvider,
  input: SessionLifecycleInput,
): BrainSession {
  if (input.action === 'start') {
    const id = input.sessionId ?? randomUUID();
    provider.run(
      `INSERT INTO brain_sessions (id, domain, context, tools_used, files_modified, plan_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.domain ?? null,
        input.context ?? null,
        JSON.stringify(input.toolsUsed ?? []),
        JSON.stringify(input.filesModified ?? []),
        input.planId ?? null,
      ],
    );
    return getSession(provider, id)!;
  }

  // action === 'end'
  const sessionId = input.sessionId;
  if (!sessionId) throw new Error('sessionId required for end action');

  const updates: string[] = ["ended_at = datetime('now')"];
  const values: unknown[] = [];

  if (input.toolsUsed) {
    updates.push('tools_used = ?');
    values.push(JSON.stringify(input.toolsUsed));
  }
  if (input.filesModified) {
    updates.push('files_modified = ?');
    values.push(JSON.stringify(input.filesModified));
  }
  if (input.planId) {
    updates.push('plan_id = ?');
    values.push(input.planId);
  }
  if (input.planOutcome) {
    updates.push('plan_outcome = ?');
    values.push(input.planOutcome);
  }
  if (input.context) {
    updates.push("context = COALESCE(context, '') || ?");
    values.push(' | ' + input.context);
  }

  values.push(sessionId);
  provider.run(`UPDATE brain_sessions SET ${updates.join(', ')} WHERE id = ?`, values);

  return getSession(provider, sessionId)!;
}

// ─── Query ────────────────────────────────────────────────────────

export function getSessionByPlanId(
  provider: PersistenceProvider,
  planId: string,
): BrainSession | null {
  const row = provider.get<BrainSessionRow>(
    'SELECT * FROM brain_sessions WHERE plan_id = ? ORDER BY started_at DESC LIMIT 1',
    [planId],
  );
  if (!row) return null;
  return rowToSession(row);
}

export function listSessions(
  provider: PersistenceProvider,
  query?: SessionListQuery,
): BrainSession[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query?.domain) {
    conditions.push('domain = ?');
    values.push(query.domain);
  }
  if (query?.active === true) {
    conditions.push('ended_at IS NULL');
  } else if (query?.active === false) {
    conditions.push('ended_at IS NOT NULL');
  }
  if (query?.extracted === true) {
    conditions.push('extracted_at IS NOT NULL');
  } else if (query?.extracted === false) {
    conditions.push('extracted_at IS NULL');
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = query?.limit ?? 50;
  const offset = query?.offset ?? 0;
  values.push(limit, offset);

  const rows = provider.all<BrainSessionRow>(
    `SELECT * FROM brain_sessions ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    values,
  );

  return rows.map((row) => rowToSession(row));
}

export function getSessionContext(provider: PersistenceProvider, limit = 10): SessionContext {
  const rows = provider.all<BrainSessionRow>(
    'SELECT * FROM brain_sessions ORDER BY started_at DESC LIMIT ?',
    [limit],
  );
  const sessions = rows.map((row) => rowToSession(row));
  return { recentSessions: sessions, ...buildSessionFrequencies(sessions) };
}

export function archiveSessions(
  provider: PersistenceProvider,
  olderThanDays = 30,
): { archived: number } {
  const result = provider.run(
    `DELETE FROM brain_sessions
     WHERE ended_at IS NOT NULL
     AND started_at < datetime('now', '-' || ? || ' days')`,
    [olderThanDays],
  );
  return { archived: result.changes };
}

// ─── Quality & Replay ─────────────────────────────────────────────

export function computeSessionQuality(
  provider: PersistenceProvider,
  sessionId: string,
): SessionQuality {
  const session = getSession(provider, sessionId);
  if (!session) throw new Error('Session not found: ' + sessionId);

  // Completeness (0-25): session ended + has context + has domain
  let completeness = 0;
  if (session.endedAt) completeness += 10;
  if (session.context) completeness += 8;
  if (session.domain) completeness += 7;

  // Artifact density (0-25): files modified
  const fileCount = session.filesModified.length;
  const artifactDensity = Math.min(25, fileCount * 5);

  // Tool engagement (0-25): unique tools used
  const uniqueTools = new Set(session.toolsUsed).size;
  const toolEngagement = Math.min(25, uniqueTools * 5);

  // Outcome clarity (0-25): plan outcome + extraction status
  let outcomeClarity = 0;
  if (session.planId) outcomeClarity += 8;
  if (session.planOutcome === 'completed') outcomeClarity += 10;
  else if (session.planOutcome === 'abandoned') outcomeClarity += 5;
  else if (session.planOutcome) outcomeClarity += 7;
  if (session.extractedAt) outcomeClarity += 7;

  const overall = completeness + artifactDensity + toolEngagement + outcomeClarity;

  return {
    sessionId,
    overall,
    completeness,
    artifactDensity,
    toolEngagement,
    outcomeClarity,
  };
}

export function replaySession(
  provider: PersistenceProvider,
  sessionId: string,
  getProposals: (options?: { sessionId?: string }) => KnowledgeProposal[],
): SessionReplay {
  const session = getSession(provider, sessionId);
  if (!session) throw new Error('Session not found: ' + sessionId);

  const quality = computeSessionQuality(provider, sessionId);
  const proposals = getProposals({ sessionId });

  let durationMinutes: number | null = null;
  if (session.startedAt && session.endedAt) {
    const ms = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
    durationMinutes = Math.round(ms / 60000);
  }

  return { session, quality, proposals, durationMinutes };
}
