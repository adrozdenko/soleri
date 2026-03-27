/**
 * Simplified create wizard — name + optional persona description.
 *
 * The agent starts as a universal second brain with the Italian Craftsperson
 * default persona. Everything else (domains, principles, skills) is discovered
 * from usage, not configured upfront.
 */
import * as p from '@clack/prompts';
import type { AgentConfigInput } from '@soleri/forge/lib';
import { ITALIAN_CRAFTSPERSON } from '@soleri/core/personas';

/** Slugify a display name into a kebab-case ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Run the simplified create wizard.
 * Returns an AgentConfigInput or null if cancelled.
 */
export async function runCreateWizard(initialName?: string): Promise<AgentConfigInput | null> {
  p.intro('Create a new Soleri agent');

  // ─── Step 1: Name ───────────────────────────────────────────
  const name = (await p.text({
    message: 'What should your agent be called?',
    placeholder: 'Ernesto',
    initialValue: initialName,
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Name is required';
      if (v.length > 50) return 'Max 50 characters';
    },
  })) as string;

  if (p.isCancel(name)) return null;

  const id = slugify(name);

  // ─── Step 2: Optional persona description ───────────────────
  const personaChoice = await p.select({
    message: 'Persona',
    options: [
      {
        value: 'default',
        label: `Italian Craftsperson (default)`,
        hint: 'Warm, opinionated about quality, sprinkles Italian expressions — perfetto!',
      },
      {
        value: 'custom',
        label: 'Describe your own persona',
        hint: 'Tell me who your agent should be',
      },
    ],
  });

  if (p.isCancel(personaChoice)) return null;

  let personaDescription: string | undefined;

  if (personaChoice === 'custom') {
    const desc = (await p.text({
      message: "Describe your agent's personality (we'll generate the persona from this)",
      placeholder: 'A calm Japanese sensei who speaks in zen metaphors and values harmony in code',
      validate: (v) => {
        if (!v || v.trim().length < 10) return 'Give at least a brief description (10+ chars)';
        if (v.length > 500) return 'Max 500 characters';
      },
    })) as string;

    if (p.isCancel(desc)) return null;
    personaDescription = desc;
  }

  // ─── Build config ───────────────────────────────────────────
  const persona = personaDescription
    ? {
        template: 'custom',
        name: name.trim(),
        voice: personaDescription,
        // Custom personas start with minimal config — the LLM enriches from the voice description
        inspiration: '',
        culture: '',
        metaphors: [] as string[],
        traits: [] as string[],
        quirks: [] as string[],
        opinions: [] as string[],
        greetings: [`Hello! I'm ${name.trim()}. What are we working on?`],
        signoffs: ['Until next time!'],
        languageRule: "Speak the user's language naturally.",
        nameRule: 'Adapt to name changes but keep character intact.',
      }
    : {
        ...ITALIAN_CRAFTSPERSON,
        name: name.trim(),
      };

  const greeting = persona.greetings[0] ?? `Ciao! I'm ${name.trim()}. What are we working on?`;

  // Summary
  p.note(
    [
      `Name: ${name.trim()}`,
      `ID: ${id}`,
      `Persona: ${personaChoice === 'default' ? 'Italian Craftsperson' : 'Custom'}`,
      '',
      `Your agent starts as a universal second brain.`,
      `It learns what it needs from your projects and conversations.`,
    ].join('\n'),
    'Agent Summary',
  );

  const confirm = await p.confirm({
    message: 'Create this agent?',
    initialValue: true,
  });

  if (p.isCancel(confirm) || !confirm) return null;

  return {
    id,
    name: name.trim(),
    role: 'Your universal second brain — learns, remembers, improves',
    description:
      'A universal assistant that learns from your projects, captures knowledge, and gets smarter with every session.',
    domains: [],
    principles: [],
    skills: [],
    tone: 'mentor',
    greeting,
    persona,
  } as AgentConfigInput;
}
