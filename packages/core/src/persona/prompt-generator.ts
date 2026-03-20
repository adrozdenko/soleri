import type { PersonaConfig, PersonaSystemInstructions } from './types.js';

/**
 * Generate system prompt instructions from a persona config.
 *
 * This transforms the structured persona YAML into natural language
 * instructions that the LLM follows to maintain character.
 */
export function generatePersonaInstructions(persona: PersonaConfig): PersonaSystemInstructions {
  // Blank persona — no instructions, generic greeting
  if (persona.template === 'none') {
    return {
      instructions: `You are ${persona.name} — a helpful assistant. No persona configured yet.`,
      greeting: `Hello! I'm ${persona.name}. What are we working on?`,
    };
  }

  const lines: string[] = [];

  lines.push(`# Persona: ${persona.name}`);
  lines.push('');

  // Identity
  lines.push(
    `You are **${persona.name}** — a knowledgeable assistant with personality and character.`,
  );
  if (persona.inspiration) {
    lines.push(`Your character is inspired by: ${persona.inspiration}`);
  }
  lines.push('');

  // Voice
  lines.push('## Voice');
  lines.push(persona.voice);
  lines.push('');

  // Traits
  if (persona.traits.length > 0) {
    lines.push('## Personality Traits');
    for (const trait of persona.traits) {
      lines.push(`- ${trait}`);
    }
    lines.push('');
  }

  // Quirks
  if (persona.quirks.length > 0) {
    lines.push('## Character Quirks');
    lines.push('These are specific behaviors that make you memorable:');
    for (const quirk of persona.quirks) {
      lines.push(`- ${quirk}`);
    }
    lines.push('');
  }

  // Cultural texture
  if (persona.culture) {
    lines.push('## Cultural Texture');
    lines.push(`Your cultural background is ${persona.culture}. ${persona.languageRule}`);
    lines.push('');
  }

  // Metaphors
  if (persona.metaphors.length > 0) {
    lines.push('## Metaphor Domain');
    lines.push(
      `When explaining concepts, naturally draw from these domains: ${persona.metaphors.join(', ')}. ` +
        'Adapt your metaphors to whatever the user is working on — the domain colors your language, it does not limit your knowledge.',
    );
    lines.push('');
  }

  // Opinions
  if (persona.opinions.length > 0) {
    lines.push('## Opinions');
    lines.push('You hold these beliefs about craft and quality:');
    for (const opinion of persona.opinions) {
      lines.push(`- "${opinion}"`);
    }
    lines.push('');
  }

  // Name adaptation rule
  if (persona.nameRule) {
    lines.push('## Identity Persistence');
    lines.push(persona.nameRule);
    lines.push('');
  }

  // Core instruction
  lines.push('## Important');
  lines.push(
    'Stay in character naturally — your personality should feel organic, not performed. ' +
      'You are a universal assistant that can help with ANY task. Your persona defines HOW you communicate, not WHAT you can do. ' +
      'Your knowledge comes from your vault, brain, and what the user teaches you. ' +
      'Be helpful first, characterful second — never let persona get in the way of being useful.',
  );

  // Pick a random greeting
  const greeting =
    persona.greetings.length > 0
      ? persona.greetings[Math.floor(Math.random() * persona.greetings.length)]
      : `Hello! I'm ${persona.name}. What are we working on?`;

  return {
    instructions: lines.join('\n'),
    greeting,
  };
}

/**
 * Pick a random signoff from the persona.
 */
export function getRandomSignoff(persona: PersonaConfig): string {
  if (persona.signoffs.length === 0) return 'Until next time!';
  return persona.signoffs[Math.floor(Math.random() * persona.signoffs.length)];
}
