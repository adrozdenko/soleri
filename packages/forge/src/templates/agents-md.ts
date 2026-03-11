import type { AgentConfig } from '../types.js';

/**
 * Generate AGENTS.md content for Codex sessions.
 */
export function generateAgentsMd(config: AgentConfig): string {
  const principles = config.principles.map((p) => `- ${p}`).join('\n');
  const domains = config.domains.map((d) => `- ${d}`).join('\n');

  return `# AGENTS.md instructions for this project

## Agent Identity
- Name: ${config.name}
- Role: ${config.role}
- Agent MCP prefix: \`${config.id}\`

## Activation
- Say "Hello, ${config.name}!" to activate persona behavior via \`${config.id}_core\`.
- Say "Goodbye, ${config.name}!" to deactivate.

## Domains
${domains}

## Principles
${principles}

## Skills
- Local skills live in \`skills/<skill>/SKILL.md\`.
- If a user explicitly names a skill, open that \`SKILL.md\` and follow it for that turn.

## Setup Notes
- This repository was scaffolded with Codex support.
- Session model/reasoning is selected at session start and does not auto-switch per prompt.
`;
}
