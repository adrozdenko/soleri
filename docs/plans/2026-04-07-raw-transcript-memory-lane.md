# Raw Transcript Memory Lane

**Goal:** Add a raw transcript memory lane to Soleri so agents can retrieve exact prior exchanges, rationale, and wording without replacing the existing vault, brain, curator, and summary-memory loop.
**Architecture:** New transcript tables in the existing SQLite vault store raw messages plus searchable derived segments. New memory-facade transcript ops capture, search, and replay transcript spans. Existing structured memory and vault search remain intact; transcript retrieval is a parallel lane optimized for exact-history queries.
**Tech Stack:** TypeScript, SQLite FTS5 via existing `PersistenceProvider`, existing memory facade, optional embeddings via current embedding pipeline.

---

## Problem

Soleri currently compounds intelligence in two strong ways:

- The vault stores structured knowledge: patterns, rules, anti-patterns, playbooks.
- The memory system stores structured session summaries, lessons, and preferences.

That is the right architecture for compounding and governance, but it has a gap:

- `session_capture` stores a summary, not the exact conversation.
- `memory_search` retrieves summaries from `memories_fts`, not raw exchanges.
- Chat sessions are compacted and TTL-reaped in the chat subsystem, so exact wording is not a durable first-class retrieval path.

This makes the following query class weaker than it should be:

- "Why did we switch to X?"
- "What exactly did we say about auth last Tuesday?"
- "What did the assistant recommend before we rejected it?"
- "Find the exchange where we compared Clerk and Auth0."
- "Show the exact quote, not the distilled lesson."

The goal is not to replace structured knowledge with raw transcripts. The goal is to preserve a second lane for exact recall and rationale retrieval.

---

## Goals

- Preserve exact user, assistant, system, and tool messages for sessions that matter.
- Search raw transcript spans efficiently without polluting vault search semantics.
- Keep transcript retrieval inside the existing Soleri engine and SQLite stack.
- Support promotion from raw transcript span -> structured memory or vault entry.
- Make the transcript lane optional and additive, not a breaking change.

## Non-goals

- Replace the vault with transcript-first storage.
- Automatically store every transient chat session forever.
- Build a UI for transcript browsing in v1.
- Add a separate transcript MCP module in v1.
- Run LLM extraction during transcript capture by default.

---

## Proposed Architecture

Soleri will have three memory shapes after this change:

1. **Vault knowledge**
   - Durable, structured, governed, reusable.
   - Best for "what should we do?" and "what do we know?"

2. **Structured memories**
   - Session summaries, lessons, preferences.
   - Best for "what happened last time?" in compact form.

3. **Raw transcript lane**
   - Exact message history, segmented for retrieval.
   - Best for "what exactly did we say and why?"

### Core Decision

Do **not** extend the existing `memories` table to hold raw transcripts.

Reasons:

- Raw transcripts have different grain and much larger payloads.
- Search ranking for raw spans is different from summary ranking.
- Lifecycle policies differ: transcript spans are replayable artifacts, not just summaries.
- Keeping them separate avoids making `memory_search` noisy or slow by default.

### Retrieval Unit

The primary search unit is a **transcript segment**, not a whole session and not a single raw message.

For v1, the default segment is an **exchange**:

- one user message
- plus following assistant/system/tool messages
- until the next user message

Fallback for imported text without clear turns:

- fixed sliding windows over normalized lines/messages

Why segments:

- Whole sessions are too coarse.
- Single messages are too brittle.
- Exchange units preserve question-answer rationale with manageable token cost.

### Storage Layers

- `transcript_sessions` stores session-level metadata.
- `transcript_messages` stores exact ordered messages.
- `transcript_segments` stores derived retrieval units.
- `transcript_segments_fts` indexes segment text for retrieval.

Messages preserve fidelity. Segments optimize search.

---

## Schema

### New Tables

Add the following to [vault-schema.ts](/Users/adrozdenko/projects/soleri/packages/core/src/vault/vault-schema.ts):

```sql
CREATE TABLE IF NOT EXISTS transcript_sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(
    source_kind IN ('live_chat', 'imported_text', 'imported_file', 'external')
  ),
  source_ref TEXT,
  title TEXT,
  participants TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  started_at INTEGER,
  ended_at INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0,
  segment_count INTEGER NOT NULL DEFAULT 0,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS transcript_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES transcript_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  speaker TEXT,
  content TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  timestamp INTEGER,
  meta TEXT NOT NULL DEFAULT '{}',
  UNIQUE(session_id, seq)
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES transcript_sessions(id) ON DELETE CASCADE,
  seq_start INTEGER NOT NULL,
  seq_end INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('exchange', 'window')),
  role_set TEXT NOT NULL DEFAULT '[]',
  speaker_set TEXT NOT NULL DEFAULT '[]',
  text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE IF NOT EXISTS transcript_segments_fts USING fts5(
  id, session_id, text, role_set, speaker_set,
  content='transcript_segments',
  content_rowid='rowid',
  tokenize='porter unicode61'
);
```

### Triggers

Mirror the existing `entries_fts` and `memories_fts` pattern:

```sql
CREATE TRIGGER IF NOT EXISTS transcript_segments_ai AFTER INSERT ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(rowid,id,session_id,text,role_set,speaker_set)
  VALUES(new.rowid,new.id,new.session_id,new.text,new.role_set,new.speaker_set);
END;

CREATE TRIGGER IF NOT EXISTS transcript_segments_ad AFTER DELETE ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(
    transcript_segments_fts,rowid,id,session_id,text,role_set,speaker_set
  )
  VALUES('delete',old.rowid,old.id,old.session_id,old.text,old.role_set,old.speaker_set);
END;

CREATE TRIGGER IF NOT EXISTS transcript_segments_au AFTER UPDATE ON transcript_segments BEGIN
  INSERT INTO transcript_segments_fts(
    transcript_segments_fts,rowid,id,session_id,text,role_set,speaker_set
  )
  VALUES('delete',old.rowid,old.id,old.session_id,old.text,old.role_set,old.speaker_set);
  INSERT INTO transcript_segments_fts(rowid,id,session_id,text,role_set,speaker_set)
  VALUES(new.rowid,new.id,new.session_id,new.text,new.role_set,new.speaker_set);
END;
```

### Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_transcript_sessions_project
  ON transcript_sessions(project_path, archived_at);

CREATE INDEX IF NOT EXISTS idx_transcript_sessions_ended_at
  ON transcript_sessions(ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcript_messages_session_seq
  ON transcript_messages(session_id, seq);

CREATE INDEX IF NOT EXISTS idx_transcript_segments_session_range
  ON transcript_segments(session_id, seq_start, seq_end);
```

### Why This Shape

- `transcript_sessions` gives lifecycle, filters, and temporal ranking anchors.
- `transcript_messages` preserves exact replay and future export.
- `transcript_segments` allows search without forcing whole-session retrieval.
- The schema stays SQLite-native and follows Soleri's existing FTS patterns.

---

## Persistence API

Create a new persistence file:

- Create: `packages/core/src/vault/vault-transcripts.ts`

Recommended functions:

- `captureTranscriptSession(provider, input)`
- `appendTranscriptMessages(provider, sessionId, messages)`
- `rebuildTranscriptSegments(provider, sessionId, mode)`
- `searchTranscriptSegments(provider, query, options)`
- `getTranscriptSession(provider, sessionId)`
- `getTranscriptMessages(provider, sessionId, range)`
- `archiveTranscriptSession(provider, sessionId)`
- `promoteTranscriptSpan(provider, sessionId, seqStart, seqEnd)`

This should mirror the current extraction of memory ops into [vault-memories.ts](/Users/adrozdenko/projects/soleri/packages/core/src/vault/vault-memories.ts).

---

## Capture Flow

### V1 Capture Paths

1. **Explicit raw capture**
   - User or orchestration passes raw messages or transcript text into a new transcript op.

2. **Imported transcript capture**
   - `ingest_text` with `sourceType='transcript'` can optionally write to the raw transcript lane in addition to the structured vault path.

### V1 Message Segmentation

Default segmentation algorithm:

1. Sort messages by `seq`.
2. Start a new segment at each `user` message.
3. Include following `assistant`, `tool`, and `system` messages until the next `user`.
4. If no user messages exist, chunk by a sliding window:
   - target 1200-1800 chars
   - overlap 1 message

Store both:

- exact messages in `transcript_messages`
- derived searchable segments in `transcript_segments`

### Why Not Auto-Capture Every Chat Session in V1

Current chat state lives in the chat subsystem, persisted as JSON in [chat-session.ts](/Users/adrozdenko/projects/soleri/packages/core/src/chat/chat-session.ts). Auto-capturing every session creates cross-module lifecycle and retention questions immediately.

Recommended v1 rule:

- explicit capture only
- optional transcript write from transcript ingestion
- no silent always-on transcript archiving

Phase 2 can wire `session_capture` to snapshot chat sessions when the caller supplies chat session identifiers.

---

## Ops

Extend the existing `memory` facade instead of creating a new transcript facade in v1.

### 1. `transcript_capture`

**Purpose:** Persist raw transcript data as a searchable transcript session.

**Auth:** `write`

**Input schema:**

```ts
{
  projectPath?: string;
  sessionId?: string;
  title?: string;
  sourceKind?: 'live_chat' | 'imported_text' | 'imported_file' | 'external';
  sourceRef?: string;
  participants?: string[];
  tags?: string[];
  importance?: number;
  segmentMode?: 'exchange' | 'window';
  messages?: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    speaker?: string;
    timestamp?: number;
  }>;
  text?: string;
}
```

**Behavior:**

- Accept either `messages` or `text`.
- Normalize into ordered messages.
- Create/update a transcript session.
- Build transcript segments.

**Return:**

```ts
{
  captured: true;
  sessionId: string;
  messagesStored: number;
  segmentsStored: number;
  tokenEstimate: number;
}
```

### 2. `transcript_search`

**Purpose:** Search raw transcript segments directly.

**Auth:** `read`

**Input schema:**

```ts
{
  query: string;
  projectPath?: string;
  sessionId?: string;
  sourceKind?: 'live_chat' | 'imported_text' | 'imported_file' | 'external';
  role?: 'user' | 'assistant' | 'system' | 'tool';
  startedAfter?: number;
  startedBefore?: number;
  limit?: number;
  verbose?: boolean;
}
```

**Return (default):**

```ts
Array<{
  id: string;
  sessionId: string;
  title: string | null;
  excerpt: string;
  seqStart: number;
  seqEnd: number;
  score: number;
  breakdown: {
    bm25: number;
    exactPhrase: number;
    tokenOverlap: number;
    temporal: number;
    roleMatch: number;
    importance: number;
    vector?: number;
  };
  startedAt: number | null;
  endedAt: number | null;
}>
```

`verbose: true` also returns neighboring messages for context.

### 3. `transcript_session_get`

**Purpose:** Replay exact messages for a session or a range.

**Auth:** `read`

**Input schema:**

```ts
{
  sessionId: string;
  seqStart?: number;
  seqEnd?: number;
  aroundSeq?: number;
  before?: number;
  after?: number;
}
```

**Return:**

- session metadata
- exact ordered messages
- optional highlighted span

### 4. `transcript_promote`

**Purpose:** Turn a raw transcript span into structured memory or vault knowledge.

**Auth:** `write`

**Input schema:**

```ts
{
  sessionId: string;
  seqStart: number;
  seqEnd: number;
  target: 'memory' | 'vault';
  memoryType?: 'session' | 'lesson' | 'preference';
  entryType?: 'pattern' | 'anti-pattern' | 'rule' | 'playbook';
  title?: string;
  domain?: string;
  tags?: string[];
}
```

**Behavior:**

- extracts the exact span text
- stores citation metadata pointing back to transcript session and range
- for `memory`, creates a structured summary/lesson
- for `vault`, creates a draft or captured knowledge entry

### 5. `memory_search` extension

Add:

```ts
{
  source?: 'memory' | 'transcript' | 'all'; // default 'all'
}
```

Behavior:

- `memory` searches only structured memories
- `transcript` searches only transcript segments
- `all` fuses both result sets with source labels

This is the compatibility-preserving way to make raw recall available without changing vault search semantics.

---

## Ranking Changes

Raw transcript ranking should not reuse the vault's severity/domain weighting model. Transcript spans are historical evidence, not curated rules.

### Candidate Generation

1. Query `transcript_segments_fts`
2. Fetch `max(limit * 5, 40)` candidates
3. Re-rank in TypeScript

### Transcript Ranking Formula

For FTS-only mode:

```txt
score =
  0.35 * bm25Norm +
  0.20 * exactPhrase +
  0.15 * tokenOverlap +
  0.15 * temporal +
  0.10 * roleMatch +
  0.05 * importance
```

When embeddings are enabled:

```txt
score =
  0.25 * bm25Norm +
  0.15 * vector +
  0.20 * exactPhrase +
  0.15 * tokenOverlap +
  0.15 * temporal +
  0.05 * roleMatch +
  0.05 * importance
```

### Signal Definitions

- `bm25Norm`
  - normalized FTS5 rank across the candidate pool

- `exactPhrase`
  - 1.0 when quoted phrases or backticked tokens from the query appear exactly
  - 0.0 otherwise
  - partial match allowed for multi-token phrases

- `tokenOverlap`
  - weighted overlap for rare query tokens, filenames, commands, IDs, and backticked identifiers

- `temporal`
  - neutral `0.5` by default
  - boosted when query contains explicit or relative time anchors and session timestamps align

- `roleMatch`
  - neutral `0.5` by default
  - boosted when query implies speaker/role:
    - "what did I say"
    - "what did the assistant recommend"
    - "show the tool output"

- `importance`
  - session-level prior from `transcript_sessions.importance`
  - starts at `0.5`
  - can increase when spans are promoted or reused

### Context Stitching

After selecting top hits:

- attach `+/- 1` neighboring segment from the same session when available
- do **not** rank neighbors independently
- use neighbors only for verbose output and replay context

This keeps the result list precise while preserving surrounding rationale.

---

## Search Routing

### Keep `search_intelligent` Focused

Do **not** merge transcript results into vault `search_intelligent` by default in v1.

Reason:

- Vault search answers "what do we know?"
- Transcript search answers "what exactly happened?"

Merging them by default will degrade both result sets.

### Routing Rules

Queries should prefer the transcript lane when they contain signals like:

- "what did we say"
- "why did we decide"
- "show the exact"
- quoted phrases
- explicit dates or relative dates
- "who said"
- "last time we discussed"

Queries should prefer the vault lane when they contain signals like:

- "best practice"
- "pattern"
- "rule"
- "how should we"
- "what do we know about"

### Optional Follow-up

In a later phase, add:

```ts
search_intelligent({ includeTranscripts: true })
```

with transcript results merged as a low-priority evidence lane.

---

## Integration Points

### Memory Facade

Modify [memory-facade.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/facades/memory-facade.ts):

- add new transcript ops
- extend `memory_search`
- keep existing `session_capture` behavior unchanged in v1

### Schema Initialization

Modify [vault-schema.ts](/Users/adrozdenko/projects/soleri/packages/core/src/vault/vault-schema.ts):

- create transcript tables
- create transcript FTS table
- add triggers and indexes

### Transcript Ingestion

Modify [intake-ops.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/intake-ops.ts) and [text-ingester.ts](/Users/adrozdenko/projects/soleri/packages/core/src/intake/text-ingester.ts):

- add optional raw transcript write path for `sourceType='transcript'`
- keep current structured extraction path intact

Recommended flag:

```ts
ingest_text({
  sourceType: 'transcript',
  storeRawTranscript: true
})
```

### Chat Session Follow-up

Phase 2 only:

- add a helper that can load a persisted chat session snapshot from the chat session storage directory
- optionally extend `session_capture` with:

```ts
{
  captureTranscript?: boolean;
  chatSessionId?: string;
  chatStorageDir?: string;
}
```

This avoids forcing the memory facade to own live chat state in v1.

---

## Migration Strategy

### Database Migration

Safe additive migration only:

- new tables
- new triggers
- new indexes

No existing table changes are required for v1.

### Backfill

No automatic backfill for old chat session JSON files in v1.

Reason:

- chat session files are ephemeral and may not represent intentional durable memory
- backfill is easy to add later as a one-time CLI or admin op

Optional follow-up op:

- `transcript_import_chat_archive(storageDir, projectPath, limit?)`

---

## Files

### New

- `packages/core/src/vault/vault-transcripts.ts`
- `packages/core/src/transcript/segmenter.ts`
- `packages/core/src/transcript/ranker.ts`
- `packages/core/src/transcript/types.ts`
- `packages/core/src/transcript/transcript.test.ts`

### Modify

- `packages/core/src/vault/vault-schema.ts`
- `packages/core/src/runtime/facades/memory-facade.ts`
- `packages/core/src/runtime/facades/memory-facade.test.ts`
- `packages/core/src/runtime/intake-ops.ts`
- `packages/core/src/runtime/facades/intake-facade.test.ts`
- `packages/core/src/intake/text-ingester.ts`

### Optional Follow-up

- `packages/core/src/chat/chat-session.ts`
- `packages/core/src/runtime/facades/chat-session-ops.ts`

---

## Acceptance Criteria

### V1

- A caller can persist a raw transcript session with `transcript_capture`.
- Transcript messages and transcript segments are both stored.
- `transcript_search` returns exact excerpt hits with score breakdowns.
- `transcript_session_get` can replay exact messages around a hit.
- `memory_search({ source: 'all' })` returns both structured memory hits and transcript hits with clear source labels.
- Transcript data survives independently of chat compaction.
- Existing vault search behavior is unchanged by default.

### Ranking

- Exact quoted phrases outrank semantically similar but non-exact transcript spans.
- Date-anchored queries prefer sessions near the requested time.
- Role-specific queries prefer matching speaker/role spans.

---

## Risks

- **Storage growth**: raw transcripts are much larger than structured memories.
  - Mitigation: explicit capture in v1, per-session archive support later.

- **Noisy memory search**: fused transcript hits can drown out structured memories.
  - Mitigation: source filter plus source-aware ranking.

- **Cross-module coupling**: chat-session integration can become messy if memory reaches into chat runtime internals.
  - Mitigation: keep v1 explicit and file-based; defer automatic session snapshotting.

- **Search latency on long transcripts**: transcript segments can grow quickly.
  - Mitigation: bounded segment sizes, FTS over segments not whole sessions, additive indexes.

---

## Open Questions

- Should transcript sessions support retention policies per project?
- Should tool output be stored by default, or only when attached to a user/assistant exchange?
- Should promoted transcript spans increment session `importance` automatically?
- Should transcript ingestion support speaker-owned segment modes in v2 for adversarial recall cases?

---

## Recommended MVP Cut

Build only this first:

1. Schema
   - `transcript_sessions`
   - `transcript_messages`
   - `transcript_segments`
   - `transcript_segments_fts`

2. Ops
   - `transcript_capture`
   - `transcript_search`
   - `transcript_session_get`
   - `memory_search.source`

3. Ranking
   - FTS5 overfetch
   - exact phrase boost
   - token overlap
   - temporal boost
   - role match
   - no transcript/vector fusion yet unless embeddings are already configured

4. No automatic session snapshotting
   - explicit capture only
   - no `search_intelligent` merge by default

This gets Soleri the main value quickly:

- exact recall
- rationale retrieval
- quote retrieval
- clean separation from curated knowledge

without destabilizing the current vault and brain model.
