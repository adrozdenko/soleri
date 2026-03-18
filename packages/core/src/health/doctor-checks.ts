/**
 * Doctor Checks — 8 specialized health checks for comprehensive diagnostics.
 *
 * Each check validates a subsystem and reports pass/warn/fail.
 */

import type { HealthRegistry } from './health-registry.js';
import type { AgentRuntime } from '../runtime/types.js';

export interface DoctorCheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export function runDoctorChecks(runtime: AgentRuntime): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];

  // 1. Config
  try {
    const id = runtime.config.agentId;
    results.push({
      check: 'config',
      status: id ? 'pass' : 'fail',
      message: id ? `Agent "${id}" configured` : 'No agent ID',
    });
  } catch (e) {
    results.push({ check: 'config', status: 'fail', message: (e as Error).message });
  }

  // 2. Database
  try {
    runtime.vault.getProvider().get<{ v: number }>('PRAGMA user_version');
    results.push({ check: 'database', status: 'pass', message: 'SQLite healthy' });
  } catch (e) {
    results.push({ check: 'database', status: 'fail', message: (e as Error).message });
  }

  // 3. Vault
  try {
    const stats = runtime.vault.stats();
    results.push({
      check: 'vault',
      status: stats.totalEntries > 0 ? 'pass' : 'warn',
      message: stats.totalEntries > 0 ? `${stats.totalEntries} entries` : 'Vault empty',
    });
  } catch (e) {
    results.push({ check: 'vault', status: 'fail', message: (e as Error).message });
  }

  // 4. LLM
  try {
    const pool = runtime.keyPool;
    const total = (pool.openai?.getActiveKey() ? 1 : 0) + (pool.anthropic?.getActiveKey() ? 1 : 0);
    results.push({
      check: 'llm',
      status: total > 0 ? 'pass' : 'warn',
      message: total > 0 ? `${total} provider(s) available` : 'No API keys — LLM features disabled',
    });
  } catch {
    results.push({ check: 'llm', status: 'warn', message: 'LLM check failed' });
  }

  // 5. Auth
  results.push({
    check: 'auth',
    status: 'pass',
    message: `Mode: ${runtime.authPolicy.mode}`,
  });

  // 6. Plugins
  try {
    const count = runtime.pluginRegistry.list().length;
    results.push({ check: 'plugins', status: 'pass', message: `${count} plugin(s)` });
  } catch {
    results.push({ check: 'plugins', status: 'warn', message: 'Plugin check failed' });
  }

  // 7. Embeddings (Cognee)
  try {
    const available = runtime.cognee?.isAvailable ?? false;
    results.push({
      check: 'embeddings',
      status: available ? 'pass' : 'warn',
      message: available ? 'Cognee available' : 'Cognee not available — vector search disabled',
    });
  } catch {
    results.push({ check: 'embeddings', status: 'warn', message: 'Embedding check failed' });
  }

  // 8. Security
  results.push({
    check: 'security',
    status: runtime.authPolicy.mode === 'permissive' ? 'warn' : 'pass',
    message:
      runtime.authPolicy.mode === 'permissive'
        ? 'Permissive mode — all ops allowed'
        : `Enforcement: ${runtime.authPolicy.mode}`,
  });

  return results;
}

export function registerDoctorChecks(health: HealthRegistry, runtime: AgentRuntime): void {
  const results = runDoctorChecks(runtime);
  for (const r of results) {
    health.register(
      r.check,
      r.status === 'pass' ? 'healthy' : r.status === 'warn' ? 'degraded' : 'down',
    );
    if (r.status !== 'pass') {
      health.update(r.check, r.status === 'warn' ? 'degraded' : 'down', r.message);
    }
  }
}
