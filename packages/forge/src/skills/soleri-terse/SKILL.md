---
name: soleri-terse
tier: default
description: 'Triggers: "terse mode", "be brief", "less tokens", "fewer tokens", "compress output", "caveman", or invokes /terse. Token-efficient responses with full technical accuracy.'
---

# Terse Mode

Structural compression via word budgets. Benchmarked across all levels: lite 47%/7.8, full 66%/7.1, ultra 57%/8.5 (token reduction / quality out of 10, LLM-as-judge). Full is the recommended default.

## Activation Flow

### Step 1: Morph to Terse Mode

```
YOUR_AGENT_core op:morph
  params: { mode: "TERSE-MODE" }
```

Default level: **full**. Switch: `/terse lite`, `/terse full`, `/terse ultra`.

### Step 2: Confirm

State: "Terse mode active — level: {level}. Say 'stop terse' or 'normal mode' to revert."

## Persistence

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop terse" / "normal mode" / explicit deactivation.

## Intensity Levels

### lite (100 words max) — 47% reduction, 7.8/10 quality

Max 100 words prose. Code blocks exempt. No markdown headers. No bullet lists unless asked. Plain prose paragraphs. Answer direct question only — no edge cases, alternatives, or caveats unless asked. Never restate question, summarize, add closing lines, or use filler.

### full (60 words max) — DEFAULT — 66% reduction, 7.1/10 quality

Max 60 words prose. Code blocks exempt. No markdown headers, bullet lists, or numbered lists. Dense prose or single code block. Core answer only — one cause, one fix. No alternatives, no "also consider". Drop articles, fragments OK, shorter is better. Never restate, intro/outro, filler, hedging.

### ultra (30 words max) — 57% reduction, 8.5/10 quality

Max 30 words prose. Code blocks exempt. No markdown, lists, or headers. 1-3 raw sentences max. Single direct answer. Zero context, explanation, or alternatives. Abbreviate freely (DB/auth/config/req/res/fn/impl). Arrows for causality (X -> Y -> Z).

### Examples

"Why does this React component re-render?"

- lite: "Calling the setter schedules a re-render. React re-renders the entire component, not just the changed part. If props haven't changed but parent re-renders, child re-renders too. Fix with React.memo or useMemo for expensive computations."
- full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
- ultra: "Inline obj prop -> new ref -> re-render. `useMemo`."

"Fix my CORS error localhost:3000 to localhost:4000"

- lite: "Install the cors package. Add `app.use(cors({ origin: 'http://localhost:3000' }))` before your route definitions. If you're using cookies or auth headers, also set `credentials: true` in the cors options and `withCredentials: true` on your frontend requests."
- full: "Install cors package. Add `app.use(cors({ origin: 'http://localhost:3000' }))` before routes."
- ultra: "`app.use(cors({ origin: 'http://localhost:3000' }))`"

## Auto-Clarity

Drop terse mode automatically for:

- Security warnings
- Irreversible action confirmations
- Multi-step sequences where fragment ambiguity risks misread
- User asks to clarify or repeats question

Resume terse after the clear part is done.

## Boundaries

- Code blocks, commits, PRs: write normal — terse applies to prose, not code
- Agent persona preserved — terse compresses content density, not personality. Keep greeting style, tone, character markers. User should still know which agent is speaking.
- "stop terse" or "normal mode": revert immediately
- Level persists until changed or session ends
- Vault capture, knowledge, plans: write normal prose — terse is for conversation, not artifacts

## Exit Conditions

Terse mode deactivates when:

- User says "stop terse", "normal mode", or "verbose"
- Session ends
- Explicit deactivation: `op:morph params: { mode: "GENERAL-MODE" }`

## Quick Reference

| Action          | Command                       |
| --------------- | ----------------------------- |
| Activate (full) | `/terse` or "be brief"        |
| Switch to lite  | `/terse lite`                 |
| Switch to ultra | `/terse ultra`                |
| Deactivate      | "stop terse" or "normal mode" |
| Check level     | "what terse level?"           |
