---
name: soleri-intake
tier: default
description: 'Triggers: "ingest this", "add this URL", "import this book", "read and capture", "ingest batch". Imports external content (URLs, text, books, batches) into vault with knowledge extraction.'
---

# Intake — Ingest External Content

Import external content (URLs, books, text, batch files) into the vault with automatic knowledge extraction. The intake skill handles chunking, entity extraction, and vault persistence so you don't have to do it manually.

## When to Use

- User pastes a URL ("save this article to vault")
- User shares a book or long document ("ingest this book into your knowledge base")
- User wants to capture raw text from an external source
- Batch importing multiple sources at once

## Orchestration

### Step 1: Identify Content Type

Determine what the user is providing:

| Type             | Use Op         | When                             |
| ---------------- | -------------- | -------------------------------- |
| URL              | `ingest_url`   | User pastes a web link           |
| Book / long doc  | `ingest_book`  | PDF, long markdown, or file path |
| Raw text         | `ingest_text`  | User pastes text directly        |
| Multiple sources | `ingest_batch` | List of URLs or file paths       |

### Step 2: Ingest

**URL:**

```
YOUR_AGENT_intake op:ingest_url
  params: {
    url: "<url>",
    domain: "<inferred domain>",
    tags: ["<tag1>", "<tag2>"]
  }
```

**Book / Long Document:**

```
YOUR_AGENT_intake op:ingest_book
  params: {
    path: "<file path or url>",
    title: "<document title>",
    domain: "<domain>",
    chunkStrategy: "chapter"
  }
```

**Raw Text:**

```
YOUR_AGENT_intake op:ingest_text
  params: {
    text: "<content>",
    title: "<descriptive title>",
    domain: "<domain>",
    tags: ["<tag>"]
  }
```

**Batch:**

```
YOUR_AGENT_intake op:ingest_batch
  params: {
    sources: [
      { type: "url", value: "<url1>" },
      { type: "url", value: "<url2>" }
    ],
    domain: "<domain>"
  }
```

### Step 3: Report Results

Present a summary table:

| Field               | Value             |
| ------------------- | ----------------- |
| **Entries created** | {count}           |
| **Domain**          | {domain}          |
| **Tags**            | {tags.join(', ')} |
| **Status**          | {status}          |

If any sources failed, list them with reasons so the user can retry.

## Exit Criteria

All content ingested, entry IDs confirmed, results reported to user.
