---
name: soleri-compress
tier: default
description: 'Triggers: "compress this file", "compress CLAUDE.md", "compress memory", "shrink this", "reduce tokens in file", or invokes /compress. Compresses natural language files to save input tokens.'
---

# Compress

Compress natural language files (CLAUDE.md, instructions, vault notes) into terse format. Reduces input tokens ~40-50% while preserving all technical substance. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md`.

## When to Use

- CLAUDE.md files loaded every session (multiplied savings)
- Instruction files that are mostly prose
- Vault entry descriptions that are verbose
- Any markdown file where prose can be tightened

## When NOT to Use

- Code files (.ts, .js, .py, .json, .yaml, etc.)
- Config files (.env, .toml, .ini)
- Files that are already terse
- Files with `.original.md` suffix (backups)

## Process

### Step 1: Read and Classify

Read the target file. Classify it:

| Type                         | Action                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| Natural language (.md, .txt) | Proceed to compress                                               |
| Code / config                | Stop. Tell user: "Skipping — file is code/config, not prose."     |
| Mixed (prose + code blocks)  | Compress ONLY prose sections. Code blocks pass through unchanged. |

### Step 2: Backup

Before any modification, copy the original to `<filename>.original.md`.

**HARD-GATE: If `.original.md` backup already exists, STOP.** Tell user: "Backup already exists at {path}. Remove or rename it before re-compressing." This prevents accidental loss of the original.

### Step 3: Compress

Apply these rules to natural language sections only:

**Remove:**

- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" -> "to", "make sure to" -> "ensure", "the reason is because" -> "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

**Preserve EXACTLY (never modify):**

- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links
- File paths (`/src/components/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`, `docker build`)
- Technical terms (library names, API names, protocols)
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)
- YAML frontmatter

**Preserve Structure:**

- All markdown headings (keep exact heading text, compress body below)
- Bullet point hierarchy (keep nesting level)
- Numbered lists (keep numbering)
- Tables (compress cell text, keep structure)
- HTML comments (markers like `<!-- soleri:xxx -->`)

**Compress:**

- Use short synonyms: "big" not "extensive", "fix" not "implement a solution for"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets that say the same thing differently
- Keep one example where multiple examples show the same pattern

### Step 4: Validate

After compression, verify:

| Check         | How                                           |
| ------------- | --------------------------------------------- |
| Heading count | Same number of headings, same text            |
| Code blocks   | Byte-identical to original                    |
| URLs          | All URLs from original present in compressed  |
| File paths    | All paths from original present in compressed |
| Inline code   | All backtick content preserved                |
| Bullet count  | Within 15% of original (merging allowed)      |

### Step 5: Fix or Abort

If validation fails:

1. Identify the specific failure (missing URL, mangled code block, etc.)
2. Apply a targeted fix — do NOT recompress the entire file
3. Re-validate
4. If still failing after 2 fix attempts: restore original from backup, delete backup, report failure

### Step 6: Report

Tell user:

- Original size vs compressed size (line count or rough percentage)
- Backup location
- Any validation warnings (e.g., "3 bullets merged")

## Example

**Original:**

> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

**Compressed:**

> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

**Original:**

> The application uses a microservices architecture with the following components. The API gateway handles all incoming requests and routes them to the appropriate service. The authentication service is responsible for managing user sessions and JWT tokens.

**Compressed:**

> Microservices architecture. API gateway route all requests to services. Auth service manage user sessions + JWT tokens.

## Quick Reference

| Action           | Command                                   |
| ---------------- | ----------------------------------------- |
| Compress a file  | `/compress path/to/file.md`               |
| Check backup     | Look for `path/to/file.original.md`       |
| Restore original | Copy `.original.md` back to original path |
