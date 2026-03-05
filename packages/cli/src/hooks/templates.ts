/**
 * Editor-specific hook/config templates.
 *
 * Each template function reads agent identity and generates
 * editor-appropriate configuration files.
 */
import { detectAgent } from '../utils/agent-context.js';

export type EditorId = 'claude-code' | 'cursor' | 'windsurf' | 'copilot';

export const SUPPORTED_EDITORS: EditorId[] = ['claude-code', 'cursor', 'windsurf', 'copilot'];

interface AgentMeta {
  agentId: string;
  packageName: string;
}

/** Sanitize agent ID for safe interpolation into shell commands and templates. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9-]/g, '');
}

function getAgentMeta(dir?: string): AgentMeta | null {
  const ctx = detectAgent(dir);
  if (!ctx) return null;
  return { agentId: sanitizeId(ctx.agentId), packageName: ctx.packageName };
}

// ── Claude Code ──

/**
 * Build the UserPromptSubmit hook script for auto-routing mode detection.
 *
 * Logic is "skip non-work, then classify":
 *   1. Skip: empty/short, questions, git ops, acknowledgements, greetings
 *   2. Try keyword match → specific mode (FIX, BUILD, etc.)
 *   3. No keyword match → fall back to GENERAL-MODE
 *
 * This ensures near-100% trigger rate on work tasks while staying
 * silent for conversational / non-actionable prompts.
 *
 * Implementation note: skip filters use `if ...; then exit 0; fi`
 * (self-contained, safe to join with &&). The classification block
 * is a single compound if/elif/fi string to avoid && between
 * `then` and commands (which is a bash syntax error).
 */
function buildAutoRouteScript(agentId: string): string {
  const facadeId = agentId.replace(/-/g, '_');

  // Skip filters: each is a self-contained `if ...; then exit 0; fi`
  // so they're safe to join with &&.
  // Classification: one compound if/elif/fi block as a single string.
  const lines = [
    'prompt="$CLAUDE_USER_PROMPT"',
    'if [ ${#prompt} -lt 10 ]; then exit 0; fi',
    'if echo "$prompt" | grep -qiE \'^(how |what |why |where |when |which |is |are |do |does |can |could |should )\'; then exit 0; fi',
    'if echo "$prompt" | grep -qiE \'^(git |commit|push|pull|merge|rebase)\'; then exit 0; fi',
    'if echo "$prompt" | grep -qiE \'^(yes|no|ok|sure|thanks|thank you|sounds good|got it|exactly|correct|right|agreed|lgtm|approve|y|n)$\'; then exit 0; fi',
    'if echo "$prompt" | grep -qiE \'^(hello|hi|hey|hola|adios|goodbye|bye)\'; then exit 0; fi',
    // Classification: single compound block (no && splitting then/commands)
    'mode="GENERAL-MODE"; intent="general"; matched="fallback"',
    [
      'if echo "$prompt" | grep -qiE \'\\b(fix|bug|broken|error|crash|debug|repair|janky|wrong|fail)\\b\'; then mode="FIX-MODE"; intent="fix"; matched="fix/bug/error"',
      'elif echo "$prompt" | grep -qiE \'\\b(build|create|add|implement|scaffold|generate|feature|new|wire|hook up|set up|integrate)\\b\'; then mode="BUILD-MODE"; intent="build"; matched="build/create"',
      'elif echo "$prompt" | grep -qiE \'\\b(refactor|optimize|clean|enhance|simplify|improve|reduce|consolidate|streamline)\\b\'; then mode="IMPROVE-MODE"; intent="improve"; matched="refactor/optimize"',
      'elif echo "$prompt" | grep -qiE \'\\b(deploy|ship|release|publish|package|deliver|launch)\\b\'; then mode="DELIVER-MODE"; intent="deliver"; matched="deploy/ship"',
      'elif echo "$prompt" | grep -qiE \'\\b(review|feedback|critique|assess|evaluate|compare)\\b\'; then mode="REVIEW-MODE"; intent="review"; matched="review/feedback"',
      'elif echo "$prompt" | grep -qiE \'\\b(plan|architect|strategy|roadmap|outline|propose)\\b\'; then mode="PLAN-MODE"; intent="plan"; matched="plan/architect"',
      'elif echo "$prompt" | grep -qiE \'\\b(design|style|layout|color|typography|spacing|visual|theme|ui|ux)\\b\'; then mode="DESIGN-MODE"; intent="design"; matched="design/style"',
      'elif echo "$prompt" | grep -qiE \'\\b(validate|check|verify|test|lint|audit|assert|ensure|confirm)\\b\'; then mode="VALIDATE-MODE"; intent="validate"; matched="validate/test"',
      'elif echo "$prompt" | grep -qiE \'\\b(explore|search|find|show|list|explain|trace|inspect|dump|describe)\\b\'; then mode="EXPLORE-MODE"; intent="explore"; matched="explore/search"',
      'fi',
    ].join('; '),
    'echo "[$mode] Detected intent: $intent ($matched)"',
    `echo "Call ${facadeId}_core op:route_intent params:{ prompt: \\"<user message>\\" } to get behavior rules."`,
  ];

  return lines.join(' && ');
}

function generateClaudeCodeSettings(dir?: string): Record<string, string> {
  const meta = getAgentMeta(dir);
  const agentId = meta?.agentId ?? 'my-agent';
  const facadeId = agentId.replace(/-/g, '_');

  const settings = JSON.stringify(
    {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: buildAutoRouteScript(agentId),
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: '*',
            hooks: [
              {
                type: 'command',
                command: `echo "[${agentId}] tool: $TOOL_NAME"`,
              },
            ],
          },
        ],
        PostToolUse: [
          {
            matcher: 'Edit|Write',
            hooks: [
              {
                type: 'command',
                command: `echo "[${agentId}] file changed"`,
              },
            ],
          },
        ],
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `echo "[${agentId}] session started — register project: ${facadeId}_core op:register params:{ projectPath: \\".\\" }" && echo "Check for active plans: ${facadeId}_core op:get_plan"`,
              },
            ],
          },
        ],
      },
    },
    null,
    2,
  );

  return {
    '.claude/settings.json': settings,
  };
}

// ── Cursor ──

function generateCursorRules(dir?: string): Record<string, string> {
  const meta = getAgentMeta(dir);
  const agentId = meta?.agentId ?? 'my-agent';

  const rules = `# ${agentId} — Cursor Rules
# Generated by soleri hooks add cursor

## Agent Context
This project is a Soleri AI agent (${agentId}).
The agent uses the MCP protocol and is structured with facades, a vault, and a brain.

## Key Directories
- src/facades/ — MCP tool facades (one per domain)
- src/intelligence/data/ — Knowledge bundles (JSON)
- src/identity/ — Persona definition
- src/activation/ — Activation and CLAUDE.md injection

## Conventions
- All facades follow the FacadeConfig pattern from @soleri/core
- Knowledge entries use the pattern/anti-pattern/rule taxonomy
- Domain names are kebab-case
- Facade names use the pattern: {agentId}_{domain}
`;

  return {
    '.cursorrules': rules,
  };
}

// ── Windsurf ──

function generateWindsurfRules(dir?: string): Record<string, string> {
  const meta = getAgentMeta(dir);
  const agentId = meta?.agentId ?? 'my-agent';

  const rules = `# ${agentId} — Windsurf Rules
# Generated by soleri hooks add windsurf

## Agent Context
This project is a Soleri AI agent (${agentId}).
The agent uses the MCP protocol and is structured with facades, a vault, and a brain.

## Key Directories
- src/facades/ — MCP tool facades (one per domain)
- src/intelligence/data/ — Knowledge bundles (JSON)
- src/identity/ — Persona definition
- src/activation/ — Activation and CLAUDE.md injection

## Conventions
- All facades follow the FacadeConfig pattern from @soleri/core
- Knowledge entries use the pattern/anti-pattern/rule taxonomy
- Domain names are kebab-case
- Facade names use the pattern: {agentId}_{domain}
`;

  return {
    '.windsurfrules': rules,
  };
}

// ── GitHub Copilot ──

function generateCopilotInstructions(dir?: string): Record<string, string> {
  const meta = getAgentMeta(dir);
  const agentId = meta?.agentId ?? 'my-agent';

  const instructions = `# ${agentId} — Copilot Instructions
<!-- Generated by soleri hooks add copilot -->

## Agent Context
This project is a Soleri AI agent (${agentId}).
The agent uses the MCP protocol and is structured with facades, a vault, and a brain.

## Key Directories
- \`src/facades/\` — MCP tool facades (one per domain)
- \`src/intelligence/data/\` — Knowledge bundles (JSON)
- \`src/identity/\` — Persona definition
- \`src/activation/\` — Activation and CLAUDE.md injection

## Conventions
- All facades follow the FacadeConfig pattern from @soleri/core
- Knowledge entries use the pattern/anti-pattern/rule taxonomy
- Domain names are kebab-case
- Facade names use the pattern: \`{agentId}_{domain}\`
`;

  return {
    '.github/copilot-instructions.md': instructions,
  };
}

export function getEditorFiles(editor: EditorId, dir?: string): Record<string, string> {
  switch (editor) {
    case 'claude-code':
      return generateClaudeCodeSettings(dir);
    case 'cursor':
      return generateCursorRules(dir);
    case 'windsurf':
      return generateWindsurfRules(dir);
    case 'copilot':
      return generateCopilotInstructions(dir);
  }
}
