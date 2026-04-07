/**
 * Intelligent capture operations — 4 ops for governance-gated knowledge capture
 * and project-scoped intelligent search.
 *
 * Ops: capture_knowledge, capture_quick, search_intelligent, search_feedback.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from './types.js';
import { coerceArray } from './schema-helpers.js';
import { detectScope } from '../vault/scope-detector.js';
import type { ScopeTier, ScopeDetectionResult } from '../vault/scope-detector.js';
import { syncEntryToMarkdown } from '../vault/vault-markdown-sync.js';
import { autoLinkWithReport } from '../vault/vault-entries.js';
import { agentKnowledgeDir, projectKnowledgeDir, findProjectRoot } from '../paths.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

/**
 * Create the 4 intelligent capture operations for an agent runtime.
 *
 * Groups: capture (2), search (2).
 */
export function createCaptureOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, governance, linkManager, config } = runtime;

  return [
    // ─── Capture ──────────────────────────────────────────────────
    {
      name: 'capture_knowledge',
      description:
        'Batch-capture knowledge entries with governance gating and auto-enrichment via TF-IDF tagging.',
      auth: 'write',
      schema: z.preprocess(
        (val) => {
          // Auto-wrap flat entry fields into { entries: [val] } so callers don't need the wrapper
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            const obj = val as Record<string, unknown>;
            if (obj.entries === undefined && (obj.type !== undefined || obj.title !== undefined)) {
              return { entries: [obj] };
            }
          }
          return val;
        },
        z.object({
          projectPath: z.string().optional().default('.'),
          tier: z
            .enum(['agent', 'project', 'team'])
            .optional()
            .describe('Manual tier override. If omitted, tier is auto-detected from content.'),
          entries: coerceArray(
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
              tier: z
                .enum(['agent', 'project', 'team'])
                .optional()
                .describe(
                  'Per-entry tier override. Falls back to top-level tier, then auto-detect.',
                ),
            }),
          ),
        }),
      ),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? '.';
        const topTier = params.tier as ScopeTier | undefined;
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
          tier?: ScopeTier;
        }>;

        let captured = 0;
        let proposed = 0;
        let rejected = 0;
        let duplicated = 0;
        const results: Array<{
          id: string;
          action: string;
          reason?: string;
          scope?: { tier: ScopeTier; confidence: string; reason: string };
        }> = [];

        for (const entry of entries) {
          const entryId =
            entry.id ?? `${entry.domain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const mappedSeverity = mapSeverity(entry.severity);
          const mappedType = mapType(entry.type);

          // Scope detection: per-entry tier > top-level tier > auto-detect
          const resolvedTier = entry.tier ?? topTier;
          let scopeResult: ScopeDetectionResult | undefined;
          let finalTier: ScopeTier;
          if (resolvedTier) {
            finalTier = resolvedTier;
          } else {
            scopeResult = detectScope({
              title: entry.title,
              description: entry.description,
              category: entry.domain,
              tags: entry.tags,
            });
            finalTier = scopeResult.tier;
          }

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
                    tier: finalTier,
                    origin: 'user',
                  });
                  const scopeMeta = scopeResult
                    ? {
                        tier: scopeResult.tier,
                        confidence: scopeResult.confidence,
                        reason: scopeResult.reason,
                      }
                    : {
                        tier: finalTier,
                        confidence: 'MANUAL' as const,
                        reason: 'explicit override',
                      };
                  if (captureResult.blocked) {
                    duplicated++;
                    results.push({
                      id: captureResult.duplicate?.id ?? entryId,
                      action: 'duplicate',
                      scope: scopeMeta,
                    });
                  } else {
                    captured++;
                    const result: (typeof results)[number] = {
                      id: entryId,
                      action: 'capture',
                      scope: scopeMeta,
                    };
                    if (scopeResult?.confidence === 'LOW') {
                      result.reason =
                        'Low confidence scope detection — consider reviewing tier assignment';
                    }
                    results.push(result);
                    // Fire-and-forget markdown sync
                    fireAndForgetSync(
                      {
                        id: entryId,
                        type: mappedType as IntelligenceEntry['type'],
                        domain: entry.domain,
                        title: entry.title,
                        severity: mappedSeverity,
                        description: entry.description,
                        tags: entry.tags ?? [],
                        context: entry.context,
                        example: entry.example,
                        counterExample: entry.counterExample,
                        why: entry.why,
                        tier: finalTier,
                        origin: 'user',
                      },
                      config.agentId,
                      projectPath,
                    );
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

        // Auto-link captured entries (Zettelkasten enrichment)
        let autoLinkedCount = 0;
        let suggestedLinks: Array<{
          entryId: string;
          title: string;
          suggestedType: string;
          score: number;
          autoLinked: boolean;
        }> = [];
        try {
          if (captured > 0 && vault.isAutoLinkEnabled()) {
            const capturedIds = results.filter((r) => r.action === 'capture').map((r) => r.id);
            const report = autoLinkWithReport(capturedIds, linkManager);
            autoLinkedCount = report.autoLinkedCount;
            suggestedLinks = report.suggestedLinks;
          }
        } catch {
          /* never break capture for linking failures */
        }

        return {
          captured,
          proposed,
          rejected,
          duplicated,
          autoLinkedCount,
          results,
          ...(suggestedLinks.length > 0 ? { suggestedLinks } : {}),
        };
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
          .optional()
          .default('pattern')
          .describe('Entry type (default: "pattern")'),
        domain: z.string().optional().default('general'),
        title: z.string(),
        description: z.string().optional().describe('Knowledge description (alias: content)'),
        content: z.string().optional().describe('Alias for description'),
        tags: z.array(z.string()).optional().default([]),
        tier: z
          .enum(['agent', 'project', 'team'])
          .optional()
          .describe('Manual tier override. If omitted, tier is auto-detected from content.'),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string | undefined) ?? '.';
        const entryType = (params.type as string | undefined) ?? 'pattern';
        const domain = (params.domain as string | undefined) ?? 'general';
        const title = params.title as string;
        const description =
          (params.description as string | undefined) ??
          (params.content as string | undefined) ??
          '';
        const tags = (params.tags as string[] | undefined) ?? [];
        const manualTier = params.tier as ScopeTier | undefined;

        const id = `${domain}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const mappedSeverity = 'info' as const;
        const mappedType = mapType(entryType);

        // Scope detection
        let scopeResult: ScopeDetectionResult | undefined;
        let finalTier: ScopeTier;
        if (manualTier) {
          finalTier = manualTier;
        } else {
          scopeResult = detectScope({ title, description, category: domain, tags });
          finalTier = scopeResult.tier;
        }
        const scopeMeta = scopeResult
          ? {
              tier: scopeResult.tier,
              confidence: scopeResult.confidence,
              reason: scopeResult.reason,
            }
          : { tier: finalTier, confidence: 'MANUAL' as const, reason: 'explicit override' };

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
                  tier: finalTier,
                  origin: 'user',
                });
                if (captureResult.blocked) {
                  return {
                    captured: false,
                    id: captureResult.duplicate?.id ?? id,
                    governance: { action: 'duplicate' as const },
                    scope: scopeMeta,
                  };
                }
                const result: Record<string, unknown> = {
                  captured: true,
                  id,
                  governance: { action: 'capture' as const },
                  scope: scopeMeta,
                };
                if (scopeResult?.confidence === 'LOW') {
                  result.reviewNote =
                    'Low confidence scope detection — consider reviewing tier assignment';
                }
                const PLANNING_TYPES = new Set(['anti-pattern', 'pattern']);
                const PLANNING_TAGS = new Set(['planning-gate', 'rules', 'quality']);
                const hasPlanningType = PLANNING_TYPES.has(mappedType);
                const hasPlanningTag = tags.some((t) => PLANNING_TAGS.has(t));
                if (hasPlanningType || hasPlanningTag) {
                  result.planningNote =
                    'This entry type influences planning but has no content body (context/example/why). ' +
                    'Use capture_knowledge to add those fields — without them, the orchestrator cannot apply this rule during planning.';
                }
                // Fire-and-forget markdown sync
                fireAndForgetSync(
                  {
                    id,
                    type: mappedType as IntelligenceEntry['type'],
                    domain,
                    title,
                    severity: mapSeverity(mappedSeverity),
                    description,
                    tags,
                    tier: finalTier,
                    origin: 'user',
                  },
                  config.agentId,
                  projectPath,
                );
                return result;
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
        'Project-scoped intelligent search combining vault FTS, brain TF-IDF ranking, and optional memory search. mode:"scan" returns lightweight results (titles + scores + snippets) for two-pass retrieval. mode:"full" (default) returns complete entries.',
      auth: 'read',
      schema: z.object({
        query: z.string(),
        projectPath: z.string().optional(),
        domain: z.string().optional(),
        type: z.string().optional(),
        limit: z.number().optional(),
        includeMemories: z.boolean().optional().default(false),
        mode: z
          .enum(['full', 'scan'])
          .optional()
          .default('full')
          .describe(
            'full = complete entries with scoring breakdowns, scan = lightweight titles + scores for two-pass retrieval',
          ),
      }),
      handler: async (params) => {
        const query = params.query as string;
        const domain = params.domain as string | undefined;
        const type = params.type as string | undefined;
        const mode = (params.mode as string | undefined) ?? 'full';
        const isScan = mode === 'scan';
        const limit = (params.limit as number | undefined) ?? (isScan ? 10 : 20);
        const includeMemories = (params.includeMemories as boolean | undefined) ?? false;

        // Search vault — scan mode returns lightweight results, full returns complete entries
        let vaultResults: Array<{ source: string; [key: string]: unknown }> = [];
        try {
          if (isScan) {
            const scanned = await brain.scanSearch(query, { domain, type, limit });
            vaultResults = scanned.map((r) => ({ ...r, source: 'vault' }));
          } else {
            const ranked = await brain.intelligentSearch(query, { domain, type, limit });
            vaultResults = ranked.map((r) => ({ ...r, source: 'vault' }));
          }
        } catch {
          // Graceful degradation — return empty vault results
        }

        // Optionally include memories
        let memoryResults: Array<{ source: string; [key: string]: unknown }> = [];
        if (includeMemories) {
          try {
            const memories = vault.searchMemories(query, { limit });
            if (isScan) {
              // Lightweight memory results for scan mode
              memoryResults = memories.map((m) => {
                const desc = m.summary ?? '';
                return {
                  id: m.id,
                  title: m.context ?? '',
                  snippet: desc.slice(0, 120) + (desc.length > 120 ? '...' : ''),
                  score: 0.5,
                  source: 'memory',
                };
              });
            } else {
              memoryResults = memories.map((m) => ({ ...m, source: 'memory', score: 0.5 }));
            }
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
        query: z.string().describe('The search query that produced this result (required)'),
        entryId: z.string().describe('ID of the vault entry being rated (required)'),
        helpful: z.boolean().describe('Whether the result was helpful — true or false (required)'),
        context: z
          .string()
          .optional()
          .describe('Optional context about why it was or was not helpful'),
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

/** Fire-and-forget markdown sync — never blocks capture, logs errors silently. */
function fireAndForgetSync(entry: IntelligenceEntry, agentId: string, projectPath?: string): void {
  // Always sync to agent home dir
  const agentDir = agentKnowledgeDir(agentId);
  syncEntryToMarkdown(entry, agentDir).catch(() => {
    /* non-blocking — markdown sync is best-effort */
  });

  // Also sync to project-local knowledge dir if a real project path is provided
  if (projectPath && projectPath !== '.') {
    const projDir = projectKnowledgeDir(findProjectRoot(projectPath));
    syncEntryToMarkdown(entry, projDir).catch(() => {
      /* non-blocking — markdown sync is best-effort */
    });
  }
}
