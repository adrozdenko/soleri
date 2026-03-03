import type { AgentConfig } from '../types.js';

/**
 * Generates src/activation/activate.ts for a new agent.
 * Provides the activate/deactivate system that returns full context
 * to Claude — persona, guidelines, tool recommendations, setup status.
 *
 * Uses array-joined pattern because generated code contains template literals.
 */
export function generateActivate(config: AgentConfig): string {
  const facadeId = config.id.replace(/-/g, '_');
  const marker = `${config.id}:mode`;

  // Build tool recommendations from config domains
  const toolRecLines: string[] = [];
  for (const d of config.domains) {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    toolRecLines.push(`      { intent: 'search ${d}', facade: '${toolName}', op: 'search' },`);
    toolRecLines.push(`      { intent: '${d} patterns', facade: '${toolName}', op: 'get_patterns' },`);
    toolRecLines.push(`      { intent: 'capture ${d}', facade: '${toolName}', op: 'capture' },`);
  }

  // Build behavioral guidelines from config principles
  const guidelineLines = config.principles
    .map((p) => {
      const escaped = p.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `      '${escaped}',`;
    })
    .join('\n');

  return [
    "import { join } from 'node:path';",
    "import { homedir } from 'node:os';",
    "import { PERSONA } from '../identity/persona.js';",
    "import { hasAgentMarker } from './inject-claude-md.js';",
    "import type { Vault } from '../vault/vault.js';",
    "import type { Planner, Plan } from '../planning/planner.js';",
    "",
    "export interface ActivationResult {",
    "  activated: boolean;",
    "  persona: {",
    "    name: string;",
    "    role: string;",
    "    description: string;",
    "    greeting: string;",
    "  };",
    "  guidelines: string[];",
    "  tool_recommendations: Array<{ intent: string; facade: string; op: string }>;",
    "  session_instruction: string;",
    "  setup_status: {",
    "    claude_md_injected: boolean;",
    "    global_claude_md_injected: boolean;",
    "    vault_has_entries: boolean;",
    "    vault_entry_count: number;",
    "  };",
    "  executing_plans: Array<{ id: string; objective: string; tasks: number; completed: number }>;",
    "  next_steps: string[];",
    "}",
    "",
    "export interface DeactivationResult {",
    "  deactivated: boolean;",
    "  message: string;",
    "}",
    "",
    "/**",
    ` * Activate ${config.name} — returns full context for Claude to adopt the persona.`,
    " */",
    "export function activateAgent(vault: Vault, projectPath: string, planner?: Planner): ActivationResult {",
    "  // Check CLAUDE.md injection status (project-level and global)",
    "  const projectClaudeMd = join(projectPath, 'CLAUDE.md');",
    "  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md');",
    "  const claudeMdInjected = hasAgentMarker(projectClaudeMd);",
    "  const globalClaudeMdInjected = hasAgentMarker(globalClaudeMd);",
    "",
    "  // Check vault status",
    "  const stats = vault.stats();",
    "  const vaultHasEntries = stats.totalEntries > 0;",
    "",
    "  // Build next steps based on what's missing",
    "  const nextSteps: string[] = [];",
    "  if (!globalClaudeMdInjected && !claudeMdInjected) {",
    `    nextSteps.push('No CLAUDE.md configured — run inject_claude_md with global: true for all projects, or without for this project only');`,
    "  } else if (!globalClaudeMdInjected) {",
    `    nextSteps.push('Global CLAUDE.md not configured — run inject_claude_md with global: true to enable activation in all projects');`,
    "  }",
    "  if (!vaultHasEntries) {",
    "    nextSteps.push('Vault is empty — start capturing knowledge with the domain capture ops');",
    "  }",
    "  if (nextSteps.length === 0) {",
    `    nextSteps.push('All set! ${config.name} is fully integrated.');`,
    "  }",
    "",
    "  // Check for executing plans",
    "  const executingPlans = planner ? planner.getExecuting().map((p) => ({",
    "    id: p.id,",
    "    objective: p.objective,",
    "    tasks: p.tasks.length,",
    "    completed: p.tasks.filter((t) => t.status === 'completed').length,",
    "  })) : [];",
    "  if (executingPlans.length > 0) {",
    "    nextSteps.unshift(`${executingPlans.length} plan(s) in progress — use get_plan to review`);",
    "  }",
    "",
    "  return {",
    "    activated: true,",
    "    persona: {",
    "      name: PERSONA.name,",
    "      role: PERSONA.role,",
    "      description: PERSONA.description,",
    "      greeting: PERSONA.greeting,",
    "    },",
    "    guidelines: [",
    guidelineLines,
    "    ],",
    "    tool_recommendations: [",
    `      { intent: 'health check', facade: '${facadeId}_core', op: 'health' },`,
    `      { intent: 'search all', facade: '${facadeId}_core', op: 'search' },`,
    `      { intent: 'vault stats', facade: '${facadeId}_core', op: 'vault_stats' },`,
    ...toolRecLines,
    "    ],",
    `    session_instruction: 'You are now ' + PERSONA.name + ', a ' + PERSONA.role + '. Stay in character for the ENTIRE session. ' +`,
    `      'Reference patterns from the knowledge vault. Provide concrete examples. Flag anti-patterns with severity.',`,
    "    setup_status: {",
    "      claude_md_injected: claudeMdInjected,",
    "      global_claude_md_injected: globalClaudeMdInjected,",
    "      vault_has_entries: vaultHasEntries,",
    "      vault_entry_count: stats.totalEntries,",
    "    },",
    "    executing_plans: executingPlans,",
    "    next_steps: nextSteps,",
    "  };",
    "}",
    "",
    "/**",
    ` * Deactivate ${config.name} — drops persona for the session.`,
    " */",
    "export function deactivateAgent(): DeactivationResult {",
    "  return {",
    "    deactivated: true,",
    `    message: 'Goodbye! ' + PERSONA.name + ' persona deactivated. Reverting to default behavior.',`,
    "  };",
    "}",
  ].join('\n');
}
