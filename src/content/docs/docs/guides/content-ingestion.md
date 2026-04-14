---
title: 'Content Ingestion'
description: 'Feed articles, documents, transcripts, and books into your vault. The agent extracts and classifies knowledge automatically.'
---

Your vault doesn't have to grow one pattern at a time. Content ingestion lets you feed entire documents into the agent (articles, meeting transcripts, PDF books, documentation pages) and the agent extracts knowledge items, classifies them, deduplicates against your existing vault, and stores what's new.

## Ingesting a URL

Found an article worth remembering? Feed it directly:

> **You:** "Ingest this article: https://example.com/distributed-systems-patterns"
>
> **Agent:** _Fetched and processed. 4 entries extracted, 1 duplicate skipped._
>
> - **Circuit Breaker Pattern** (pattern, distributed-systems)
> - **Bulkhead Isolation** (pattern, distributed-systems)
> - **Retry with Exponential Backoff** (pattern, distributed-systems)
> - ~~Timeout Best Practices~~ — already in vault

The agent fetches the page, extracts text, sends it through an LLM for classification, and checks each extracted item against your vault's content hashes. Duplicates are skipped automatically.

You can specify a domain and tags to organize the results:

> **You:** "Ingest https://example.com/k8s-security with domain: infrastructure, tags: kubernetes, security"
>
> **Agent:** _3 entries extracted and tagged._

## Ingesting text

For content that isn't at a URL, like meeting notes, copied text, or transcripts:

> **You:** "Ingest this transcript from our architecture review meeting..."
>
> **Agent:** _Processed as transcript. 5 entries extracted._

Source types help the LLM classify content more accurately:

| Source type    | Use for                                     |
| -------------- | ------------------------------------------- |
| article        | Blog posts, published articles              |
| transcript     | Meeting recordings, podcast transcripts     |
| notes          | Personal notes, quick captures              |
| documentation  | Technical docs, API references, READMEs     |

The agent uses source type as context for extraction. A transcript might yield decisions and action items, while documentation yields patterns and conventions.

## Batch ingestion

When you have multiple items to ingest at once:

> **You:** "Ingest these three items:
> 1. Our coding standards doc (text: '...')
> 2. The accessibility checklist (text: '...')
> 3. Meeting notes from sprint retro (text: '...')"
>
> **Agent:** _Batch complete: 3 sources processed, 11 entries extracted, 2 duplicates skipped._

Each item in a batch has its own title, source type, domain, and tags. Items are processed sequentially so deduplication works across the batch. If item 2 would create a duplicate of something item 1 just added, it's caught.

## Ingesting books (PDF)

For longer documents like PDF books, the agent uses a chunked pipeline:

### Step 1: Start the ingestion job

> **You:** "Ingest this book: /path/to/design-systems.pdf, title: 'Design Systems Handbook', domain: design, author: 'A. Smith'"
>
> **Agent:** _Job created: job-abc123. 24 chunks ready (10 pages each). Process chunks to extract knowledge._

The PDF is parsed, hashed (so re-ingesting the same file is detected), and split into page-window chunks. Nothing is extracted yet. This step just prepares the pipeline.

### Step 2: Process chunks

Process chunks in batches. This is where the LLM extracts and classifies knowledge:

> **You:** "Process 5 chunks of job-abc123"
>
> **Agent:** _Processed chunks 1-5. 18 entries extracted, 3 duplicates. 19 chunks remaining._

You can process all chunks at once or in smaller batches. Smaller batches give you a chance to review intermediate results and stop early if the quality drops.

### Step 3: Check status

> **You:** "What's the status of intake jobs?"
>
> **Agent:** _1 job:_
> - **job-abc123** — Design Systems Handbook: 5/24 chunks processed, 18 entries extracted

### Step 4: Preview before committing

If you want to see what the pipeline would extract from a specific page range without storing anything:

> **You:** "Preview pages 50-60 of design-systems.pdf"
>
> **Agent:** _Preview (not stored): 4 potential entries found in pages 50-60._

## What happens during ingestion

Every ingestion path follows the same core pipeline:

1. Extract text from URL, raw text, or PDF pages
2. Classify via LLM, identifying patterns, anti-patterns, decisions, conventions
3. Deduplicate with content-hash comparison against existing vault entries
4. Store new entries in the vault with domain, tags, and source metadata

The LLM does the heavy lifting of turning unstructured text into structured knowledge items. You don't need to manually tag or categorize. The agent infers type, severity, and domain from context.

## Tips for good ingestion

- Set a domain. It gives the LLM classification context and keeps your vault organized.
- Use accurate source types. A transcript is processed differently than documentation.
- Add tags. Tags applied at ingestion time propagate to all extracted entries.
- Preview first for books. Check a small page range before processing the whole thing.
- Don't worry about duplicates. The dedup pipeline handles them automatically.

## Related guides

- [Building a Knowledge Base](/docs/guides/knowledge-base/) - understand patterns and anti-patterns before bulk ingestion
- [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) - link ingested entries to existing knowledge for better discovery
- [Knowledge Review Workflow](/docs/guides/knowledge-review/) - submit ingested entries for team review before they go live
- [Capabilities](/docs/capabilities/) - full list of ingestion operations
- [API Reference](/docs/api-reference/) - parameter details for `ingest_url`, `ingest_text`, `ingest_batch`, `intake_ingest_book`

---

_Previous: [Entry Linking & Knowledge Graph](/docs/guides/entry-linking/) - connect entries with typed links. Next: [Knowledge Review Workflow](/docs/guides/knowledge-review/) - team quality control for vault entries._
