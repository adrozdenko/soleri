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

export interface AgentEngineConfig {
  /**
   * Opt-in session_start maintenance side effects.
   * Configure in agent.yaml as `engine.autoOps`; all flags default to false.
   */
  autoOps?: AgentAutoOpsConfig;
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

export const DEFAULT_AUTO_OPS_CONFIG: Required<AgentAutoOpsConfig> = {
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
