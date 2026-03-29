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
import { isGhInstalled } from '../utils/git.js';

/** Git configuration collected from the wizard. */
export interface WizardGitConfig {
  init: boolean;
  remote?: {
    type: 'gh' | 'manual';
    url?: string;
    visibility?: 'public' | 'private';
  };
}

/** Full result from the create wizard. */
export interface CreateWizardResult {
  config: AgentConfigInput;
  git: WizardGitConfig;
}

/** Slugify a display name into a kebab-case ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Run the simplified create wizard.
 * Returns a CreateWizardResult or null if cancelled.
 */
export async function runCreateWizard(initialName?: string): Promise<CreateWizardResult | null> {
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

  // ─── Step 3: Git setup ──────────────────────────────────────
  const gitInit = await p.confirm({
    message: 'Initialize as a git repository?',
    initialValue: true,
  });

  if (p.isCancel(gitInit)) return null;

  const git: WizardGitConfig = { init: gitInit as boolean };

  if (git.init) {
    const pushRemote = await p.confirm({
      message: 'Push to a remote repository?',
      initialValue: false,
    });

    if (p.isCancel(pushRemote)) return null;

    if (pushRemote) {
      const ghAvailable = await isGhInstalled();

      let remoteType: 'gh' | 'manual';

      if (ghAvailable) {
        const remoteChoice = await p.select({
          message: 'How would you like to set up the remote?',
          options: [
            { value: 'gh' as const, label: 'Create a new GitHub repository' },
            { value: 'manual' as const, label: 'Add an existing remote URL' },
          ],
        });

        if (p.isCancel(remoteChoice)) return null;
        remoteType = remoteChoice as 'gh' | 'manual';
      } else {
        remoteType = 'manual';
      }

      if (remoteType === 'gh') {
        const visibility = await p.select({
          message: 'Repository visibility?',
          options: [
            { value: 'private' as const, label: 'Private' },
            { value: 'public' as const, label: 'Public' },
          ],
          initialValue: 'private' as const,
        });

        if (p.isCancel(visibility)) return null;

        git.remote = {
          type: 'gh',
          visibility: visibility as 'public' | 'private',
        };
      } else {
        const remoteUrl = await p.text({
          message: 'Remote repository URL:',
          placeholder: 'https://github.com/user/repo.git',
          validate: (v) => {
            if (!v || v.trim().length === 0) return 'URL is required';
            if (!v.startsWith('https://') && !v.startsWith('git@'))
              return 'URL must start with https:// or git@';
          },
        });

        if (p.isCancel(remoteUrl)) return null;

        git.remote = {
          type: 'manual',
          url: (remoteUrl as string).trim(),
        };
      }
    }
  }

  return {
    config: {
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
    } as AgentConfigInput,
    git,
  };
}
