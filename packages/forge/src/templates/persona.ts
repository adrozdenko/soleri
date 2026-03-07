import type { AgentConfig } from '../types.js';

export function generatePersona(config: AgentConfig): string {
  const principleLines = config.principles.map((p) => `    '${escapeQuotes(p)}',`).join('\n');
  const tone = config.tone ?? 'pragmatic';

  return `export interface AgentPersona {
  name: string;
  role: string;
  description: string;
  principles: string[];
  tone: 'precise' | 'mentor' | 'pragmatic';
  greeting: string;
}

export const PERSONA: AgentPersona = {
  name: '${escapeQuotes(config.name)}',
  role: '${escapeQuotes(config.role)}',
  description: '${escapeQuotes(config.description)}',
  principles: [
${principleLines}
  ],
  tone: '${tone}',
  greeting: '${escapeQuotes(config.greeting ?? `Hello! I'm ${config.name}.`)}',
};

const TONE_INSTRUCTIONS: Record<string, string[]> = {
  precise: [
    'Communication style: precise',
    '- Be direct and factual with minimal commentary',
    '- Lead with the conclusion, then support it',
    '- Omit caveats unless they change the recommendation',
  ],
  mentor: [
    'Communication style: mentor',
    '- Explain the "why" behind every suggestion',
    '- Use examples to illustrate concepts',
    '- Guide the user to understand, not just follow instructions',
  ],
  pragmatic: [
    'Communication style: pragmatic',
    '- Focus on actionable outcomes',
    '- Balance thoroughness with brevity',
    '- Prioritize what matters most for the current context',
  ],
};

export function getPersonaPrompt(): string {
  const toneLines = TONE_INSTRUCTIONS[PERSONA.tone] ?? TONE_INSTRUCTIONS.pragmatic;
  return [
    \`You are \${PERSONA.name}, a \${PERSONA.role}.\`,
    '',
    PERSONA.description,
    '',
    'Core principles:',
    ...PERSONA.principles.map((p) => \`- \${p}\`),
    '',
    ...toneLines,
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
