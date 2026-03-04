/**
 * Interactive create wizard using @clack/prompts.
 */
import * as p from '@clack/prompts';
import type { AgentConfig } from '@soleri/forge/lib';

/**
 * Run the interactive create wizard and return an AgentConfig.
 * Returns null if the user cancels.
 */
export async function runCreateWizard(initialName?: string): Promise<AgentConfig | null> {
  p.intro('Create a new Soleri agent');

  const id =
    initialName ??
    ((await p.text({
      message: 'Agent ID (kebab-case)',
      placeholder: 'my-agent',
      validate: (v = '') => {
        if (!/^[a-z][a-z0-9-]*$/.test(v)) return 'Must be kebab-case (e.g., "my-agent")';
      },
    })) as string);

  if (p.isCancel(id)) return null;

  const name = (await p.text({
    message: 'Display name',
    placeholder: 'My Agent',
    validate: (v) => {
      if (!v || v.length > 50) return 'Required (max 50 chars)';
    },
  })) as string;

  if (p.isCancel(name)) return null;

  const role = (await p.text({
    message: 'Role (one line)',
    placeholder: 'A helpful AI assistant for...',
    validate: (v) => {
      if (!v || v.length > 100) return 'Required (max 100 chars)';
    },
  })) as string;

  if (p.isCancel(role)) return null;

  const description = (await p.text({
    message: 'Description',
    placeholder: 'This agent helps developers with...',
    validate: (v) => {
      if (!v || v.length < 10 || v.length > 500) return 'Required (10-500 chars)';
    },
  })) as string;

  if (p.isCancel(description)) return null;

  const domainsRaw = (await p.text({
    message: 'Domains (comma-separated, kebab-case)',
    placeholder: 'api-design, security, testing',
    validate: (v = '') => {
      const parts = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 0) return 'At least one domain required';
      for (const d of parts) {
        if (!/^[a-z][a-z0-9-]*$/.test(d)) return `Invalid domain "${d}" — must be kebab-case`;
      }
    },
  })) as string;

  if (p.isCancel(domainsRaw)) return null;

  const domains = domainsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const principlesRaw = (await p.text({
    message: 'Principles (one per line)',
    placeholder: 'Security first\nSimplicity over cleverness\nTest everything',
    validate: (v = '') => {
      const lines = v
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length === 0) return 'At least one principle required';
      if (lines.length > 10) return 'Max 10 principles';
    },
  })) as string;

  if (p.isCancel(principlesRaw)) return null;

  const principles = principlesRaw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const greeting = (await p.text({
    message: 'Greeting message',
    placeholder: `Hello! I'm ${name}, your AI assistant for...`,
    validate: (v) => {
      if (!v || v.length < 10 || v.length > 300) return 'Required (10-300 chars)';
    },
  })) as string;

  if (p.isCancel(greeting)) return null;

  const outputDir = (await p.text({
    message: 'Output directory',
    defaultValue: process.cwd(),
    placeholder: process.cwd(),
    validate: (v) => {
      if (!v) return 'Required';
    },
  })) as string;

  if (p.isCancel(outputDir)) return null;

  return {
    id,
    name,
    role,
    description,
    domains,
    principles,
    greeting,
    outputDir,
  };
}
