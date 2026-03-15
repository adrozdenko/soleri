/**
 * Capability probes — detect what subsystems are available at runtime.
 * All probes are resilient: they catch errors and return false on failure.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRuntime } from '../runtime/types.js';
import type { ProbeResults } from './types.js';

/**
 * Run all 6 capability probes in parallel and return results.
 */
export async function runProbes(runtime: AgentRuntime, projectPath: string): Promise<ProbeResults> {
  const [vault, brain, designSystem, sessionStore, projectRules, active] = await Promise.all([
    probeVault(runtime),
    probeBrain(runtime),
    probeDesignSystem(runtime),
    probeSessionStore(),
    probeProjectRules(projectPath),
    probeActive(),
  ]);

  return { vault, brain, designSystem, sessionStore, projectRules, active };
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

async function probeDesignSystem(runtime: AgentRuntime): Promise<boolean> {
  try {
    return runtime.projectRegistry.list().length > 0;
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
