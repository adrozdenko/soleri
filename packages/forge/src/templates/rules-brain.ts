/**
 * Engine rules: brain — included when agent uses brain.
 * Part of the modular shared-rules system.
 */
export function getRulesBrain(): string {
  return `
<!-- soleri:brain -->
## Brain-Informed Work

- Brain patterns surface at session start. For relevant patterns, pull rules just-in-time from the vault.
- Brain tells you **which** patterns matter (names + strength scores). Vault tells you **what** they are (rules, examples).
- Pull only what's relevant to the current task — don't load everything at session start.

### Second Brain Features

| Feature | How to use |
|---------|-----------|
| **Two-pass search** | \`op:search_intelligent\` with \`mode: "scan"\` for lightweight results, then \`op:load_entries\` for full content. See **Vault Search Strategy**. |
| **Session briefing** | \`op:session_briefing\` on session start — surfaces last session, active plans, recent captures, brain recommendations |
| **Evidence reconciliation** | \`op:plan_reconcile_with_evidence\` — cross-references plan tasks against git diff |
| **Learning radar** | \`op:radar_analyze\` to detect patterns from corrections, search misses, workarounds. \`op:radar_candidates\` to review, \`op:radar_approve\`/\`op:radar_dismiss\` |
| **External ingestion** | \`op:ingest_url\` for articles, \`op:ingest_text\` for transcripts/notes, \`op:ingest_batch\` for multiple items |
| **Content synthesis** | \`op:synthesize\` — turn vault knowledge into briefs, outlines, talking points, or post drafts |
| **Skill chains** | \`op:chain_execute\` — multi-step workflows with data flow between steps and approval gates |

### Brain Feedback Loop

After using a vault search result to inform a decision, action, or response, call \`op:record_feedback\` with:
- \`query\`: the original search query
- \`entryId\`: the vault entry ID that was used
- \`action\`: "accepted" (result was useful) or "rejected" (result was irrelevant/wrong)
- \`confidence\`: 0.0–1.0 how relevant the result was to the task

Do this for:
- \`search_intelligent\` results that influence your next action
- \`orchestrate_plan\` vault recommendations you follow
- Vault entries you cite or reference in responses

Do NOT record feedback for:
- Existence checks ("do we have X?" — just scanning, not using)
- Results you browse but don't act on
- Duplicate feedback for the same entry in the same task
<!-- /soleri:brain -->

<!-- soleri:model-routing -->
## Model Routing Guidance

Different workflow stages benefit from different model strengths. Use this as a default when multiple models are available.

| Stage | Recommended Model | Why |
|-------|------------------|-----|
| Research / Exploration | Opus | Cross-file reasoning, broad context synthesis |
| Planning / Architecture | Opus | Complex tradeoff analysis, alternative evaluation |
| Implementation | Sonnet | Speed, cost-efficiency for focused coding |
| Code Review / Verification | Opus | Deep analysis, false-positive filtering |
| Validation Gates | Haiku | Fast, cheap pass/fail checks |
| Knowledge Capture | Sonnet | Structured extraction, good enough quality |

This is guidance, not enforcement. Use the best model available. When only one model is available, use it for all stages.
<!-- /soleri:model-routing -->

<!-- soleri:cross-project -->
## Cross-Project Memory

- Use \`crossProject: true\` in \`op:memory_search\` for patterns across related projects.
- Promote universal patterns to global pool with \`op:memory_promote_to_global\`.
<!-- /soleri:cross-project -->
`.trim();
}
