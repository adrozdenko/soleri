/**
 * Builds the pre-flight manifest for session_start responses.
 * Extracted as a pure function for testability.
 *
 * WS1 "Session Briefing Diet": the manifest carries ONLY Layer 0 identity +
 * a Layer 1 routing index. It does NOT flatten every facade×op into `tools[]`,
 * ship the full domain map, or list every installed skill. Those are retrieved
 * on demand (`admin_tool_list`, `vault.getDomains()`, a skills list op). The
 * routing index is derived directly from the engine module manifest — one row
 * per facade with up to 3 representative intent signals — which keeps the whole
 * payload under the 1,500-token ceiling enforced by `preflight.test.ts`.
 */

import type { PreflightManifest } from './types.js';

/** Max active-plan one-liners surfaced in the briefing. */
const MAX_ACTIVE_PLANS = 3;
/** Max chars of a plan objective in the briefing (the one unbounded human string). */
const MAX_PLAN_TITLE_LEN = 40;
/** Max representative intent signals per routing-index row. */
const MAX_ROUTING_SIGNALS = 3;
/** Max top domains surfaced by entry volume. */
const MAX_TOP_DOMAINS = 4;

/** Minimal module shape the routing index is derived from (subset of ModuleManifestEntry). */
export interface PreflightModule {
  suffix: string;
  description: string;
  keyOps: string[];
  intentSignals?: Record<string, string>;
}

export interface PreflightInput {
  /**
   * Engine module manifest entries — the source of the Layer 1 routing index.
   * Pass `ENGINE_MODULE_MANIFEST` from the caller.
   */
  modules: PreflightModule[];
  /** Agent id — prefixes facade names (only used when `verbose` tools are requested). */
  agentId: string;
  /** Number of installed skills. The full list is retrieved on demand. */
  skillCount: number;
  /** Plans currently in executing state. */
  executingPlans: Array<{ id: string; objective: string; status: string }>;
  /** Whether the vault is connected. */
  vaultConnected?: boolean;
  /** Vault stats. */
  vaultStats: {
    totalEntries: number;
    byDomain: Record<string, number>;
  };
  /**
   * When true, include the full facade×op catalog in `tools[]`. NEVER set during
   * normal session_start — this exists only as an explicit opt-in escape hatch;
   * the on-demand catalog lives in `admin_tool_list`.
   */
  verbose?: boolean;
}

export function buildPreflightManifest(input: PreflightInput): PreflightManifest {
  // Layer 1 routing index — one row per facade, up to 3 intent signals each.
  const routingIndex = input.modules.map((m) => ({
    suffix: m.suffix,
    description: m.description,
    signals: Object.keys(m.intentSignals ?? {}).slice(0, MAX_ROUTING_SIGNALS),
  }));

  const activePlans = input.executingPlans.slice(0, MAX_ACTIVE_PLANS).map((p) => ({
    planId: p.id,
    // Truncate the one unbounded human-authored string to keep the briefing
    // within the Layer 0/1 budget (ruling: `objective[:40]` one-liner spec).
    title:
      p.objective.length > MAX_PLAN_TITLE_LEN
        ? p.objective.slice(0, MAX_PLAN_TITLE_LEN) + '…'
        : p.objective,
    status: p.status,
  }));

  const domainEntries = Object.entries(input.vaultStats.byDomain);
  const topDomains = domainEntries
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TOP_DOMAINS)
    .map(([domain]) => domain);

  const manifest: PreflightManifest = {
    routingIndex,
    skillCount: input.skillCount,
    activePlans,
    vaultSummary: {
      entryCount: input.vaultStats.totalEntries,
      connected: input.vaultConnected ?? true,
      domains: { total: domainEntries.length, top: topDomains },
    },
  };

  // Full catalog is opt-in only (never during normal session_start).
  if (input.verbose) {
    const tools: NonNullable<PreflightManifest['tools']> = [];
    for (const m of input.modules) {
      const facadeName = `${input.agentId}_${m.suffix}`;
      for (const op of m.keyOps) {
        tools.push({ facade: facadeName, op, description: m.description });
      }
    }
    manifest.tools = tools;
  }

  return manifest;
}
