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
  const toolPrefix = config.id; // keep hyphens — matches MCP tool registration
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
    `**Activate:** "Hello, ${config.name}!" \u2192 ${bt}${toolPrefix}_core op:activate params:{ projectPath: "." }${bt}`,
    `**Deactivate:** "Goodbye, ${config.name}!" \u2192 ${bt}${toolPrefix}_core op:activate params:{ deactivate: true }${bt}`,
    '',
    'On activation, adopt the returned persona. Stay in character until deactivated.',
    '',
    '## Session Start',
    '',
    `On every new session: ${bt}${toolPrefix}_core op:register params:{ projectPath: "." }${bt}`,
    '',
    '## Facades',
    '',
    '| Need | Facade | Op |',
    '|------|--------|----|',
    `| Health check | ${bt}${toolPrefix}_core${bt} | ${bt}health${bt} |`,
    `| Search all | ${bt}${toolPrefix}_core${bt} | ${bt}search${bt} |`,
    `| Vault stats | ${bt}${toolPrefix}_core${bt} | ${bt}vault_stats${bt} |`,
    `| Identity | ${bt}${toolPrefix}_core${bt} | ${bt}identity${bt} |`,
  ];

  // Domain-specific facade rows
  for (const d of config.domains) {
    const toolName = `${toolPrefix}_${d.replace(/-/g, '_')}`;
    mdLines.push(`| ${d} patterns | ${bt}${toolName}${bt} | ${bt}get_patterns${bt} |`);
    mdLines.push(`| Search ${d} | ${bt}${toolName}${bt} | ${bt}search${bt} |`);
    mdLines.push(`| Capture ${d} | ${bt}${toolName}${bt} | ${bt}capture${bt} |`);
  }

  // Memory + Session + Export + Brain + Planning rows
  mdLines.push(
    `| Memory search | ${bt}${toolPrefix}_core${bt} | ${bt}memory_search${bt} |`,
    `| Memory capture | ${bt}${toolPrefix}_core${bt} | ${bt}memory_capture${bt} |`,
    `| Memory list | ${bt}${toolPrefix}_core${bt} | ${bt}memory_list${bt} |`,
    `| Session capture | ${bt}${toolPrefix}_core${bt} | ${bt}session_capture${bt} |`,
    `| Export knowledge | ${bt}${toolPrefix}_core${bt} | ${bt}export${bt} |`,
    `| Record feedback | ${bt}${toolPrefix}_core${bt} | ${bt}record_feedback${bt} |`,
    `| Enhanced feedback | ${bt}${toolPrefix}_core${bt} | ${bt}brain_feedback${bt} |`,
    `| Feedback stats | ${bt}${toolPrefix}_core${bt} | ${bt}brain_feedback_stats${bt} |`,
    `| Reset extracted | ${bt}${toolPrefix}_core${bt} | ${bt}brain_reset_extracted${bt} |`,
    `| Rebuild vocabulary | ${bt}${toolPrefix}_core${bt} | ${bt}rebuild_vocabulary${bt} |`,
    `| Brain stats | ${bt}${toolPrefix}_core${bt} | ${bt}brain_stats${bt} |`,
    `| LLM status | ${bt}${toolPrefix}_core${bt} | ${bt}llm_status${bt} |`,
    `| Create plan | ${bt}${toolPrefix}_core${bt} | ${bt}create_plan${bt} |`,
    `| Get plan | ${bt}${toolPrefix}_core${bt} | ${bt}get_plan${bt} |`,
    `| Approve plan | ${bt}${toolPrefix}_core${bt} | ${bt}approve_plan${bt} |`,
    `| Update task | ${bt}${toolPrefix}_core${bt} | ${bt}update_task${bt} |`,
    `| Complete plan | ${bt}${toolPrefix}_core${bt} | ${bt}complete_plan${bt} |`,
    `| Route intent | ${bt}${toolPrefix}_core${bt} | ${bt}route_intent${bt} |`,
    `| Morph mode | ${bt}${toolPrefix}_core${bt} | ${bt}morph${bt} |`,
    `| Get behavior rules | ${bt}${toolPrefix}_core${bt} | ${bt}get_behavior_rules${bt} |`,
    `| Get identity | ${bt}${toolPrefix}_core${bt} | ${bt}get_identity${bt} |`,
    `| Update identity | ${bt}${toolPrefix}_core${bt} | ${bt}update_identity${bt} |`,
    `| Add guideline | ${bt}${toolPrefix}_core${bt} | ${bt}add_guideline${bt} |`,
    `| Remove guideline | ${bt}${toolPrefix}_core${bt} | ${bt}remove_guideline${bt} |`,
    `| Rollback identity | ${bt}${toolPrefix}_core${bt} | ${bt}rollback_identity${bt} |`,
    `| Cognee status | ${bt}${toolPrefix}_core${bt} | ${bt}cognee_status${bt} |`,
    `| Cognee search | ${bt}${toolPrefix}_core${bt} | ${bt}cognee_search${bt} |`,
    `| Cognee add | ${bt}${toolPrefix}_core${bt} | ${bt}cognee_add${bt} |`,
    `| Cognee cognify | ${bt}${toolPrefix}_core${bt} | ${bt}cognee_cognify${bt} |`,
    `| Cognee config | ${bt}${toolPrefix}_core${bt} | ${bt}cognee_config${bt} |`,
    `| LLM rotate key | ${bt}${toolPrefix}_core${bt} | ${bt}llm_rotate${bt} |`,
    `| LLM call | ${bt}${toolPrefix}_core${bt} | ${bt}llm_call${bt} |`,
    `| Governance policy | ${bt}${toolPrefix}_core${bt} | ${bt}governance_policy${bt} |`,
    `| Governance proposals | ${bt}${toolPrefix}_core${bt} | ${bt}governance_proposals${bt} |`,
    `| Governance stats | ${bt}${toolPrefix}_core${bt} | ${bt}governance_stats${bt} |`,
    `| Expire proposals | ${bt}${toolPrefix}_core${bt} | ${bt}governance_expire${bt} |`,
    `| Governance dashboard | ${bt}${toolPrefix}_core${bt} | ${bt}governance_dashboard${bt} |`,
  );

  mdLines.push(
    '',
    '## Auto-Routing',
    '',
    'A UserPromptSubmit hook auto-classifies every prompt via keyword matching.',
    `When you see a ${bt}[MODE-NAME]${bt} indicator in the system context:`,
    '',
    `1. Call ${bt}${toolPrefix}_core op:route_intent params:{ prompt: "<user message>" }${bt} to get full behavior rules`,
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
    `1. Search vault \u2014 ${bt}${toolPrefix}_core op:search${bt}`,
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
    `To manually capture: ${bt}${toolPrefix}_core op:session_capture params:{ summary: "..." }${bt}`,
    '',
    '## Planning',
    '',
    'For multi-step tasks, use the planning system:',
    `1. Create: ${bt}${toolPrefix}_core op:create_plan params:{ objective: "...", scope: "...", tasks: [...] }${bt}`,
    `2. Approve: ${bt}${toolPrefix}_core op:approve_plan params:{ planId: "...", startExecution: true }${bt}`,
    `3. Track: ${bt}${toolPrefix}_core op:update_task params:{ planId: "...", taskId: "...", status: "completed" }${bt}`,
    `4. Complete: ${bt}${toolPrefix}_core op:complete_plan params:{ planId: "..." }${bt}`,
    '',
    'Check activation response for recovered plans in `executing` state — remind the user.',
    '',
    `<!-- /${marker} -->`,
  );

  // ─── Hook Packs section (when configured) ─────────────────────
  if (config.hookPacks?.length) {
    const PACK_INFO: Record<string, { description: string; hooks: Record<string, string> }> = {
      'typescript-safety': {
        description: 'Block unsafe TypeScript patterns',
        hooks: {
          'no-any-types': '`:any`, `as any`, `<any>`, `Record<string, any>`',
          'no-console-log': '`console.log` in committed code',
        },
      },
      a11y: {
        description: 'Accessibility enforcement',
        hooks: {
          'semantic-html': 'Generic divs where semantic HTML should be used',
          'focus-ring-required': 'Missing visible focus indicators',
          'ux-touch-targets': 'Touch targets smaller than 44px',
        },
      },
      'css-discipline': {
        description: 'CSS best practices',
        hooks: {
          'no-important': '`!important` in CSS',
          'no-inline-styles': 'Inline style attributes',
        },
      },
      'clean-commits': {
        description: 'Clean git history',
        hooks: {
          'no-ai-attribution': 'AI attribution in commits',
        },
      },
    };

    // Build rows — expand 'full' to constituent packs
    const rows: Array<{ pack: string; hook: string; blocks: string }> = [];
    for (const packName of config.hookPacks) {
      if (packName === 'full') {
        // Composed pack — expand all constituent packs
        for (const [subPack, info] of Object.entries(PACK_INFO)) {
          for (const [hook, blocks] of Object.entries(info.hooks)) {
            rows.push({ pack: subPack, hook, blocks });
          }
        }
      } else if (PACK_INFO[packName]) {
        for (const [hook, blocks] of Object.entries(PACK_INFO[packName].hooks)) {
          rows.push({ pack: packName, hook, blocks });
        }
      }
    }

    if (rows.length > 0) {
      // Insert before the closing marker
      const closingMarkerIndex = mdLines.length - 1;
      const hookLines = [
        '',
        '## Hook Packs',
        '',
        'Quality gates installed in `.claude/`. Run `scripts/setup.sh` to install globally.',
        '',
        '| Pack | Hook | Blocks |',
        '|------|------|--------|',
        ...rows.map((r) => `| ${r.pack} | ${r.hook} | ${r.blocks} |`),
      ];
      mdLines.splice(closingMarkerIndex, 0, ...hookLines);
    }
  }

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
