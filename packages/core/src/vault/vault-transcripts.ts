/**
 * Vault transcript operations — capture, search, retrieve, archive.
 * Extracted as a dedicated persistence layer for transcript sessions,
 * messages, and segments. Follows the same patterns as vault-memories.ts.
 */
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  TranscriptSession,
  TranscriptMessage,
  TranscriptSegment,
  TranscriptCaptureInput,
  TranscriptCaptureResult,
} from '../transcript/types.js';
import { parseTranscriptJsonl, estimateTokens } from '../transcript/jsonl-parser.js';
import { segmentMessages, hashContent } from '../transcript/segmenter.js';

// ── Capture ────────────────────────────────────────────────────────────

/**
 * Capture a transcript session into storage.
 *
 * Accepts messages directly, raw text, or a JSONL file path. Wraps all
 * writes in a single transaction for atomicity. Handles deduplication —
 * if a session already exists, appends only new messages and rebuilds
 * segments.
 */
export function captureTranscriptSession(
  provider: PersistenceProvider,
  input: TranscriptCaptureInput,
): TranscriptCaptureResult {
  const sessionId = input.sessionId ?? `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Resolve messages from whichever input source was provided
  let messages = resolveMessages(sessionId, input);

  let messagesStored = 0;
  let segmentsStored = 0;
  let totalTokens = 0;

  provider.transaction(() => {
    // Ensure session row exists
    provider.run(
      `INSERT OR IGNORE INTO transcript_sessions
         (id, project_path, source_kind, source_ref, title, participants, tags, importance, started_at, ended_at, meta)
       VALUES (@id, @projectPath, @sourceKind, @sourceRef, @title, @participants, @tags, @importance, @startedAt, @endedAt, @meta)`,
      {
        id: sessionId,
        projectPath: input.projectPath ?? '.',
        sourceKind: input.sourceKind ?? 'imported_text',
        sourceRef: input.sourceRef ?? null,
        title: input.title ?? null,
        participants: JSON.stringify(input.participants ?? []),
        tags: JSON.stringify(input.tags ?? []),
        importance: input.importance ?? 0.5,
        startedAt: messages.length > 0 ? (messages[0].timestamp ?? null) : null,
        endedAt: messages.length > 0 ? (messages[messages.length - 1].timestamp ?? null) : null,
        meta: JSON.stringify({}),
      },
    );

    // Handle dedup: check for existing messages and only append new ones
    const existing = provider.get<{ max_seq: number | null }>(
      'SELECT MAX(seq) as max_seq FROM transcript_messages WHERE session_id = ?',
      [sessionId],
    );
    const maxExistingSeq = existing?.max_seq ?? -1;

    if (maxExistingSeq >= 0) {
      // Session already has messages — only append new ones
      messages = messages.filter((m) => m.seq > maxExistingSeq);
    }

    // Insert messages
    for (const msg of messages) {
      const tokenEst = msg.tokenEstimate || estimateTokens(msg.content);
      const hash = msg.contentHash || hashContent(msg.content);
      provider.run(
        `INSERT OR IGNORE INTO transcript_messages
           (id, session_id, seq, role, speaker, content, token_estimate, content_hash, timestamp, meta)
         VALUES (@id, @sessionId, @seq, @role, @speaker, @content, @tokenEstimate, @contentHash, @timestamp, @meta)`,
        {
          id: msg.id,
          sessionId,
          seq: msg.seq,
          role: msg.role,
          speaker: msg.speaker ?? null,
          content: msg.content,
          tokenEstimate: tokenEst,
          contentHash: hash,
          timestamp: msg.timestamp ?? null,
          meta: JSON.stringify(msg.meta ?? {}),
        },
      );
      totalTokens += tokenEst;
      messagesStored++;
    }

    // Rebuild segments: delete old ones and regenerate from all messages
    provider.run('DELETE FROM transcript_segments WHERE session_id = ?', [sessionId]);

    const allMessages = provider
      .all<Record<string, unknown>>(
        'SELECT * FROM transcript_messages WHERE session_id = ? ORDER BY seq',
        [sessionId],
      )
      .map(rowToMessage);

    const mode = input.segmentMode ?? 'exchange';
    const segments = segmentMessages(sessionId, allMessages, mode);

    for (const seg of segments) {
      provider.run(
        `INSERT INTO transcript_segments
           (id, session_id, seq_start, seq_end, kind, role_set, speaker_set, text, token_estimate)
         VALUES (@id, @sessionId, @seqStart, @seqEnd, @kind, @roleSet, @speakerSet, @text, @tokenEstimate)`,
        {
          id: seg.id,
          sessionId,
          seqStart: seg.seqStart,
          seqEnd: seg.seqEnd,
          kind: seg.kind,
          roleSet: JSON.stringify(seg.roleSet),
          speakerSet: JSON.stringify(seg.speakerSet),
          text: seg.text,
          tokenEstimate: seg.tokenEstimate,
        },
      );
      segmentsStored++;
    }

    // Recompute total token estimate from all messages
    const tokenSum = provider.get<{ total: number }>(
      'SELECT COALESCE(SUM(token_estimate), 0) as total FROM transcript_messages WHERE session_id = ?',
      [sessionId],
    );

    // Update session aggregates
    provider.run(
      `UPDATE transcript_sessions
         SET message_count = (SELECT COUNT(*) FROM transcript_messages WHERE session_id = @id),
             segment_count = @segmentCount,
             token_estimate = @tokenEstimate,
             updated_at = unixepoch()
       WHERE id = @id`,
      {
        id: sessionId,
        segmentCount: segmentsStored,
        tokenEstimate: tokenSum?.total ?? totalTokens,
      },
    );
  });

  return {
    captured: true,
    sessionId,
    messagesStored,
    segmentsStored,
    tokenEstimate: totalTokens,
  };
}

// ── Search ─────────────────────────────────────────────────────────────

/**
 * Search transcript segments via FTS.
 *
 * Returns raw candidates with FTS rank — the ranker module will re-rank
 * them later. Overfetches by 5x to give the ranker enough candidates.
 */
export function searchTranscriptSegments(
  provider: PersistenceProvider,
  query: string,
  options?: {
    projectPath?: string;
    sessionId?: string;
    sourceKind?: string;
    limit?: number;
  },
): Array<{
  segment: TranscriptSegment;
  sessionTitle?: string;
  sessionStartedAt?: number;
  sessionEndedAt?: number;
  rank: number;
}> {
  const limit = options?.limit ?? 10;
  const overfetchLimit = Math.max(limit * 5, 40);

  const filters: string[] = ['s.archived_at IS NULL'];
  const params: Record<string, unknown> = { query, limit: overfetchLimit };

  if (options?.projectPath) {
    filters.push('s.project_path = @projectPath');
    params.projectPath = options.projectPath;
  }
  if (options?.sessionId) {
    filters.push('ts.session_id = @sessionId');
    params.sessionId = options.sessionId;
  }
  if (options?.sourceKind) {
    filters.push('s.source_kind = @sourceKind');
    params.sourceKind = options.sourceKind;
  }

  const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  try {
    const rows = provider.all<Record<string, unknown>>(
      `SELECT ts.*, s.title, s.started_at, s.ended_at, rank
       FROM transcript_segments_fts fts
       JOIN transcript_segments ts ON ts.rowid = fts.rowid
       JOIN transcript_sessions s ON ts.session_id = s.id
       WHERE transcript_segments_fts MATCH @query ${whereClause}
       ORDER BY rank
       LIMIT @limit`,
      params,
    );

    return rows.map((row) => ({
      segment: rowToSegment(row),
      sessionTitle: (row.title as string) ?? undefined,
      sessionStartedAt: (row.started_at as number) ?? undefined,
      sessionEndedAt: (row.ended_at as number) ?? undefined,
      rank: row.rank as number,
    }));
  } catch {
    return [];
  }
}

// ── Retrieve ───────────────────────────────────────────────────────────

/**
 * Get a transcript session by ID.
 */
export function getTranscriptSession(
  provider: PersistenceProvider,
  sessionId: string,
): TranscriptSession | null {
  const row = provider.get<Record<string, unknown>>(
    'SELECT * FROM transcript_sessions WHERE id = ?',
    [sessionId],
  );
  return row ? rowToSession(row) : null;
}

/**
 * Get messages for a transcript session, optionally filtered by seq range.
 */
export function getTranscriptMessages(
  provider: PersistenceProvider,
  sessionId: string,
  range?: { seqStart?: number; seqEnd?: number },
): TranscriptMessage[] {
  const filters: string[] = ['session_id = @sessionId'];
  const params: Record<string, unknown> = { sessionId };

  if (range?.seqStart !== undefined) {
    filters.push('seq >= @seqStart');
    params.seqStart = range.seqStart;
  }
  if (range?.seqEnd !== undefined) {
    filters.push('seq <= @seqEnd');
    params.seqEnd = range.seqEnd;
  }

  const rows = provider.all<Record<string, unknown>>(
    `SELECT * FROM transcript_messages WHERE ${filters.join(' AND ')} ORDER BY seq`,
    params,
  );
  return rows.map(rowToMessage);
}

// ── Archive ────────────────────────────────────────────────────────────

/**
 * Soft-archive a transcript session.
 */
export function archiveTranscriptSession(
  provider: PersistenceProvider,
  sessionId: string,
): boolean {
  return (
    provider.run('UPDATE transcript_sessions SET archived_at = unixepoch() WHERE id = ?', [
      sessionId,
    ]).changes > 0
  );
}

// ── Row Mappers (private helpers) ──────────────────────────────────────

function rowToSession(row: Record<string, unknown>): TranscriptSession {
  return {
    id: row.id as string,
    projectPath: row.project_path as string,
    sourceKind: row.source_kind as TranscriptSession['sourceKind'],
    sourceRef: (row.source_ref as string) ?? undefined,
    title: (row.title as string) ?? undefined,
    participants: JSON.parse((row.participants as string) || '[]'),
    tags: JSON.parse((row.tags as string) || '[]'),
    importance: (row.importance as number) ?? 0.5,
    startedAt: (row.started_at as number) ?? undefined,
    endedAt: (row.ended_at as number) ?? undefined,
    messageCount: (row.message_count as number) ?? 0,
    segmentCount: (row.segment_count as number) ?? 0,
    tokenEstimate: (row.token_estimate as number) ?? 0,
    meta: JSON.parse((row.meta as string) || '{}'),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
    archivedAt: (row.archived_at as number) ?? undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): TranscriptMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    seq: row.seq as number,
    role: row.role as TranscriptMessage['role'],
    speaker: (row.speaker as string) ?? undefined,
    content: row.content as string,
    tokenEstimate: (row.token_estimate as number) ?? 0,
    contentHash: (row.content_hash as string) ?? undefined,
    timestamp: (row.timestamp as number) ?? undefined,
    meta: JSON.parse((row.meta as string) || '{}'),
  };
}

function rowToSegment(row: Record<string, unknown>): TranscriptSegment {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    seqStart: row.seq_start as number,
    seqEnd: row.seq_end as number,
    kind: row.kind as TranscriptSegment['kind'],
    roleSet: JSON.parse((row.role_set as string) || '[]'),
    speakerSet: JSON.parse((row.speaker_set as string) || '[]'),
    text: row.text as string,
    tokenEstimate: (row.token_estimate as number) ?? 0,
    createdAt: row.created_at as number,
  };
}

// ── Input Resolution ───────────────────────────────────────────────────

/**
 * Resolve the input into an array of TranscriptMessage objects, regardless
 * of whether the caller provided messages, text, or a file path.
 */
function resolveMessages(sessionId: string, input: TranscriptCaptureInput): TranscriptMessage[] {
  if (input.transcriptPath) {
    const parsed = parseTranscriptJsonl(input.transcriptPath);
    // Assign the real session ID and regenerate message IDs
    return parsed.map((msg, i) => {
      msg.id = `msg-${sessionId.slice(0, 8)}-${i}`;
      msg.sessionId = sessionId;
      msg.seq = i;
      return msg;
    });
  }

  if (input.text) {
    const content = input.text;
    return [
      {
        id: `msg-${sessionId.slice(0, 8)}-0`,
        sessionId,
        seq: 0,
        role: 'user',
        content,
        tokenEstimate: estimateTokens(content),
        contentHash: hashContent(content),
        meta: {},
      },
    ];
  }

  if (input.messages) {
    return input.messages.map((m, i) => ({
      id: `msg-${sessionId.slice(0, 8)}-${i}`,
      sessionId,
      seq: i,
      role: m.role,
      speaker: m.speaker,
      content: m.content,
      tokenEstimate: estimateTokens(m.content),
      contentHash: hashContent(m.content),
      timestamp: m.timestamp,
      meta: {},
    }));
  }

  return [];
}
