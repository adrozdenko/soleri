/**
 * Capability probes — detect what subsystems are available at runtime.
 * All probes are resilient: they catch errors and return false on failure.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRuntime } from '../runtime/types.js';
import type { ProbeResults } from './types.js';

/**
 * Run capability probes in parallel and return results.
 *
 * @param probeNames - Optional allowlist of probe names to run. When provided and non-empty,
 *   only the listed probes execute; all others are set to `false` in the result.
 *   When omitted (or empty), all probes run as before (backward compatible).
 */
export async function runProbes(
  runtime: AgentRuntime,
  projectPath: string,
  probeNames?: string[],
): Promise<ProbeResults> {
  const filter = probeNames && probeNames.length > 0 ? new Set(probeNames) : null;

  const should = (name: string) => filter === null || filter.has(name);

  const [vault, brain, sessionStore, projectRules, active, test] = await Promise.all([
    should('vault') ? probeVault(runtime) : Promise.resolve(false),
    should('brain') ? probeBrain(runtime) : Promise.resolve(false),
    should('sessionStore') ? probeSessionStore() : Promise.resolve(false),
    should('projectRules') ? probeProjectRules(projectPath) : Promise.resolve(false),
    should('active') ? probeActive() : Promise.resolve(false),
    should('test') ? probeTestRunner(projectPath) : Promise.resolve(false),
  ]);

  return { vault, brain, sessionStore, projectRules, active, test };
}

async function probeVault(runtime: AgentRuntime): Promise<boolean> {
  try {
    const stats = runtime.vault.stats();
    return stats.totalEntries >= 0;
  } catch {
    return false;
  }
}

async function probeBrain(runtime: AgentRuntime): Promise<boolean> {
  try {
    return runtime.brain.getVocabularySize() > 0;
  } catch {
    return false;
  }
}

async function probeSessionStore(): Promise<boolean> {
  // Session store is always available in Soleri runtime
  return true;
}

async function probeProjectRules(projectPath: string): Promise<boolean> {
  try {
    return (
      existsSync(join(projectPath, 'docs', 'vault')) || existsSync(join(projectPath, '.soleri'))
    );
  } catch {
    return false;
  }
}

async function probeActive(): Promise<boolean> {
  // Always true when the engine is running
  return true;
}

async function probeTestRunner(projectPath: string): Promise<boolean> {
  try {
    return (
      existsSync(join(projectPath, 'vitest.config.ts')) ||
      existsSync(join(projectPath, 'vitest.config.js')) ||
      existsSync(join(projectPath, 'jest.config.ts')) ||
      existsSync(join(projectPath, 'jest.config.js'))
    );
  } catch {
    return false;
  }
}
