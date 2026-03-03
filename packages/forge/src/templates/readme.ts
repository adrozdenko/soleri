import type { AgentConfig } from '../types.js';

/**
 * Generate a README.md for the scaffolded agent.
 */
export function generateReadme(config: AgentConfig): string {
  const domainRows = config.domains
    .map((d) => `| ${d} | *Ready for knowledge capture* |`)
    .join('\n');

  const principleLines = config.principles
    .map((p) => `- ${p}`)
    .join('\n');

  return `# ${config.name} — ${config.role}

${config.description}

## Why ${config.name}

Every team accumulates knowledge — patterns that work, mistakes to avoid, architectural decisions and their reasoning. Without a system, this knowledge lives in people's heads, scattered docs, or buried in Slack threads. When someone leaves or context shifts, it's gone.

${config.name} is your team's persistent knowledge layer. It:
- **Remembers** patterns, decisions, and lessons across sessions and projects
- **Retrieves** the right knowledge at the right time using intelligent search
- **Learns** from your feedback — accepted suggestions boost similar patterns, dismissed ones fade
- **Plans** multi-step tasks and tracks execution
- **Grows** with every interaction — the more you use it, the smarter it gets

The agent starts empty. That's intentional. Your expertise is the content; ${config.name} is the infrastructure that makes it searchable, persistent, and always available.

## Quick Start

\`\`\`bash
# 1. Install and build
cd ${config.id}
npm install
npm run build

# 2. Add to Claude Code
./scripts/setup.sh

# 3. Start a new Claude Code session, then say:
#    "Hello, ${config.name}!"
\`\`\`

That's it. ${config.name} will activate, check your setup, and offer to configure itself.

## Prerequisites

- **Node.js 18+** — \`node --version\` to check
- **Claude Code** — Anthropic's CLI for Claude (\`claude\` command)

## What Happens When You Say "Hello, ${config.name}!"

1. ${config.name} returns its persona, principles, and tool recommendations
2. Claude adopts the ${config.name} persona for the rest of the session
3. ${config.name} checks if your project has CLAUDE.md integration
4. If not, it offers to inject its configuration (facades table, intent detection, knowledge protocol)

## Manual Setup (if setup.sh doesn't work)

Add this to \`~/.claude/settings.json\` under \`mcpServers\`:

\`\`\`json
{
  "mcpServers": {
    "${config.id}": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/${config.id}"
    }
  }
}
\`\`\`

Then restart Claude Code.

## Domains

| Domain | What it covers |
|--------|---------------|
${domainRows}

## Core Principles

${principleLines}

## Features

### Knowledge Vault
SQLite-backed knowledge storage with FTS5 full-text search. Domains start empty and grow as you capture patterns.

### Intelligence Layer (Brain)
A local, zero-dependency intelligence layer that sits between facades and vault:
- **TF-IDF + Hybrid Scoring** — Re-ranks search results across 5 dimensions: semantic similarity (40%), severity (15%), recency (15%), tag overlap (15%), domain match (15%)
- **Auto-Tagging** — Extracts tags from title + description using TF-IDF scoring on capture
- **Duplicate Detection** — Checks similarity before capture: blocks at >= 0.8, warns at >= 0.6
- **Adaptive Weights** — Tracks accepted/dismissed results; after 30+ feedback entries, scoring weights auto-tune
- **Graceful Degradation** — Works immediately on empty vaults; falls back to severity + recency when vocabulary is empty

### Memory System
Captures session summaries, lessons learned, and user preferences. Memories persist across sessions and are searchable.

### Session Capture
A PreCompact hook automatically captures session summaries before context compaction, preserving context across sessions.

### Planning
Multi-step task planning with state machine: draft → approved → executing → completed. Plans are surfaced on activation.

### Export
Export vault knowledge as JSON bundles for version control and sharing.

### LLM Client (Optional)
Unified OpenAI/Anthropic client with multi-key rotation, circuit breakers, and model routing. Works without configuration — capabilities unlock when API keys are provided.

**Setup:**
Create \`~/.${config.id}/keys.json\`:
\`\`\`json
{
  "openai": ["sk-..."],
  "anthropic": ["sk-ant-..."]
}
\`\`\`

Or set environment variables: \`OPENAI_API_KEY\`, \`ANTHROPIC_API_KEY\`.

**Model routing** (optional) — \`~/.${config.id}/model-routing.json\`:
\`\`\`json
{
  "routes": [],
  "defaultOpenAIModel": "gpt-4o-mini",
  "defaultAnthropicModel": "claude-sonnet-4-20250514"
}
\`\`\`

Use \`llm_status\` to check provider availability and key pool health.

## How to Use

### Activating and Deactivating

- **"Hello, ${config.name}!"** — Activate the persona. Claude adopts ${config.name}'s identity, principles, and tool access for the session.
- **"Goodbye, ${config.name}!"** — Deactivate. Claude returns to its default behavior.

### Daily Workflow

Once active, ${config.name} works as your domain advisor. Here's how a typical session looks:

**Ask for guidance** — ${config.name} searches its vault and responds with relevant patterns:
\\\`\\\`\\\`
You:    How should we handle rate limiting?
${config.name}:  [searches vault] Based on my patterns, here's what I recommend...
\\\`\\\`\\\`

**Capture knowledge** — When you discover something worth remembering, tell ${config.name} to capture it:
\\\`\\\`\\\`
You:    We decided to use token bucket for rate limiting. Capture this as a pattern.
${config.name}:  [captures to vault with auto-tags: rate-limiting, token-bucket, api-design]
\\\`\\\`\\\`

**Plan multi-step work** — For larger tasks, ${config.name} creates trackable plans:
\\\`\\\`\\\`
You:    Plan out the caching implementation.
${config.name}:  Created plan "Add Caching Layer" with 4 tasks:
        1. Define cache invalidation strategy
        2. Add Redis client configuration
        3. Implement cache middleware
        4. Add cache-related tests
        Approve to start execution?
\\\`\\\`\\\`

**Give feedback** — When ${config.name} suggests something, your response teaches it:
\\\`\\\`\\\`
You:    That pattern doesn't apply here — we're using GraphQL, not REST.
${config.name}:  [records feedback] Got it. I'll adjust future recommendations.
\\\`\\\`\\\`

**Search across sessions** — Knowledge persists. Next week, next month, different project:
\\\`\\\`\\\`
You:    What did we decide about rate limiting last month?
${config.name}:  [searches vault + memory] You chose token bucket with...
\\\`\\\`\\\`

### Key Operations

| What you want | What to say |
|---------------|-------------|
| Search knowledge | Ask any domain question |
| Capture a pattern | "Capture this as a pattern" / "Remember this" |
| Create a plan | "Plan out [task]" |
| Check vault health | "What's in your vault?" / "Vault stats" |
| Export knowledge | "Export your knowledge as JSON" |
| Check LLM status | "LLM status" (if API keys configured) |

## Populating Your Agent

${config.name} starts with an empty vault. Here's how to fill it with knowledge.

### One at a Time (conversational capture)

The simplest way — tell ${config.name} what you've learned and ask it to capture:

\\\`\\\`\\\`
You:    We decided to use token bucket for rate limiting with a 100 req/min limit.
        Capture this as a pattern in api-design.

${config.name}:  [captures to vault]
        Captured: api-rate-limiting (pattern, warning)
        Auto-tags: rate-limiting, token-bucket, api-design
\\\`\\\`\\\`

### Bulk Ingestion (document feed)

To populate the vault from existing documents (architecture docs, coding standards, RFCs, post-mortems), paste or reference the document and ask ${config.name} to extract patterns:

\\\`\\\`\\\`
You:    Here's our API design guide: [paste content or file path]
        Read through it and capture every pattern, anti-pattern, and rule
        into the api-design domain.

${config.name}:  [reads document, extracts and captures each pattern]
        Captured 12 entries:
        - api-auth-jwt (pattern, critical) — Always use short-lived JWTs
        - api-no-sql-in-controllers (anti-pattern, warning) — Keep SQL in data layer
        - api-pagination-required (rule, warning) — All list endpoints must paginate
        ...
\\\`\\\`\\\`

This works with any text: wiki pages, Slack threads, PR review comments, meeting notes. Claude acts as the intake pipeline — it reads, classifies, and calls \\\`capture\\\` for each extracted entry.

### JSON Bundles (manual or scripted)

For programmatic loading, edit the JSON files directly:

\\\`\\\`\\\`json
// src/intelligence/data/api-design.json
{
  "domain": "api-design",
  "version": "1.0.0",
  "entries": [
    {
      "id": "api-auth-jwt",
      "type": "pattern",
      "domain": "api-design",
      "title": "Use short-lived JWTs for authentication",
      "severity": "critical",
      "description": "Issue JWTs with 15-minute expiry...",
      "tags": ["auth", "jwt", "security"]
    }
  ]
}
\\\`\\\`\\\`

Then rebuild (\\\`npm run build\\\`) to pick up the changes. Entries from JSON bundles load on startup.

### Tips for Building a Useful Vault

- **Start with your team's top 10 decisions** — the ones people keep asking about
- **Capture anti-patterns from real incidents** — what went wrong and why
- **Use severity wisely** — \\\`critical\\\` for must-follow rules, \\\`warning\\\` for strong recommendations, \\\`suggestion\\\` for nice-to-haves
- **Let auto-tagging work** — the Brain extracts tags from titles and descriptions automatically. You can add manual tags too, but you don't have to
- **Export regularly** — \\\`export\\\` dumps your vault to JSON for version control and sharing with teammates

## Growing Your Agent

${config.name} gets smarter through use — no code changes needed:

1. **Capture patterns** — Every time you capture a decision, pattern, or lesson, the vault grows. The Brain auto-tags entries and detects duplicates.
2. **Give feedback** — Accept or dismiss suggestions. After 30+ feedback entries, the Brain auto-tunes its scoring weights to match your preferences.
3. **Use memory** — Session summaries are captured automatically before context compaction. Lessons and preferences persist across sessions.
4. **Register projects** — Register ${config.name} with multiple projects. It builds context about each one and surfaces relevant knowledge on activation.
5. **Export and share** — Export vault knowledge as JSON. Share bundles with teammates or back them up in version control.

The more you interact, the more valuable ${config.name} becomes. A fresh agent with 50+ captured patterns and a month of feedback is significantly more useful than one on day one.

## Roadmap

${config.name} ships with a solid foundation. Below are optional improvements you can add yourself, ordered by impact.

### 1. Curator Pipeline
**What:** Background vault maintenance — tag normalization, duplicate merging, quality scoring, stale entry detection.
**Why:** Without grooming, vault quality degrades over time. Tags drift, duplicates accumulate, outdated entries linger.
**How:** Add a \`src/curator/\` module with: a job queue (SQLite-backed), a groom pipeline that scans entries on a schedule, a tag normalizer that consolidates synonyms, and a duplicate detector that merges near-identical entries. Wire it as a \`curator\` facade with ops like \`groom\`, \`scan\`, \`normalize_tags\`, \`merge_duplicates\`. Can optionally use the LLM client for GPT-powered classification.

### 2. Document Intake
**What:** Ingest documents (PDF, markdown, text) into the vault automatically — extract content, classify it, deduplicate, and write entries.
**Why:** Manual knowledge entry is the biggest friction point. An intake pipeline lets you point at reference material and populate the vault.
**How:** Add a \`src/intake/\` module with: a content extractor (start with markdown/text, add PDF via \`pdf-parse\`), a chunker that splits long documents into entry-sized pieces, a classifier that assigns domain/type/severity (can use LLM or heuristics), and a dedup gate that checks against existing entries before writing. Expose as an \`intake\` facade op.

### 3. Learning Loop
**What:** Turn accumulated feedback into measurable improvement — track which suggestions get accepted vs dismissed, extract user preferences, adjust scoring.
**Why:** The Brain already records feedback and tunes weights after 30+ entries. A full learning loop goes further: it builds a preference profile, identifies which patterns resonate, and deprioritizes ones that get consistently dismissed.
**How:** Add a \`src/learning/\` module with: a feedback analyzer that aggregates accept/dismiss rates per tag and per domain, a preference extractor that builds a user profile from feedback patterns, and a scoring adjuster that feeds insights back into the Brain's weight tuner. Run periodically or trigger after N new feedback entries.

### 4. Embeddings & Vector Search
**What:** Supplement TF-IDF with embedding-based semantic search using OpenAI's embedding API.
**Why:** TF-IDF is keyword-based — it misses semantic similarity (e.g., "auth" vs "authentication"). Embeddings capture meaning, not just words.
**How:** Add an embedding service that calls OpenAI's \`text-embedding-3-small\` via the LLM client, stores vectors in a \`vault_embeddings\` table, and adds a vector similarity search path to the Brain. Use cosine similarity to rank. Falls back to TF-IDF when no API key is configured.

### 5. Cross-Project Memory
**What:** Share knowledge and memories across projects — a global pattern pool, project linking, and unified search.
**Why:** Lessons learned in one project often apply to others. Without cross-project memory, each project starts from zero.
**How:** Extend the memory system with: a global pool table that stores entries visible to all projects, project link records that connect related projects, and a cross-project search op that queries across all registered projects. Add \`scope\` (project/global) to memory entries.

### 6. Context Engine
**What:** Semantic analysis of user messages — intent classification, entity extraction, and context-aware knowledge retrieval.
**Why:** Currently the agent responds to explicit ops. A context engine lets it understand *what the user means* and proactively retrieve relevant knowledge.
**How:** Add a \`src/context/\` module with: an intent classifier (rule-based patterns like "how do I" → PLAN, "this is broken" → FIX), an entity extractor that pulls domain-specific terms from messages, and a knowledge retriever that combines intent + entities to query the vault. Can start rule-based and upgrade to LLM-powered later.

### 7. Proactive Agency
**What:** The agent doesn't just answer — it anticipates, warns, and suggests without being asked.
**Why:** Moves the agent from reactive (Q&A) to proactive (advisor). Catches issues before they become problems.
**How:** Add a \`src/agency/\` module with: a suggestion generator that surfaces relevant patterns based on context, a warning detector that flags potential issues (e.g., anti-patterns in captured code), and a notification system that delivers insights at the right moment. Wire into Claude Code hooks for file-change triggers.

### 8. Plugin System
**What:** Runtime-extensible architecture — load, validate, and hot-reload plugins that add new facades, ops, or intelligence.
**Why:** Lets users extend the agent without modifying core code. Third parties can publish domain-specific plugins.
**How:** Add a \`src/plugins/\` module with: a plugin loader that scans a directory for plugin packages, a validator that checks plugin manifests against a schema, a registry that tracks active plugins and their facades, and a hot-reload watcher. Each plugin exports a \`register()\` function that receives the vault and brain instances.
`;
}
