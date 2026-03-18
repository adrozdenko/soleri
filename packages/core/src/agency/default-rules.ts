/**
 * Default suggestion rules — 6 built-in rules that work for any agent.
 * Registered on agent startup so agency_suggestions works out of the box.
 */

import type { SuggestionRule } from './types.js';

export const DEFAULT_SUGGESTION_RULES: SuggestionRule[] = [
  {
    name: 'many-warnings',
    description: 'Fires when 5+ warnings are pending',
    condition: (ctx) => ctx.pendingWarnings.length >= 5,
    generate: (ctx) => ({
      rule: 'many-warnings',
      title: `${ctx.pendingWarnings.length} warnings pending`,
      description: `You have ${ctx.pendingWarnings.length} unresolved warnings — consider running a scan or addressing the critical ones.`,
      priority: 'high',
      action: 'Run agency_warnings to review',
    }),
  },
  {
    name: 'stale-patterns',
    description: 'Fires when surfaced patterns suggest stale knowledge',
    condition: (ctx) => ctx.surfacedPatterns.length === 0 && ctx.fileChangesProcessed > 20,
    generate: () => ({
      rule: 'stale-patterns',
      title: 'Knowledge base maintenance recommended',
      description:
        'No patterns surfaced despite significant file activity — vault may need grooming or new knowledge.',
      priority: 'medium',
      action: 'Run curator_health_audit',
    }),
  },
  {
    name: 'high-activity-no-capture',
    description: 'Fires when many files changed but no patterns captured',
    condition: (ctx) => ctx.fileChangesProcessed > 50 && ctx.surfacedPatterns.length === 0,
    generate: (ctx) => ({
      rule: 'high-activity-no-capture',
      title: 'Long session without knowledge capture',
      description: `${ctx.fileChangesProcessed} file changes processed — consider capturing what you've learned.`,
      priority: 'medium',
      action: 'Run smart_capture or radar_analyze',
    }),
  },
  {
    name: 'critical-warnings',
    description: 'Fires when critical-severity warnings exist',
    condition: (ctx) => ctx.pendingWarnings.some((w) => w.severity === 'critical'),
    generate: (ctx) => {
      const critical = ctx.pendingWarnings.filter((w) => w.severity === 'critical');
      return {
        rule: 'critical-warnings',
        title: `${critical.length} critical warning(s) need attention`,
        description: critical.map((w) => w.message).join('; '),
        priority: 'high',
      };
    },
  },
  {
    name: 'pattern-surfaced',
    description: 'Fires when relevant vault patterns were found for changed files',
    condition: (ctx) => ctx.surfacedPatterns.length > 0,
    generate: (ctx) => ({
      rule: 'pattern-surfaced',
      title: `${ctx.surfacedPatterns.length} relevant pattern(s) found`,
      description: ctx.surfacedPatterns.map((p) => `${p.title} (${p.domain})`).join(', '),
      priority: 'low',
    }),
  },
  {
    name: 'first-session',
    description: 'Fires on first use when no file changes have been processed',
    condition: (ctx) => ctx.fileChangesProcessed === 0 && ctx.pendingWarnings.length === 0,
    generate: () => ({
      rule: 'first-session',
      title: 'Agency mode ready',
      description:
        'File watching and proactive suggestions are enabled. Start editing files to see patterns and warnings.',
      priority: 'low',
    }),
  },
];
