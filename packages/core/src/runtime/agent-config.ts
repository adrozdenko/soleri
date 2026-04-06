/**
 * Agent configuration — reads and types the agent.yaml file from an agent directory.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Typed representation of an agent.yaml configuration file. */
export interface AgentConfig {
  id?: string;
  capabilities?: string[];
  probes?: string[];
  /** Maps workflow name to intent string (e.g. 'deliver' → 'DELIVER'). */
  workflows?: Record<string, string>;
}

/**
 * Default agent configuration — standard probes and workflow → intent mappings.
 * Callers should merge this with the loaded config (loaded config wins).
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  probes: ['vault', 'brain', 'designSystem', 'sessionStore', 'projectRules', 'active', 'test'],
  workflows: {
    'feature-dev': 'BUILD',
    'bug-fix': 'FIX',
    'code-review': 'REVIEW',
    'component-build': 'BUILD',
    'token-migration': 'ENHANCE',
    'a11y-remediation': 'FIX',
    deliver: 'DELIVER',
    plan: 'PLAN',
    design: 'DESIGN',
    explore: 'EXPLORE',
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
