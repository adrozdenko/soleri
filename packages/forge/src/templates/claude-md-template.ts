import type { AgentConfig } from '../types.js';
import { getEngineMarker, getEngineRulesContent } from './shared-rules.js';

/**
 * Generates src/activation/claude-md-content.ts for a new agent.
 *
 * Architecture (split injection):
 * 1. Engine rules — shared, prefix-free, injected once under `<!-- soleri:engine-rules -->`
 * 2. Agent block — lightweight, agent-specific, under `<!-- agent-id:mode -->`
 *    - Identity (persona, domains, principles)
 *    - Session start protocol
 *    - Facade table (~60 key ops across all 13 semantic facades + domains)
 *    - Hook packs (conditional)
 *
 * The facade table maps `op:name` → actual `agentId_<facade> op:name` tool calls.
 * Full op list is always available via `admin_tool_list`.
 */
export function generateClaudeMdTemplate(config: AgentConfig): string {
  const toolPrefix = config.id;
  const marker = `${config.id}:mode`;
  const bt = '`';

  const mdLines: string[] = [
    `<!-- ${marker} -->`,
    '',
    `# ${config.name} Mode`,
    '',

    // ─── Identity ──────────────────────────────────────────
    `## ${config.name}`,
    '',
    `**Origin role:** ${config.role}`,
    `**Initial domains:** ${config.domains.join(', ')}`,
    `**Tone:** ${config.tone ?? 'pragmatic'}`,
    '',
    config.description,
    '',
    '**Principles:**',
    ...config.principles.map((p) => `- ${p}`),
    '',

    // ─── Adaptive Identity ──────────────────────────────────
    '## Adaptive Identity',
    '',
    `${config.name} is not a fixed-role agent. The origin role above is a starting point — the agent evolves as knowledge is added.`,
    '',
    '**On activation**, the agent discovers its current capabilities by checking:',
    '- Vault domains (what knowledge actually exists)',
    '- Installed packs (what was added after creation)',
    '- Identity updates (any role changes via `op:update_identity`)',
    '',
    '**Use the `current` field** from the activation response — not `origin` — to determine how to present yourself.',
    'If you have grown beyond your origin role, say so. Your greeting and expertise should reflect what you actually know.',
    '',

    // ─── Activation ────────────────────────────────────────
    '## Activation',
    '',
    `**Activate:** "Hello, ${config.name}!" → ${bt}${toolPrefix}_core op:activate params:{ projectPath: "." }${bt}`,
    `**Deactivate:** "Goodbye, ${config.name}!" → ${bt}${toolPrefix}_core op:activate params:{ deactivate: true }${bt}`,
    '',
    'On activation, read the `current` field to discover your evolved role, then adopt that persona for the session.',
    '',

    // ─── Session Start ─────────────────────────────────────
    '## Session Start',
    '',
    `On every new session: ${bt}${toolPrefix}_core op:register params:{ projectPath: "." }${bt}`,
    '',
  ];

  // ─── Compact Facade Table ───────────────────────────────
  mdLines.push(
    '## Essential Tools',
    `<!-- ${toolPrefix}:tools -->`,
    '',
    '| Facade | Key Ops |',
    '|--------|---------|',
    `| ${bt}${toolPrefix}_core${bt} | ${bt}health${bt}, ${bt}search${bt}, ${bt}identity${bt}, ${bt}register${bt}, ${bt}activate${bt} |`,
  );

  // Domain facades — one row per domain
  for (const d of config.domains) {
    const toolName = `${toolPrefix}_${d.replace(/-/g, '_')}`;
    mdLines.push(
      `| ${bt}${toolName}${bt} | ${bt}get_patterns${bt}, ${bt}search${bt}, ${bt}capture${bt} |`,
    );
  }

  // Engine facades — use actual tool names (standalone facades, NOT _core sub-groups)
  mdLines.push(
    // Vault — knowledge lifecycle, capture, search, management
    `| ${bt}${toolPrefix}_vault${bt} | ${bt}search_intelligent${bt}, ${bt}capture_knowledge${bt}, ${bt}capture_quick${bt}, ${bt}search_feedback${bt} |`,
    `| ${bt}${toolPrefix}_vault${bt} (keeper) | ${bt}knowledge_audit${bt}, ${bt}knowledge_health${bt}, ${bt}knowledge_merge${bt}, ${bt}knowledge_reorganize${bt} |`,
    `| ${bt}${toolPrefix}_vault${bt} (mgmt) | ${bt}vault_get${bt}, ${bt}vault_update${bt}, ${bt}vault_remove${bt}, ${bt}vault_tags${bt}, ${bt}vault_domains${bt}, ${bt}vault_recent${bt} |`,
    // Curator — quality, dedup, contradictions, grooming
    `| ${bt}${toolPrefix}_curator${bt} | ${bt}curator_status${bt}, ${bt}curator_detect_duplicates${bt}, ${bt}curator_contradictions${bt}, ${bt}curator_groom_all${bt}, ${bt}curator_consolidate${bt}, ${bt}curator_health_audit${bt} |`,
    `| ${bt}${toolPrefix}_curator${bt} (advanced) | ${bt}curator_enrich${bt}, ${bt}curator_hybrid_contradictions${bt}, ${bt}curator_entry_history${bt}, ${bt}curator_queue_stats${bt} |`,
    // Planning, orchestration, brain
    `| ${bt}${toolPrefix}_plan${bt} | ${bt}create_plan${bt}, ${bt}approve_plan${bt}, ${bt}plan_split${bt}, ${bt}plan_reconcile${bt}, ${bt}plan_complete_lifecycle${bt} |`,
    `| ${bt}${toolPrefix}_orchestrate${bt} | ${bt}orchestrate_plan${bt}, ${bt}orchestrate_execute${bt}, ${bt}orchestrate_complete${bt} |`,
    `| ${bt}${toolPrefix}_brain${bt} | ${bt}brain_stats${bt}, ${bt}brain_feedback${bt}, ${bt}rebuild_vocabulary${bt}, ${bt}brain_strengths${bt}, ${bt}brain_recommend${bt} |`,
    // Memory, control, loop
    `| ${bt}${toolPrefix}_memory${bt} | ${bt}memory_search${bt}, ${bt}memory_capture${bt}, ${bt}session_capture${bt} |`,
    `| ${bt}${toolPrefix}_control${bt} | ${bt}route_intent${bt}, ${bt}morph${bt}, ${bt}get_behavior_rules${bt}, ${bt}governance_dashboard${bt}, ${bt}governance_policy${bt} |`,
    `| ${bt}${toolPrefix}_loop${bt} | ${bt}loop_start${bt}, ${bt}loop_iterate${bt}, ${bt}loop_status${bt}, ${bt}loop_cancel${bt} |`,
    // Intelligence — cognee, context, agency
    `| ${bt}${toolPrefix}_cognee${bt} | ${bt}cognee_search${bt}, ${bt}cognee_graph_stats${bt}, ${bt}cognee_export_status${bt} |`,
    `| ${bt}${toolPrefix}_context${bt} | ${bt}context_extract_entities${bt}, ${bt}context_retrieve_knowledge${bt}, ${bt}context_analyze${bt} |`,
    `| ${bt}${toolPrefix}_agency${bt} | ${bt}agency_enable${bt}, ${bt}agency_status${bt}, ${bt}agency_surface_patterns${bt}, ${bt}agency_warnings${bt}, ${bt}agency_clarify${bt} |`,
    // Admin
    `| ${bt}${toolPrefix}_admin${bt} | ${bt}admin_health${bt}, ${bt}admin_tool_list${bt}, ${bt}admin_diagnostic${bt} |`,
  );

  mdLines.push('', `> Full list: ${bt}${toolPrefix}_admin op:admin_tool_list${bt}`, '');

  // ─── Hook Packs (conditional) ──────────────────────────
  appendHookPacks(mdLines, config);

  // ─── Closing marker ────────────────────────────────────
  mdLines.push(`<!-- /${marker} -->`);

  // Escape each markdown line for single-quoted TS string literal
  const quotedLines = mdLines.map((line) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    '${escaped}',`;
  });

  // Generate engine rules as a quoted string literal
  const engineContent = getEngineRulesContent();
  const engineQuotedLines = engineContent.split('\n').map((line) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    '${escaped}',`;
  });

  return [
    '/**',
    ` * CLAUDE.md content for ${config.name}.`,
    ' * Generated by Soleri — do not edit manually.',
    ' */',
    '',
    '/** Agent-specific block (identity + activation + facade table). */',
    'export function getClaudeMdContent(): string {',
    '  return [',
    ...quotedLines,
    "  ].join('\\n');",
    '}',
    '',
    'export function getClaudeMdMarker(): string {',
    `  return '${marker}';`,
    '}',
    '',
    '/** Shared engine rules — injected once, skipped if already present. */',
    'export function getEngineRulesContent(): string {',
    '  return [',
    ...engineQuotedLines,
    "  ].join('\\n');",
    '}',
    '',
    'export function getEngineRulesMarker(): string {',
    `  return '${getEngineMarker()}';`,
    '}',
  ].join('\n');
}

function appendHookPacks(mdLines: string[], config: AgentConfig): void {
  if (!config.hookPacks?.length) return;

  // Domain-agnostic: just list installed pack names.
  // The hooks themselves (in .claude/) enforce the rules — no need to
  // hardcode domain-specific descriptions in the template.
  mdLines.push(
    '## Hook Packs',
    '',
    'Quality gates installed in `.claude/`. Run `scripts/setup.sh` to install globally.',
    '',
    `Installed packs: ${config.hookPacks.join(', ')}`,
    '',
    'Each hook runs on every tool call and blocks violations automatically.',
    'See `.claude/hooks/` for individual hook definitions.',
    '',
  );
}
