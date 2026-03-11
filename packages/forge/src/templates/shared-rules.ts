/**
 * Shared behavioral rules that every Soleri agent ships with.
 *
 * These rules are agent-agnostic and mirror the quality of Salvador's
 * hand-crafted CLAUDE.md behavioral sections. They cover:
 * - Vault-first knowledge protocol
 * - Planning enforcement (two-gate approval)
 * - Output formatting (plan metadata tables, drift reports)
 * - Knowledge capture discipline
 * - Intent routing
 * - Session lifecycle
 */

/** Returns markdown lines for all shared behavioral sections. */
export function getSharedRules(toolPrefix: string): string[] {
  const bt = '`';

  return [
    // ─── Vault-First Protocol ────────────────────────────────
    '## Vault as Source of Truth',
    '',
    'Before every decision — planning, design, architecture, problem-solving — consult the vault.',
    '',
    '**Lookup order:**',
    `1. Vault — ${bt}${toolPrefix}_core op:search_intelligent params:{ query: "..." }${bt}`,
    '2. Codebase — only if vault has nothing',
    '3. Web / training knowledge — last resort',
    '',
    'If the vault has a pattern, follow it. If it has an anti-pattern, avoid it.',
    '',

    // ─── Planning Enforcement ────────────────────────────────
    '## Planning',
    '',
    'For multi-step tasks, use the planning system. **Never skip gates.**',
    '',
    '**Lifecycle:**',
    `${bt}draft → approved (Gate 1) → tasks approved (Gate 2) → executing → reconciling → completed${bt}`,
    '',
    '**Sequence:**',
    `1. Create: ${bt}${toolPrefix}_core op:create_plan params:{ objective: "...", scope: "...", tasks: [...] }${bt}`,
    `2. Approve plan (Gate 1): ${bt}${toolPrefix}_core op:approve_plan params:{ planId: "..." }${bt}`,
    `3. Split tasks (Gate 2): ${bt}${toolPrefix}_core op:plan_split params:{ planId: "..." }${bt}`,
    `4. Track: ${bt}${toolPrefix}_core op:update_task params:{ planId: "...", taskId: "...", status: "completed" }${bt}`,
    `5. Reconcile: ${bt}${toolPrefix}_core op:plan_reconcile params:{ planId: "..." }${bt}`,
    `6. Complete: ${bt}${toolPrefix}_core op:plan_complete_lifecycle params:{ planId: "..." }${bt}`,
    '',
    'Wait for explicit user approval before proceeding past each gate.',
    'Check activation response for recovered plans in `executing` state — remind the user.',
    '',
    '**Exceptions:** Read-only operations, user says "just do it", single-line fixes.',
    '',

    // ─── Output Formatting ───────────────────────────────────
    '## Output Formatting',
    '',
    '**Plan metadata** — always show at top of every plan summary:',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Plan ID** | {planId} |',
    '| **Check ID** | {checkId} |',
    '| **Grade** | {grade} ({score}/100) |',
    '| **Status** | {status} |',
    '',
    '**Drift reports:**',
    '',
    '| Field | Value |',
    '|-------|-------|',
    '| **Accuracy** | {accuracyScore}/100 |',
    '| **Drift Items** | {count} |',
    '',
    '| Type | Description | Impact |',
    '|------|-------------|--------|',
    '| skipped | ... | medium |',
    '',

    // ─── Knowledge Capture ───────────────────────────────────
    '## Knowledge Capture',
    '',
    "When learning something that should persist, capture it — don't just promise to remember.",
    '',
    `- Domain knowledge: ${bt}${toolPrefix}_core op:capture_quick params:{ title: "...", description: "..." }${bt}`,
    `- Batch capture: ${bt}${toolPrefix}_core op:capture_knowledge params:{ entries: [...] }${bt}`,
    `- Intelligent search: ${bt}${toolPrefix}_core op:search_intelligent params:{ query: "..." }${bt}`,
    '',

    // ─── Intent Detection ────────────────────────────────────
    '## Intent Detection',
    '',
    'A UserPromptSubmit hook auto-classifies prompts. When you see a `[MODE-NAME]` indicator:',
    '',
    `1. Call ${bt}${toolPrefix}_core op:route_intent params:{ prompt: "<user message>" }${bt}`,
    '2. Follow the returned behavior rules',
    '3. Briefly acknowledge mode changes',
    '',
    '| Signal | Intent |',
    '|--------|--------|',
    '| Problem described ("broken", "janky", "weird") | FIX |',
    '| Need expressed ("I need", "we should have") | BUILD |',
    '| Quality questioned ("is this right?") | REVIEW |',
    '| Advice sought ("how should I", "best way") | PLAN |',
    '| Improvement requested ("make it faster") | IMPROVE |',
    '| Ready to ship ("deploy", "release") | DELIVER |',
    '',

    // ─── Session Lifecycle ───────────────────────────────────
    '## Session Lifecycle',
    '',
    'A PreCompact hook calls `session_capture` before context compaction.',
    `Manual capture: ${bt}${toolPrefix}_core op:session_capture params:{ summary: "..." }${bt}`,
    '',

    // ─── Orchestration ───────────────────────────────────────
    '## Orchestration',
    '',
    'For complex workflows, use the orchestration layer instead of manual planning:',
    '',
    `1. Plan: ${bt}${toolPrefix}_core op:orchestrate_plan params:{ prompt: "...", projectPath: "." }${bt}`,
    `2. Execute: ${bt}${toolPrefix}_core op:orchestrate_execute params:{ planId: "..." }${bt}`,
    `3. Complete: ${bt}${toolPrefix}_core op:orchestrate_complete params:{ planId: "..." }${bt}`,
    '',
    'The orchestrator handles vault lookup, brain recommendations, and knowledge capture automatically.',
    '',
  ];
}
