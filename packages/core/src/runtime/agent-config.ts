/**
 * Agent configuration — reads and types the agent.yaml file from an agent directory.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Typed representation of an agent.yaml configuration file. */
export interface AgentAutoOpsConfig {
  dream?: boolean;
  selfHeal?: boolean;
  orphanReaper?: boolean;
  staleClose?: boolean;
  /** When true, transcript capture hook + red-level health warnings auto-write `type=session` memories. Default false. */
  captureSessions?: boolean;
}

/**
 * Plan-approval ceremony regime — the human review surface for planning.
 *
 * - `full`  — both gates explicit (Gate 1 `approve_plan`, Gate 2 `plan_split`);
 *             grade gate enforced. The decision-making regime.
 * - `light` — Gate 1 auto-approves when the grade gate passes (or the plan is
 *             below the task-count threshold); Gate 2 (`plan_split`) stays the
 *             single explicit human touchpoint. Grade gate still enforced.
 * - `off`   — no gates; plans execute immediately. Grade gate not enforced.
 *             Knowledge capture and reconciliation record-writing STILL run —
 *             ceremony governs gates, never capture.
 */
export type Ceremony = 'full' | 'light' | 'off';

/** All valid ceremony values, in declaration order. */
export const CEREMONY_VALUES: readonly Ceremony[] = ['full', 'light', 'off'] as const;

/**
 * Resolved default when `engine.ceremony` is absent. `full` (not `light`) so
 * existing agents scaffolded before this flag existed keep two-gate behavior —
 * no silent behavior change on upgrade. New agents get an explicit `light`
 * written into agent.yaml by forge (a visible, editable value — not a hidden
 * default).
 */
const DEFAULT_CEREMONY: Ceremony = 'full';

export interface AgentEngineConfig {
  /**
   * Opt-in session_start maintenance side effects.
   * Configure in agent.yaml as `engine.autoOps`; all flags default to false.
   */
  autoOps?: AgentAutoOpsConfig;
  /**
   * Plan-approval ceremony regime. Absent resolves to `full` via
   * `resolveCeremony` (backward compat). Configure in agent.yaml as
   * `engine.ceremony`.
   */
  ceremony?: Ceremony;
}

export interface AgentConfig {
  id?: string;
  capabilities?: string[];
  probes?: string[];
  engine?: AgentEngineConfig;
  /** Maps workflow name to intent string (e.g. 'deliver' → 'DELIVER'). */
  workflows?: Record<string, string>;
  /** Maps capability IDs to their facade/op pairs. Agent-declared overrides extend/replace core defaults. */
  capabilityMap?: Record<string, { facade: string; op: string }>;
}

const DEFAULT_AUTO_OPS_CONFIG: Required<AgentAutoOpsConfig> = {
  dream: false,
  selfHeal: false,
  orphanReaper: false,
  staleClose: false,
  captureSessions: false,
};

export function resolveAutoOpsConfig(config: AgentConfig): Required<AgentAutoOpsConfig> {
  return {
    ...DEFAULT_AUTO_OPS_CONFIG,
    ...config.engine?.autoOps,
  };
}

/**
 * Resolve the effective plan-approval ceremony for an agent.
 *
 * Returns the explicit `engine.ceremony` value when set to a valid regime,
 * otherwise `full` — the backward-compatible default that preserves two-gate
 * behavior for agents scaffolded before this flag existed. An absent field
 * stays distinguishable from an explicit `full` at the config layer (the forge
 * Zod schema uses `.optional()` with no `.default()`); this resolver supplies
 * `full` only at the point of use.
 */
export function resolveCeremony(config: AgentConfig): Ceremony {
  const value = config.engine?.ceremony;
  return value === 'full' || value === 'light' || value === 'off' ? value : DEFAULT_CEREMONY;
}

/**
 * Default agent configuration — standard probes and workflow → intent mappings.
 * Callers should merge this with the loaded config (loaded config wins).
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  probes: ['vault', 'brain', 'sessionStore', 'projectRules', 'active', 'test'],
  workflows: {
    'feature-dev': 'BUILD',
    'bug-fix': 'FIX',
    'code-review': 'REVIEW',
    deliver: 'DELIVER',
    plan: 'PLAN',
    design: 'DESIGN',
    explore: 'EXPLORE',
  },
  capabilityMap: {
    'vault.search': { facade: 'vault', op: 'search_intelligent' },
    'vault.playbook': { facade: 'vault', op: 'search_intelligent' },
    'memory.search': { facade: 'memory', op: 'memory_search' },
    'brain.recommend': { facade: 'brain', op: 'brain_recommend' },
    'brain.strengths': { facade: 'brain', op: 'brain_strengths' },
    'plan.create': { facade: 'plan', op: 'create_plan' },
  },
};

/**
 * Load agent configuration from `<agentDir>/agent.yaml`.
 *
 * Returns the parsed `AgentConfig` if the file exists and is valid YAML.
 * Returns an empty object `{}` if the file is missing or cannot be read —
 * callers are responsible for applying defaults (see `DEFAULT_AGENT_CONFIG`).
 */
export function loadAgentConfig(agentDir: string): AgentConfig {
  const configPath = join(agentDir, 'agent.yaml');
  try {
    const content = readFileSync(configPath, 'utf-8');
    const raw = parseYaml(content);
    if (raw && typeof raw === 'object') {
      return raw as AgentConfig;
    }
    return {};
  } catch {
    return {};
  }
}
