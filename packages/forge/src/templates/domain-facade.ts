import type { AgentConfig } from '../types.js';

/**
 * Generate a domain-specific facade for the agent.
 * Each domain gets a facade with search, get_patterns, and list ops.
 */
export function generateDomainFacade(agentId: string, domain: string): string {
  const facadeName = `${agentId}_${domain.replace(/-/g, '_')}`;

  return `import { z } from 'zod';
import type { FacadeConfig } from './types.js';
import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';

export function create${pascalCase(domain)}Facade(vault: Vault, brain: Brain): FacadeConfig {
  return {
    name: '${facadeName}',
    description: '${capitalize(domain.replace(/-/g, ' '))} patterns, rules, and guidance.',
    ops: [
      {
        name: 'get_patterns',
        description: 'Get ${domain} patterns filtered by tags or severity.',
        auth: 'read',
        schema: z.object({
          tags: z.array(z.string()).optional(),
          severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
          type: z.enum(['pattern', 'anti-pattern', 'rule']).optional(),
          limit: z.number().optional(),
        }),
        handler: async (params) => {
          return vault.list({
            domain: '${domain}',
            severity: params.severity as string | undefined,
            type: params.type as string | undefined,
            tags: params.tags as string[] | undefined,
            limit: (params.limit as number) ?? 20,
          });
        },
      },
      {
        name: 'search',
        description: 'Search ${domain} knowledge with natural language query. Results ranked by TF-IDF + severity + recency.',
        auth: 'read',
        schema: z.object({
          query: z.string(),
          tags: z.array(z.string()).optional(),
          limit: z.number().optional(),
        }),
        handler: async (params) => {
          return brain.intelligentSearch(params.query as string, {
            domain: '${domain}',
            tags: params.tags as string[] | undefined,
            limit: (params.limit as number) ?? 10,
          });
        },
      },
      {
        name: 'get_entry',
        description: 'Get a specific ${domain} knowledge entry by ID.',
        auth: 'read',
        schema: z.object({ id: z.string() }),
        handler: async (params) => {
          const entry = vault.get(params.id as string);
          if (!entry) return { error: 'Entry not found: ' + params.id };
          return entry;
        },
      },
      {
        name: 'capture',
        description: 'Capture a new ${domain} pattern, anti-pattern, or rule. Auto-tags and checks for duplicates.',
        auth: 'write',
        schema: z.object({
          id: z.string(),
          type: z.enum(['pattern', 'anti-pattern', 'rule']),
          title: z.string(),
          severity: z.enum(['critical', 'warning', 'suggestion']),
          description: z.string(),
          context: z.string().optional(),
          example: z.string().optional(),
          counterExample: z.string().optional(),
          why: z.string().optional(),
          tags: z.array(z.string()).optional().default([]),
        }),
        handler: async (params) => {
          return brain.enrichAndCapture({
            id: params.id as string,
            type: params.type as 'pattern' | 'anti-pattern' | 'rule',
            domain: '${domain}',
            title: params.title as string,
            severity: params.severity as 'critical' | 'warning' | 'suggestion',
            description: params.description as string,
            context: params.context as string | undefined,
            example: params.example as string | undefined,
            counterExample: params.counterExample as string | undefined,
            why: params.why as string | undefined,
            tags: params.tags as string[],
          });
        },
      },
      {
        name: 'remove',
        description: 'Remove a ${domain} knowledge entry by ID.',
        auth: 'admin',
        schema: z.object({ id: z.string() }),
        handler: async (params) => {
          const removed = vault.remove(params.id as string);
          return { removed, id: params.id };
        },
      },
    ],
  };
}
`;
}

export function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
