---
title: Transcript Memory Lane
description: Capture and search raw conversation transcripts for exact recall, session replay, and knowledge extraction.
---

Your agent has three memory shapes:

| Shape | Question it answers | Source |
| ----- | ------------------- | ------ |
| Vault knowledge | "What should we do?" | Patterns, rules, playbooks |
| Structured memories | "What happened?" | Session summaries, lessons |
| **Raw transcripts** | "What did we SAY?" | Exact conversation content |

Transcript Memory Lane captures your Claude Code JSONL transcripts, indexes them with FTS5, and makes them searchable alongside vault and memory.

## How capture works

Transcripts are captured automatically via two Claude Code hooks:

- **PreCompact** — fires before context compaction, saving the conversation before compression
- **Stop** — fires when the session ends, capturing the final transcript

Both hooks are installed automatically when you run `soleri install`. They parse the Claude Code payload (transcript path, session ID, working directory) and store messages in the vault database.

The hooks are idempotent and always exit 0 — they never block Claude Code, even if capture fails.

### Manual capture

You can also capture transcripts directly:

```
transcript_capture({
  title: "API Design Discussion",
  participants: ["User", "Claude"],
  tags: ["api", "design"],
  messages: [
    { role: "user", content: "How should we handle auth?" },
    { role: "assistant", content: "JWT with refresh tokens..." }
  ]
})
```

Or point it at a JSONL file:

```
transcript_capture({
  transcriptPath: "~/.claude/transcripts/session-abc.jsonl",
  title: "Refactoring Session"
})
```

## Searching transcripts

Search across all captured conversations:

```
transcript_search({ query: "OAuth implementation" })
```

Returns ranked results with excerpts centered on the best match. Each hit includes the session ID, message range, and a relevance score.

### Filtering

Narrow results by project, session, source type, or role:

```
transcript_search({
  query: "error handling",
  projectPath: "/Users/me/my-project",
  role: "assistant",
  limit: 5
})
```

### Combined search

Search transcripts and memories together:

```
memory_search({
  query: "authentication",
  source: "all"
})
```

Returns `{ memories: [...], transcripts: [...] }` side by side.

## Session replay

Pull exact messages from a captured session:

```
transcript_session_get({
  sessionId: "ts-abc123",
  aroundSeq: 50,
  before: 5,
  after: 5
})
```

Returns 11 messages centered around message 50 — word-for-word, as they happened.

## Promoting to vault or memory

Found something worth keeping? Promote a message range to structured knowledge:

```
transcript_promote({
  sessionId: "ts-abc123",
  seqStart: 30,
  seqEnd: 45,
  target: "vault",
  entryType: "pattern",
  title: "JWT refresh token strategy",
  domain: "auth"
})
```

The promoted entry includes a citation back to the original transcript, so you can always trace where knowledge came from.

## How ranking works

Search uses a three-signal ranking system:

| Signal | Weight | What it measures |
| ------ | ------ | ---------------- |
| BM25 | 45% | Full-text relevance via SQLite FTS5 |
| Exact phrase | 30% | Quoted phrases and code tokens found in text |
| Token overlap | 25% | Rare tokens (code identifiers, paths) weighted 2x |

Excerpts are centered on the highest query term density, not just the first match.

## Segmentation

Messages are grouped into searchable segments using one of two modes:

- **Exchange** (default) — groups by user turn: each segment is a user message plus all following responses. Splits at ~4000 tokens.
- **Window** — sliding character-based window with overlap. Better for continuous documents or imported text.

Set the mode per capture:

```
transcript_capture({
  segmentMode: "window",
  text: "Long meeting transcript..."
})
```

## Operations reference

| Operation | What it does |
| --------- | ------------ |
| `transcript_capture` | Store a transcript session (from messages, text, or JSONL file) |
| `transcript_search` | Search across all transcript segments |
| `transcript_session_get` | Replay exact messages from a session |
| `transcript_promote` | Promote a message range to vault or memory |
| `memory_search` (source: "transcript") | Search transcripts via the memory facade |

## Requirements

- **Node.js 18+** (for capture hook script)
- **jq** on PATH (for JSON parsing in the shell hook)
- Hooks are installed automatically by `soleri install`
