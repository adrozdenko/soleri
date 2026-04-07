# Raw Transcript Memory Lane — Implementation Plan

**Goal:** Implement a raw transcript memory lane in Soleri as a parallel exact-recall system alongside existing structured memory and vault knowledge.
**Architecture:** Add additive transcript tables to the existing SQLite vault, introduce transcript persistence and segmentation helpers, extend the memory facade with transcript capture/search/replay/promote operations, and add transcript-specific ranking without changing default vault search behavior.
**Tech Stack:** TypeScript, SQLite FTS5 via existing `PersistenceProvider`, `@soleri/core` memory facade, intake pipeline, optional embedding pipeline.

**Plan ID:** `plan-1775594409123-4qrj18`
**Status:** Draft
**Reference Design:** [2026-04-07-raw-transcript-memory-lane.md](/Users/adrozdenko/projects/soleri/docs/plans/2026-04-07-raw-transcript-memory-lane.md)

---

## Execution Order

```text
Wave 1:
  T1: Add transcript persistence schema
  T2: Define transcript types and segmentation

Wave 2:
  T3: Implement transcript persistence helpers

Wave 3 (parallel):
  T4: Add transcript memory facade operations
  T5: Add transcript ranking and source-aware memory search

Wave 4:
  T6: Integrate transcript ingestion path

Wave 5:
  T7: Add tests, safeguards, and rollout docs
```

Rationale:

- Schema and segmentation are the only irreversible foundations.
- Persistence must exist before facade ops can stay thin.
- Ranking and ops can move in parallel once the persistence contract is stable.
- Intake integration should happen after the raw capture path is proven.

---

## Scope

| Included | Excluded |
|----------|----------|
| `transcript_sessions`, `transcript_messages`, `transcript_segments`, `transcript_segments_fts` | Auto-capturing every chat session |
| Transcript segmentation and transcript-specific ranking | Merging transcript hits into default `search_intelligent` |
| `transcript_capture`, `transcript_search`, `transcript_session_get`, `transcript_promote` | New standalone transcript facade/module |
| `memory_search({ source })` extension | UI/dashboard work |
| Optional raw transcript write path from transcript intake | Chat runtime refactor |
| Tests for schema, persistence, ranking, and facade behavior | Backfill of legacy chat session JSON files |

---

## Alternatives Rejected

1. **Store raw transcripts in `memories`** — wrong granularity, wrong ranking model, and likely to pollute summary memory search.
2. **Merge transcript results into vault search by default** — mixes curated knowledge with raw evidence and degrades both result sets.
3. **Auto-capture all chat sessions in v1** — strong coupling to the chat subsystem, unclear retention policy, and easy storage blow-up.
4. **Use whole sessions as the retrieval unit** — too coarse for exact recall and quote retrieval.

---

## T1: Add Transcript Persistence Schema

**Files:**
- Modify: [vault-schema.ts](/Users/adrozdenko/projects/soleri/packages/core/src/vault/vault-schema.ts)
- Test: new transcript schema assertions in transcript tests or vault schema tests

**Steps:**

1. Add `transcript_sessions` table.
2. Add `transcript_messages` table.
3. Add `transcript_segments` table.
4. Add `transcript_segments_fts` virtual table.
5. Add insert/update/delete triggers for transcript FTS sync.
6. Add session, message-sequence, and segment-range indexes.
7. Ensure schema init remains additive and backward-compatible.

**Acceptance:**

- Fresh vaults create all transcript tables and indexes.
- Existing vaults migrate cleanly with no destructive changes.
- FTS triggers stay consistent after insert, update, and delete.

---

## T2: Define Transcript Types and Segmentation

**Files:**
- Create: `packages/core/src/transcript/types.ts`
- Create: `packages/core/src/transcript/segmenter.ts`
- Test: `packages/core/src/transcript/transcript.test.ts`

**Steps:**

1. Define transcript session, message, segment, and search-hit types.
2. Implement normalization for two input shapes:
   - explicit `messages[]`
   - raw `text`
3. Implement v1 exchange segmentation:
   - one `user` message plus following non-user responses until next user message
4. Implement fallback sliding-window segmentation for text imports without turn boundaries.
5. Add deterministic token estimate helpers and content hashing for messages.

**Acceptance:**

- Message arrays segment into stable exchange units.
- Raw imported text segments into bounded windows.
- Segmentation output is deterministic and testable without DB access.

---

## T3: Implement Transcript Persistence Helpers

**Files:**
- Create: `packages/core/src/vault/vault-transcripts.ts`
- Modify: exports from `packages/core/src/index.ts` if needed
- Test: `packages/core/src/transcript/transcript.test.ts`

**Steps:**

1. Add helper to create transcript sessions.
2. Add helper to append transcript messages in sequence.
3. Add helper to rebuild or write transcript segments for a session.
4. Add helper to fetch a session and replay exact messages by range.
5. Add archive/delete-safe behavior based on session IDs and `ON DELETE CASCADE`.
6. Keep this module parallel to [vault-memories.ts](/Users/adrozdenko/projects/soleri/packages/core/src/vault/vault-memories.ts), not mixed into it.

**Acceptance:**

- Transcript session write/read path works with exact ordering preserved.
- Segment rebuilds are idempotent for the same normalized input.
- Session replay can return exact ranges around a hit.

---

## T4: Add Transcript Memory Facade Operations

**Files:**
- Modify: [memory-facade.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/facades/memory-facade.ts)
- Modify: [memory-facade.test.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/facades/memory-facade.test.ts)

**Steps:**

1. Add `transcript_capture`.
2. Add `transcript_search`.
3. Add `transcript_session_get`.
4. Add `transcript_promote`.
5. Extend `memory_search` with:
   - `source: 'memory' | 'transcript' | 'all'`
6. Keep existing `memory_capture`, `session_capture`, and `memory_list` semantics unchanged.

**Acceptance:**

- Transcript ops are available through the memory facade.
- `memory_search({ source: 'memory' })` preserves current behavior.
- `memory_search({ source: 'transcript' })` searches only transcript segments.
- `memory_search({ source: 'all' })` returns labeled fused results.

---

## T5: Add Transcript Ranking and Source-Aware Memory Search

**Files:**
- Create: `packages/core/src/transcript/ranker.ts`
- Modify: `packages/core/src/vault/vault-transcripts.ts`
- Modify: [memory-facade.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/facades/memory-facade.ts)
- Test: `packages/core/src/transcript/transcript.test.ts`

**Steps:**

1. Query transcript FTS with overfetch.
2. Normalize BM25/FTS rank for the candidate pool.
3. Add re-ranking signals:
   - exact phrase
   - token overlap
   - temporal proximity
   - role/speaker match
   - session importance prior
4. Add optional vector contribution only when embeddings are already configured.
5. Implement source-aware fusion for `memory_search({ source: 'all' })`:
   - keep structured memories and transcript hits distinct in the response
   - avoid changing vault `search_intelligent`

**Acceptance:**

- Quoted/exact-match transcript spans outrank vague semantic matches.
- Time-anchored queries favor the correct session window.
- Role-specific queries can prioritize user vs assistant spans.
- Default vault search stays unchanged.

---

## T6: Integrate Transcript Ingestion Path

**Files:**
- Modify: [intake-ops.ts](/Users/adrozdenko/projects/soleri/packages/core/src/runtime/intake-ops.ts)
- Modify: [text-ingester.ts](/Users/adrozdenko/projects/soleri/packages/core/src/intake/text-ingester.ts)
- Modify: intake facade tests

**Steps:**

1. Add an optional raw transcript write path for `sourceType='transcript'`.
2. Keep existing structured classification and vault seeding intact.
3. Gate raw transcript write behind an explicit parameter such as:
   - `storeRawTranscript: true`
4. Store imported transcript text in the transcript lane using the fallback segmenter when turns are not explicit.

**Acceptance:**

- Transcript ingestion can store raw transcript sessions in parallel with structured vault capture.
- Non-transcript ingestion behavior is unchanged.
- Transcript ingestion does not require an LLM for raw transcript persistence itself.

---

## T7: Add Tests, Safeguards, and Rollout Docs

**Files:**
- Create/modify transcript tests
- Modify docs if implementation semantics diverge from the design doc

**Steps:**

1. Cover schema creation and migration.
2. Cover deterministic segmentation.
3. Cover transcript persistence and replay.
4. Cover transcript ranking behavior on exact phrase, time anchor, and role match cases.
5. Cover compatibility:
   - existing `memory_search`
   - existing `session_capture`
   - existing intake behavior
6. Document rollout limitations:
   - explicit capture only in v1
   - no default transcript merge into `search_intelligent`
   - no legacy chat-session backfill

**Acceptance:**

- New functionality is fully covered by unit/integration tests.
- Existing memory behavior does not regress.
- Implementation constraints remain documented.

---

## Recommended Implementation Notes

- Keep transcript storage under the existing vault database instead of inventing a second DB.
- Do not make transcript capture depend on the chat runtime in v1.
- Treat transcript hits as **evidence**, not as curated knowledge.
- Keep promotion pathways explicit:
  - raw transcript span -> structured memory
  - raw transcript span -> vault entry

---

## Risks

- **Storage growth**
  - Mitigation: explicit capture only in v1, archive support later.

- **Ranking noise**
  - Mitigation: transcript-specific ranking plus `source` filter.

- **Cross-module coupling with chat**
  - Mitigation: no automatic snapshotting in v1.

- **Overbuilding**
  - Mitigation: keep MVP to schema + persistence + transcript ops + ranking + tests.

---

## MVP Cut

If this needs to be reduced further, cut to:

1. T1 schema
2. T2 segmentation
3. T3 persistence
4. T4 ops:
   - `transcript_capture`
   - `transcript_search`
   - `transcript_session_get`
   - `memory_search.source`
5. T5 ranking without vector contribution
6. Basic tests

Defer:

- `transcript_promote`
- intake integration
- any chat-session integration

That still delivers the core product value:

- exact recall
- quote retrieval
- rationale recovery
- evidence layer for future promotion into Soleri knowledge
