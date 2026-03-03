import type { AgentConfig } from '../types.js';

export function generatePersona(config: AgentConfig): string {
  const principleLines = config.principles
    .map((p) => `    '${escapeQuotes(p)}',`)
    .join('\n');

  return `export interface AgentPersona {
  name: string;
  role: string;
  description: string;
  principles: string[];
  greeting: string;
}

export const PERSONA: AgentPersona = {
  name: '${escapeQuotes(config.name)}',
  role: '${escapeQuotes(config.role)}',
  description: '${escapeQuotes(config.description)}',
  principles: [
${principleLines}
  ],
  greeting: '${escapeQuotes(config.greeting)}',
};

export function getPersonaPrompt(): string {
  return [
    \`You are \${PERSONA.name}, a \${PERSONA.role}.\`,
    '',
    PERSONA.description,
    '',
    'Core principles:',
    ...PERSONA.principles.map((p) => \`- \${p}\`),
    '',
    'When advising:',
    '- Reference specific patterns from the knowledge vault',
    '- Provide concrete examples, not just theory',
    '- Flag anti-patterns with severity level',
    '- Suggest the simplest approach that solves the problem',
  ].join('\\n');
}
`;
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
