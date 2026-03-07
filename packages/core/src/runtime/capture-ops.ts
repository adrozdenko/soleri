/**
 * Intelligent capture operations — 4 ops for governance-gated knowledge capture
 * and project-scoped intelligent search.
 *
 * Ops: capture_knowledge, capture_quick, search_intelligent, search_feedback.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';

/**
 * Create the 4 intelligent capture operations for an agent runtime.
 *
 * Groups: capture (2), search (2).
 */
export function createCaptureOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, governance } = runtime;

  return [
    // ─── Capture ──────────────────────────────────────────────────
    {
      name: 'capture_knowledge',
      description:
        'Batch-capture knowledge entries with governance gating and auto-enrichment via TF-IDF tagging.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        entries: z.array(
          z.object({
            id: z.string().optional(),
            type: z
              .enum([
                'pattern',
                'anti-pattern',
                'rule',
                'playbook',
                'workflow',
                'principle',
                'reference',
              ])
              .describe('Entry type'),
            domain: z.string(),
            title: z.string(),
            severity: z.enum(['critical', 'warning', 'info']).optional().default('info'),
            description: z.string(),
            tags: z.array(z.string()).optional().default([]),
            context: z.string().optional(),
            example: z.string().optional(),
            counterExample: z.string().optional(),
            why: z.string().optional(),
          }),
        ),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? '.';
        const entries = params.entries as Array<{
          id?: string;
          type: string;
          domain: string;
          title: string;
          severity?: string;
          description: string;
          tags?: string[];
          context?: string;
          example?: string;
          counterExample?: string;
          why?: string;
        }>;

        let captured = 0;
        let proposed = 0;
        let rejected = 0;
        let duplicated = 0;
        const results: Array<{ id: string; action: string; reason?: string }> = [];

        for (const entry of entries) {
          const entryId =
            entry.id ?? `${entry.domain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const mappedSeverity = mapSeverity(entry.severity);
          const mappedType = mapType(entry.type);

          try {
            const decision = governance.evaluateCapture(projectPath, {
              type: mappedType,
              category: entry.domain,
              title: entry.title,
            });

            switch (decision.action) {
              case 'capture': {
                try {
                  const captureResult = brain.enrichAndCapture({
                    id: entryId,
                    type: mappedType as 'pattern' | 'anti-pattern' | 'rule' | 'playbook',
                    domain: entry.domain,
                    title: entry.title,
                    severity: mappedSeverity,
                    description: entry.description,
                    tags: entry.tags ?? [],
                    context: entry.context,
                    example: entry.example,
                    counterExample: entry.counterExample,
                    why: entry.why,
                  });
                  if (captureResult.blocked) {
                    duplicated++;
                    results.push({
                      id: captureResult.duplicate?.id ?? entryId,
                      action: 'duplicate',
                    });
                  } else {
                    captured++;
                    results.push({ id: entryId, action: 'capture' });
                  }
                } catch (err) {
                  rejected++;
                  results.push({
                    id: entryId,
                    action: 'error',
                    reason: err instanceof Error ? err.message : String(err),
                  });
                }
                break;
              }
              case 'propose': {
                try {
                  governance.propose(
                    projectPath,
                    {
                      entryId,
                      title: entry.title,
                      type: mappedType,
                      category: entry.domain,
                      data: {
                        severity: mappedSeverity,
                        description: entry.description,
                        context: entry.context,
                        example: entry.example,
                        counterExample: entry.counterExample,
                        why: entry.why,
                        tags: entry.tags,
                      },
                    },
                    'capture-ops',
                  );
                  proposed++;
                  results.push({ id: entryId, action: 'propose', reason: decision.reason });
                } catch (err) {
                  rejected++;
                  results.push({
                    id: entryId,
                    action: 'error',
                    reason: err instanceof Error ? err.message : String(err),
                  });
                }
                break;
              }
              default: {
                // reject or quarantine
                rejected++;
                results.push({ id: entryId, action: decision.action, reason: decision.reason });
              }
            }
          } catch (err) {
            rejected++;
            results.push({
              id: entryId,
              action: 'error',
              reason: err instanceof Error ? err.message : String(err),
            });
          }
        }

        return { captured, proposed, rejected, duplicated, results };
      },
    },

    {
      name: 'capture_quick',
      description:
        'Quick single-entry capture with minimal required fields. Auto-generates ID and infers severity.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        type: z
          .enum([
            'pattern',
            'anti-pattern',
            'rule',
            'playbook',
            'workflow',
            'principle',
            'reference',
          ])
          .describe('Entry type'),
        domain: z.string(),
        title: z.string(),
        description: z.string(),
        tags: z.array(z.string()).optional().default([]),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? '.';
        const entryType = params.type as string;
        const domain = params.domain as string;
        const title = params.title as string;
        const description = params.description as string;
        const tags = (params.tags as string[] | undefined) ?? [];

        const id = `${domain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mappedSeverity = 'info' as const;
        const mappedType = mapType(entryType);

        try {
          const decision = governance.evaluateCapture(projectPath, {
            type: mappedType,
            category: domain,
            title,
          });

          switch (decision.action) {
            case 'capture': {
              try {
                const captureResult = brain.enrichAndCapture({
                  id,
                  type: mappedType as 'pattern' | 'anti-pattern' | 'rule' | 'playbook',
                  domain,
                  title,
                  severity: mapSeverity(mappedSeverity),
                  description,
                  tags,
                });
                if (captureResult.blocked) {
                  return {
                    captured: false,
                    id: captureResult.duplicate?.id ?? id,
                    governance: { action: 'duplicate' as const },
                  };
                }
                return { captured: true, id, governance: { action: 'capture' as const } };
              } catch (err) {
                return {
                  captured: false,
                  id,
                  governance: {
                    action: 'error' as const,
                    reason: err instanceof Error ? err.message : String(err),
                  },
                };
              }
            }
            case 'propose': {
              try {
                governance.propose(
                  projectPath,
                  {
                    entryId: id,
                    title,
                    type: mappedType,
                    category: domain,
                    data: { severity: mapSeverity(mappedSeverity), description, tags },
                  },
                  'capture-ops-quick',
                );
                return {
                  captured: false,
                  id,
                  governance: { action: 'propose' as const, reason: decision.reason },
                };
              } catch (err) {
                return {
                  captured: false,
                  id,
                  governance: {
                    action: 'error' as const,
                    reason: err instanceof Error ? err.message : String(err),
                  },
                };
              }
            }
            default: {
              return {
                captured: false,
                id,
                governance: { action: decision.action, reason: decision.reason },
              };
            }
          }
        } catch (err) {
          return {
            captured: false,
            id,
            governance: {
              action: 'error' as const,
              reason: err instanceof Error ? err.message : String(err),
            },
          };
        }
      },
    },

    // ─── Search ────────────────────────────────────────────────────
    {
      name: 'search_intelligent',
      description:
        'Project-scoped intelligent search combining vault FTS, brain TF-IDF ranking, and optional memory search.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        projectPath: z.string().optional(),
        domain: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().optional().default(20),
        includeMemories: z.boolean().optional().default(false),
      }),
      handler: async (params) => {
        const query = params.query as string;
        const domain = params.domain as string | undefined;
        const type = params.type as string | undefined;
        const limit = (params.limit as number | undefined) ?? 20;
        const includeMemories = (params.includeMemories as boolean | undefined) ?? false;

        // Search vault via brain's intelligent search (TF-IDF ranked)
        let vaultResults: Array<{ source: string; [key: string]: unknown }> = [];
        try {
          const ranked = await brain.intelligentSearch(query, { domain, type, limit });
          vaultResults = ranked.map((r) => ({ ...r, source: 'vault' }));
        } catch {
          // Graceful degradation — return empty vault results
        }

        // Optionally include memories
        let memoryResults: Array<{ source: string; [key: string]: unknown }> = [];
        if (includeMemories) {
          try {
            const memories = vault.searchMemories(query, { limit });
            memoryResults = memories.map((m) => ({ ...m, source: 'memory', score: 0.5 }));
          } catch {
            // Graceful degradation — return empty memory results
          }
        }

        // Merge and sort by score descending
        const combined = [...vaultResults, ...memoryResults];
        combined.sort((a, b) => ((b.score as number) ?? 0) - ((a.score as number) ?? 0));

        return combined.slice(0, limit);
      },
    },

    {
      name: 'search_feedback',
      description:
        'Record feedback on search results to improve future ranking via brain learning.',
      auth: 'write',
      schema: z.object({
        query: z.string(),
        entryId: z.string(),
        helpful: z.boolean(),
        context: z.string().optional(),
      }),
      handler: async (params) => {
        const query = params.query as string;
        const entryId = params.entryId as string;
        const helpful = params.helpful as boolean;
        const context = params.context as string | undefined;

        try {
          const action = helpful ? 'accepted' : 'dismissed';
          brain.recordFeedback(query, entryId, action);
          return { recorded: true, query, entryId, action, context: context ?? null };
        } catch (err) {
          return {
            recorded: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
  ];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Map extended severity values to IntelligenceEntry-compatible severity.
 * 'info' maps to 'suggestion' (the closest existing severity level).
 */
function mapSeverity(severity: string | undefined): 'critical' | 'warning' | 'suggestion' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'info':
    default:
      return 'suggestion';
  }
}

/**
 * Map extended type values to IntelligenceEntry-compatible types.
 * 'workflow', 'principle', 'reference' map to 'rule' (the closest existing type).
 */
function mapType(type: string): 'pattern' | 'anti-pattern' | 'rule' | 'playbook' {
  switch (type) {
    case 'pattern':
      return 'pattern';
    case 'anti-pattern':
      return 'anti-pattern';
    case 'playbook':
      return 'playbook';
    case 'rule':
    case 'workflow':
    case 'principle':
    case 'reference':
    default:
      return 'rule';
  }
}
