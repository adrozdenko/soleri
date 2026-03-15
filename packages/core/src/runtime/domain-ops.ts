/**
 * Domain facade factory — creates domain facades with optional pack support.
 *
 * Without packs: every domain gets the standard 5 ops (get_patterns, search,
 * get_entry, capture, remove).
 *
 * With packs: pack ops are PRIMARY, standard 5 ops are FALLBACK for any op
 * name not defined by the pack. Pack standalone facades are registered as
 * additional MCP tools.
 */

import { z } from 'zod';
import type { FacadeConfig, OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import type { DomainPack } from '../domain-packs/types.js';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Create a single domain facade with 5 standard ops.
 *
 * @param runtime - The agent runtime (vault + brain)
 * @param agentId - Agent identifier (used for facade naming)
 * @param domain - Domain name (e.g. 'security', 'api-design')
 */
export function createDomainFacade(
  runtime: AgentRuntime,
  agentId: string,
  domain: string,
): FacadeConfig {
  const { vault, brain, governance } = runtime;
  const facadeName = `${agentId}_${domain.replace(/-/g, '_')}`;

  const ops: OpDefinition[] = [
    {
      name: 'get_patterns',
      description: `Get ${domain} patterns filtered by tags or severity.`,
      auth: 'read',
      schema: z.object({
        tags: z.array(z.string()).optional(),
        severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']).optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        return vault.list({
          domain,
          severity: params.severity as string | undefined,
          type: params.type as string | undefined,
          tags: params.tags as string[] | undefined,
          limit: (params.limit as number) ?? 20,
        });
      },
    },
    {
      name: 'search',
      description: `Search ${domain} knowledge with natural language query. Results ranked by TF-IDF + severity + recency.`,
      auth: 'read',
      schema: z.object({
        query: z.string(),
        tags: z.array(z.string()).optional(),
        limit: z.number().optional(),
      }),
      handler: async (params) => {
        const limit = (params.limit as number) ?? 10;
        const results = await brain.intelligentSearch(params.query as string, {
          domain,
          tags: params.tags as string[] | undefined,
          limit,
        });
        // Fallback: when brain returns empty, try vault FTS directly
        if (results.length === 0) {
          const ftsResults = vault.search(params.query as string, { domain, limit });
          return ftsResults.map((r) => ({
            entry: r.entry,
            score: 0,
            breakdown: {
              semantic: 0,
              vector: 0,
              severity: 0,
              temporalDecay: 0,
              tagOverlap: 0,
              domainMatch: 0,
              total: 0,
            },
          }));
        }
        return results;
      },
    },
    {
      name: 'get_entry',
      description: `Get a specific ${domain} knowledge entry by ID.`,
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
      description: `Capture a new ${domain} pattern, anti-pattern, or rule. Auto-tags and checks for duplicates.`,
      auth: 'write',
      schema: z.object({
        id: z.string(),
        type: z.enum(['pattern', 'anti-pattern', 'rule', 'playbook']),
        title: z.string(),
        severity: z.enum(['critical', 'warning', 'suggestion']),
        description: z.string(),
        context: z.string().optional(),
        example: z.string().optional(),
        counterExample: z.string().optional(),
        why: z.string().optional(),
        tags: z.array(z.string()).optional().default([]),
        projectPath: z.string().optional().default('.'),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? '.';
        const entryType = params.type as string;
        const title = params.title as string;

        const decision = governance.evaluateCapture(projectPath, {
          type: entryType,
          category: domain,
          title,
        });

        switch (decision.action) {
          case 'capture': {
            const result = brain.enrichAndCapture({
              id: params.id as string,
              type: params.type as 'pattern' | 'anti-pattern' | 'rule',
              domain,
              title,
              severity: params.severity as 'critical' | 'warning' | 'suggestion',
              description: params.description as string,
              context: params.context as string | undefined,
              example: params.example as string | undefined,
              counterExample: params.counterExample as string | undefined,
              why: params.why as string | undefined,
              tags: params.tags as string[],
            });
            return { ...result, governance: { action: 'capture' as const } };
          }
          case 'propose': {
            const proposalId = governance.propose(
              projectPath,
              {
                entryId: params.id as string,
                title,
                type: entryType,
                category: domain,
                data: {
                  severity: params.severity,
                  description: params.description,
                  context: params.context,
                  example: params.example,
                  counterExample: params.counterExample,
                  why: params.why,
                  tags: params.tags,
                },
              },
              'domain-capture',
            );
            return {
              captured: false,
              id: params.id as string,
              autoTags: [],
              governance: { action: 'propose' as const, proposalId, reason: decision.reason },
            };
          }
          default: {
            // reject or quarantine
            return {
              captured: false,
              id: params.id as string,
              autoTags: [],
              governance: { action: decision.action, reason: decision.reason },
            };
          }
        }
      },
    },
    {
      name: 'remove',
      description: `Remove a ${domain} knowledge entry by ID.`,
      auth: 'admin',
      schema: z.object({ id: z.string() }),
      handler: async (params) => {
        const removed = vault.remove(params.id as string);
        return { removed, id: params.id };
      },
    },
  ];

  return {
    name: facadeName,
    description: `${capitalize(domain.replace(/-/g, ' '))} patterns, rules, and guidance.`,
    ops,
  };
}

/**
 * Create domain facades for all domains, with optional pack support.
 *
 * When packs are provided:
 * - For each domain, check if any pack claims it via pack.domains[]
 * - If a pack claims the domain: pack ops are PRIMARY, standard 5 ops are
 *   FALLBACK (only for op names not defined by the pack)
 * - Pack standalone facades (pack.facades[]) are registered as additional
 *   MCP tools with agentId prefix
 * - Domains not claimed by any pack get the standard 5 ops (OCP)
 *
 * When packs is undefined or empty: identical to previous behavior.
 *
 * @param runtime - The agent runtime
 * @param agentId - Agent identifier
 * @param domains - Array of domain names
 * @param packs - Optional array of loaded domain packs
 */
export function createDomainFacades(
  runtime: AgentRuntime,
  agentId: string,
  domains: string[],
  packs?: DomainPack[],
): FacadeConfig[] {
  // Build a map: domain name → pack that claims it
  const packByDomain = new Map<string, DomainPack>();
  if (packs) {
    for (const pack of packs) {
      for (const domain of pack.domains) {
        packByDomain.set(domain, pack);
      }
    }
  }

  // Create domain facades (with pack merge when applicable)
  const domainFacades = domains.map((domain) => {
    const pack = packByDomain.get(domain);
    if (!pack) {
      // No pack claims this domain — standard 5-op facade (OCP)
      return createDomainFacade(runtime, agentId, domain);
    }

    // Pack claims this domain — merge ops
    const standardFacade = createDomainFacade(runtime, agentId, domain);
    const packOpNames = new Set(pack.ops.map((op) => op.name));

    // Pack ops are primary; standard ops are fallback for unclaimed names
    const mergedOps: OpDefinition[] = [
      ...pack.ops,
      ...standardFacade.ops.filter((op) => !packOpNames.has(op.name)),
    ];

    return {
      ...standardFacade,
      ops: mergedOps,
    };
  });

  // Collect standalone facades from packs (prefixed with agentId)
  const standaloneFacades: FacadeConfig[] = [];
  if (packs) {
    for (const pack of packs) {
      if (pack.facades) {
        for (const facade of pack.facades) {
          standaloneFacades.push({
            ...facade,
            name: `${agentId}_${facade.name}`,
          });
        }
      }
    }
  }

  return [...domainFacades, ...standaloneFacades];
}
