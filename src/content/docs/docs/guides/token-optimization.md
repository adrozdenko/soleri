---
title: 'Token Optimization'
description: 'Reduce LLM token usage with terse mode, RTK compression, and the compress skill. Practical combos for different cost and speed targets.'
---

Tokens cost money, eat context window, and add latency. When your agent reads a 500-line test suite dump or writes a long explanation you already understand, that's waste.

Soleri has three tools for this. Use them independently or stack them.

## The three levers

| Tool | What it compresses | Direction | Savings |
|------|--------------------|-----------|---------|
| **Terse mode** | Agent output (responses) | Output tokens | ~65-75% |
| **RTK** | Shell command output (build logs, git status, test results) | Input tokens | ~60-90% |
| **Compress skill** | CLAUDE.md, instruction files, memory files | Input tokens | ~40-50% |

Output tokens are what the agent writes back to you. Input tokens are what the agent reads before responding. Cut both and you save the most.

## Terse mode

Terse mode strips filler from agent responses: articles, hedging, pleasantries, redundant phrasing. Technical substance stays intact.

### Three intensity levels

| Level | What changes | Example |
|-------|-------------|---------|
| **lite** | Drops filler and hedging. Keeps articles and full sentences. | "Your component re-renders because you create a new object reference each render. Wrap it in `useMemo`." |
| **full** | Drops articles too. Fragments OK. Short synonyms. This is the default. | "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`." |
| **ultra** | Abbreviations (DB/auth/config/req/res/fn/impl), arrows for causality, maximum density. | "Inline obj prop -> new ref -> re-render. `useMemo`." |

### Activating terse mode

**Option 1: Auto-activate on every session** (recommended)

Install the hook pack and forget about it:

```bash
npx @soleri/cli hooks add-pack terse-auto
```

This adds a SessionStart hook that activates terse mode automatically.

**Option 2: Manual toggle**

Activate on demand with the skill:

```
/terse          # activates at "full" level
/terse lite     # lighter touch
/terse ultra    # maximum compression
```

Or just say it naturally: "be brief", "less tokens", "compress output".

**Turning it off:**

Say "stop terse" or "normal mode". Terse mode also ends when the session ends.

### What stays clear

Terse mode drops back to normal prose for security warnings, irreversible action confirmations, and anything where fragments could cause ambiguity. Resumes after the critical section.

Code blocks, commit messages, and PR descriptions are written normally. Terse only applies to conversation.

## RTK token compression

[RTK](https://github.com/rtk-ai/rtk) intercepts shell commands and compresses their output before it reaches the LLM context. A `git status` can dump 40 lines. Test runner output, build logs, file listings, even worse. The agent reads all of it, and most of it is noise.

RTK rewrites Bash commands through a proxy that strips the noise. Works with 70+ commands across git, JS/TS, Python, Go, Ruby, Rust, Docker, and more.

### Installing

```bash
brew install rtk-ai/tap/rtk        # install RTK (>= 0.23.0)
brew install jq                     # required dependency
npx @soleri/cli hooks add-pack rtk  # install the hook pack
```

The hook pack adds a PreToolUse hook on `Bash` commands. Every shell command goes through RTK automatically.

### What it looks like

With RTK, a 40-line `git status` becomes a 5-8 line summary. Same information (which files changed, staged, untracked), fewer tokens on formatting.

The 60-90% reduction depends on the command. Verbose test runners and build tools see the biggest gains. Short commands with minimal output save less, but they don't cost much anyway.

## Compress skill

The `/compress` skill targets files that load into context on every session: your CLAUDE.md, instruction files, and memory files. These are read every time, so even small reductions multiply across conversations.

### How it works

```
/compress path/to/CLAUDE.md
```

The skill reads the file, strips filler words and redundant phrasing from prose sections, and overwrites the original. Code blocks, URLs, file paths, inline code, and technical terms stay byte-identical. A backup gets saved as `CLAUDE.md.original.md` so you can restore.

### When to use it

- After your CLAUDE.md has grown past a few hundred lines
- After your instruction files stabilize and you're done editing them frequently
- On memory files that have accumulated verbose session notes

### When to skip it

Don't compress files you're still actively editing. The backup guard prevents double-compression (it won't run if a `.original.md` already exists), but it's easier to compress once things settle.

Don't run it on code, config, YAML, or JSON files. The skill detects these and skips them automatically.

## Choosing your stack

Not everyone needs all three. Pick the combo that matches how you work:

### Minimal: just terse mode

```bash
npx @soleri/cli hooks add-pack terse-auto
```

Good for developers who want leaner responses without installing external tools. No dependencies, nothing to set up. Cuts output tokens by ~65-75%.

### Balanced: terse + RTK

```bash
npx @soleri/cli hooks add-pack terse-auto
npx @soleri/cli hooks add-pack rtk
```

Good for daily development where you run a lot of shell commands. Cuts both input and output tokens. Probably the sweet spot for most people.

### Aggressive: all three

```bash
npx @soleri/cli hooks add-pack terse-auto
npx @soleri/cli hooks add-pack rtk
```

Then compress your stable files:

```
/compress CLAUDE.md
/compress instructions/user.md
```

Good for long sessions, large CLAUDE.md files, or when you're watching costs closely.

## What NOT to compress

Some things should never be shortened, and all three tools respect that:

- Code blocks stay byte-identical. Terse mode doesn't touch code. Compress preserves fenced and indented blocks. RTK doesn't modify source files.
- Error messages and stack traces are quoted exactly. Terse keeps errors verbatim. Compress preserves inline code.
- Security warnings trigger an auto-clarity override in terse mode, dropping back to full prose so nothing gets misread.
- URLs, file paths, and commands pass through untouched. Technical terms stay exact.

If changing a word could change the meaning, it doesn't get changed.

---

_Next: [Customizing Your Agent](/docs/guides/customizing/) for hooks, domains, and governance. See also [Skills Catalog](/docs/guides/skills-catalog/) for the full list of available skills._
