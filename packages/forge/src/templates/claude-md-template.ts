import type { AgentConfig } from '../types.js';

/**
 * Generates src/activation/claude-md-content.ts for a new agent.
 * Returns the CLAUDE.md section content with activation triggers,
 * facade tables, intent detection, and knowledge protocol.
 *
 * Strategy: build the markdown as plain strings, then escape into
 * single-quoted TypeScript string literals. This avoids nested
 * backtick/template-literal escaping nightmares entirely.
 */
export function generateClaudeMdTemplate(config: AgentConfig): string {
  const facadeId = config.id.replace(/-/g, '_');
  const marker = `${config.id}:mode`;
  const bt = '`'; // backtick — keeps template clean

  // Build the raw markdown lines (plain text, no escaping needed)
  const mdLines: string[] = [
    `<!-- ${marker} -->`,
    '',
    `# ${config.name} Mode`,
    '',
    `## ${config.name} Integration`,
    '',
    `**Activate:** "Hello, ${config.name}!" \u2192 ${bt}${facadeId}_core op:activate params:{ projectPath: "." }${bt}`,
    `**Deactivate:** "Goodbye, ${config.name}!" \u2192 ${bt}${facadeId}_core op:activate params:{ deactivate: true }${bt}`,
    '',
    'On activation, adopt the returned persona. Stay in character until deactivated.',
    '',
    '## Session Start',
    '',
    `On every new session: ${bt}${facadeId}_core op:register params:{ projectPath: "." }${bt}`,
    '',
    '## Facades',
    '',
    '| Need | Facade | Op |',
    '|------|--------|----|',
    `| Health check | ${bt}${facadeId}_core${bt} | ${bt}health${bt} |`,
    `| Search all | ${bt}${facadeId}_core${bt} | ${bt}search${bt} |`,
    `| Vault stats | ${bt}${facadeId}_core${bt} | ${bt}vault_stats${bt} |`,
    `| Identity | ${bt}${facadeId}_core${bt} | ${bt}identity${bt} |`,
  ];

  // Domain-specific facade rows
  for (const d of config.domains) {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    mdLines.push(`| ${d} patterns | ${bt}${toolName}${bt} | ${bt}get_patterns${bt} |`);
    mdLines.push(`| Search ${d} | ${bt}${toolName}${bt} | ${bt}search${bt} |`);
    mdLines.push(`| Capture ${d} | ${bt}${toolName}${bt} | ${bt}capture${bt} |`);
  }

  // Memory + Session + Export + Brain + Planning rows
  mdLines.push(
    `| Memory search | ${bt}${facadeId}_core${bt} | ${bt}memory_search${bt} |`,
    `| Memory capture | ${bt}${facadeId}_core${bt} | ${bt}memory_capture${bt} |`,
    `| Memory list | ${bt}${facadeId}_core${bt} | ${bt}memory_list${bt} |`,
    `| Session capture | ${bt}${facadeId}_core${bt} | ${bt}session_capture${bt} |`,
    `| Export knowledge | ${bt}${facadeId}_core${bt} | ${bt}export${bt} |`,
    `| Record feedback | ${bt}${facadeId}_core${bt} | ${bt}record_feedback${bt} |`,
    `| Rebuild vocabulary | ${bt}${facadeId}_core${bt} | ${bt}rebuild_vocabulary${bt} |`,
    `| Brain stats | ${bt}${facadeId}_core${bt} | ${bt}brain_stats${bt} |`,
    `| LLM status | ${bt}${facadeId}_core${bt} | ${bt}llm_status${bt} |`,
    `| Create plan | ${bt}${facadeId}_core${bt} | ${bt}create_plan${bt} |`,
    `| Get plan | ${bt}${facadeId}_core${bt} | ${bt}get_plan${bt} |`,
    `| Approve plan | ${bt}${facadeId}_core${bt} | ${bt}approve_plan${bt} |`,
    `| Update task | ${bt}${facadeId}_core${bt} | ${bt}update_task${bt} |`,
    `| Complete plan | ${bt}${facadeId}_core${bt} | ${bt}complete_plan${bt} |`,
    `| Route intent | ${bt}${facadeId}_core${bt} | ${bt}route_intent${bt} |`,
    `| Morph mode | ${bt}${facadeId}_core${bt} | ${bt}morph${bt} |`,
    `| Get behavior rules | ${bt}${facadeId}_core${bt} | ${bt}get_behavior_rules${bt} |`,
    `| Get identity | ${bt}${facadeId}_core${bt} | ${bt}get_identity${bt} |`,
    `| Update identity | ${bt}${facadeId}_core${bt} | ${bt}update_identity${bt} |`,
    `| Add guideline | ${bt}${facadeId}_core${bt} | ${bt}add_guideline${bt} |`,
    `| Remove guideline | ${bt}${facadeId}_core${bt} | ${bt}remove_guideline${bt} |`,
    `| Rollback identity | ${bt}${facadeId}_core${bt} | ${bt}rollback_identity${bt} |`,
  );

  mdLines.push(
    '',
    '## Auto-Routing',
    '',
    'A UserPromptSubmit hook auto-classifies every prompt via keyword matching.',
    `When you see a ${bt}[MODE-NAME]${bt} indicator in the system context:`,
    '',
    `1. Call ${bt}${facadeId}_core op:route_intent params:{ prompt: "<user message>" }${bt} to get full behavior rules`,
    '2. Follow the returned behavior rules for the detected mode',
    '3. Briefly acknowledge mode changes in your response (e.g., "Switching to FIX-MODE")',
    '',
    'Available modes: FIX-MODE, BUILD-MODE, IMPROVE-MODE, DELIVER-MODE, REVIEW-MODE, PLAN-MODE, DESIGN-MODE, VALIDATE-MODE, EXPLORE-MODE, GENERAL-MODE.',
    'GENERAL-MODE means the hook detected a work task but could not classify a specific mode — route_intent will refine it.',
    '',
    '## Intent Detection',
    '',
    '| Signal | Intent |',
    '|--------|--------|',
    '| Problem described ("broken", "janky", "weird") | FIX |',
    '| Need expressed ("I need", "we should have") | BUILD |',
    '| Quality questioned ("is this right?") | REVIEW |',
    '| Advice sought ("how should I", "best way") | PLAN |',
    '| Improvement requested ("make it faster") | IMPROVE |',
    '',
    '## Knowledge Protocol',
    '',
    'When seeking guidance: vault before codebase before web.',
    '',
    `1. Search vault \u2014 ${bt}${facadeId}_core op:search${bt}`,
    '2. Codebase \u2014 only if vault has nothing',
    '3. Web \u2014 last resort',
    '',
    '## Knowledge Capture',
    '',
    'When learning something that should persist, use the domain capture ops.',
    '',
    '## Session Capture',
    '',
    'A PreCompact hook is configured to call `session_capture` before context compaction.',
    'This automatically preserves session summaries as memories for future sessions.',
    `To manually capture: ${bt}${facadeId}_core op:session_capture params:{ summary: "..." }${bt}`,
    '',
    '## Planning',
    '',
    'For multi-step tasks, use the planning system:',
    `1. Create: ${bt}${facadeId}_core op:create_plan params:{ objective: "...", scope: "...", tasks: [...] }${bt}`,
    `2. Approve: ${bt}${facadeId}_core op:approve_plan params:{ planId: "...", startExecution: true }${bt}`,
    `3. Track: ${bt}${facadeId}_core op:update_task params:{ planId: "...", taskId: "...", status: "completed" }${bt}`,
    `4. Complete: ${bt}${facadeId}_core op:complete_plan params:{ planId: "..." }${bt}`,
    '',
    'Check activation response for recovered plans in `executing` state — remind the user.',
    '',
    `<!-- /${marker} -->`,
  );

  // Escape each markdown line for use in a single-quoted TS string literal
  const quotedLines = mdLines.map((line) => {
    const escaped = line.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    '${escaped}',`;
  });

  // Build the generated TypeScript file
  const tsLines = [
    '/**',
    ` * CLAUDE.md content for ${config.name}.`,
    ' * Generated by Soleri — do not edit manually.',
    ' */',
    'export function getClaudeMdContent(): string {',
    '  return [',
    ...quotedLines,
    "  ].join('\\n');",
    '}',
    '',
    'export function getClaudeMdMarker(): string {',
    `  return '${marker}';`,
    '}',
  ];

  return tsLines.join('\n');
}
