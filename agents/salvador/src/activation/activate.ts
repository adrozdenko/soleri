import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { PERSONA } from '../identity/persona.js';
import { hasAgentMarker, removeClaudeMdGlobal } from './inject-claude-md.js';
import type { AgentRuntime } from '@soleri/core';

export interface ActivationResult {
  activated: boolean;
  origin: {
    name: string;
    role: string;
    description: string;
  };
  current: {
    role: string;
    greeting: string;
    domains: string[];
    capabilities: Array<{ domain: string; entries: number }>;
    installed_packs: Array<{ id: string; type: string }>;
  };
  guidelines: string[];
  session_instruction: string;
  setup_status: {
    claude_md_injected: boolean;
    global_claude_md_injected: boolean;
    vault_has_entries: boolean;
    vault_entry_count: number;
  };
  executing_plans: Array<{ id: string; objective: string; tasks: number; completed: number }>;
  next_steps: string[];
}

export interface DeactivationResult {
  deactivated: boolean;
  message: string;
  cleanup?: {
    globalClaudeMd: boolean;
  };
}

/**
 * Activate Salvador — discovers current capabilities and returns adaptive context.
 *
 * PERSONA is the birth config. The activation response reflects what the agent
 * has become through installed packs, captured knowledge, and identity updates.
 */
export function activateAgent(runtime: AgentRuntime, projectPath: string): ActivationResult {
  const { vault, planner, identityManager } = runtime;

  // ─── Setup status ──────────────────────────────────────────
  const projectClaudeMd = join(projectPath, 'CLAUDE.md');
  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md');
  const claudeMdInjected = hasAgentMarker(projectClaudeMd);
  const globalClaudeMdInjected = hasAgentMarker(globalClaudeMd);

  // ─── Vault stats — what the agent actually knows ──────────
  const stats = vault.stats();
  const vaultHasEntries = stats.totalEntries > 0;

  // ─── Discover domains ─────────────────────────────────────
  const configuredDomains: string[] = ['design', 'component', 'figma', 'code-review'];
  const vaultDomains = Object.keys(stats.byDomain);

  // Merge configured + vault-discovered domains (dedup)
  const allDomains = [...new Set([...configuredDomains, ...vaultDomains])];

  // Build capability map — entries per domain
  const capabilities = allDomains.map((d) => ({
    domain: d,
    entries: stats.byDomain[d] ?? 0,
  }));

  // ─── Discover installed packs ─────────────────────────────
  const installedPacks: Array<{ id: string; type: string }> = [];
  try {
    const lockPath = join(projectPath, 'soleri.lock');
    if (existsSync(lockPath)) {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (lockData.packs) {
        for (const [id, entry] of Object.entries(lockData.packs)) {
          installedPacks.push({ id, type: (entry as Record<string, string>).type ?? 'unknown' });
        }
      }
    }
  } catch {
    // Lock file missing or corrupt — proceed without pack info
  }

  // ─── Dynamic role — based on what the agent actually covers ─
  const currentIdentity = identityManager.getIdentity('salvador');
  const newDomains = allDomains.filter((d) => !configuredDomains.includes(d));
  let currentRole = currentIdentity?.role ?? PERSONA.role;

  // If the agent has grown beyond its birth domains, reflect that
  if (newDomains.length > 0) {
    const formatted = newDomains.map((d) => d.replace(/-/g, ' ')).join(', ');
    currentRole = `${PERSONA.role} (also covering ${formatted})`;
  }

  // ─── Dynamic greeting ─────────────────────────────────────
  let greeting = `Hello! I'm ${PERSONA.name}.`;
  if (allDomains.length > configuredDomains.length) {
    greeting += ` I started as a ${PERSONA.role} and have expanded to also cover ${newDomains.map((d) => d.replace(/-/g, ' ')).join(', ')}.`;
  } else {
    greeting += ` ${PERSONA.role} ready to help.`;
  }
  if (stats.totalEntries > 0) {
    const domainSummary = capabilities
      .filter((c) => c.entries > 0)
      .map((c) => `${c.entries} ${c.domain.replace(/-/g, ' ')}`)
      .join(', ');
    greeting += ` Vault: ${stats.totalEntries} entries (${domainSummary}).`;
  }

  // ─── Next steps ───────────────────────────────────────────
  const nextSteps: string[] = [];
  if (!globalClaudeMdInjected && !claudeMdInjected) {
    nextSteps.push(
      'No CLAUDE.md configured — run inject_claude_md with global: true for all projects, or without for this project only',
    );
  } else if (!globalClaudeMdInjected) {
    nextSteps.push(
      'Global CLAUDE.md not configured — run inject_claude_md with global: true to enable activation in all projects',
    );
  }
  if (!vaultHasEntries) {
    nextSteps.push(
      'Vault is empty — start capturing knowledge with the domain capture ops, or install a knowledge pack with soleri pack install',
    );
  }

  // Check for executing plans
  const executingPlans = planner
    ? planner.getExecuting().map((p) => ({
        id: p.id,
        objective: p.objective,
        tasks: p.tasks.length,
        completed: p.tasks.filter((t) => t.status === 'completed').length,
      }))
    : [];
  if (executingPlans.length > 0) {
    nextSteps.unshift(`${executingPlans.length} plan(s) in progress — use get_plan to review`);
  }

  if (nextSteps.length === 0) {
    nextSteps.push('All set! Salvador is ready.');
  }

  return {
    activated: true,
    origin: {
      name: PERSONA.name,
      role: PERSONA.role,
      description: PERSONA.description,
    },
    current: {
      role: currentRole,
      greeting,
      domains: allDomains,
      capabilities,
      installed_packs: installedPacks,
    },
    guidelines: [
      'Consistency over novelty',
      'Accessible by default',
      'Content drives layout, not the reverse',
      'Every pixel needs a reason',
      'Design for the edge case, not just the happy path',
    ],
    session_instruction:
      `You are ${PERSONA.name}. Your origin role is ${PERSONA.role}, but you have grown — your current capabilities span: ${allDomains.join(', ')}. ` +
      'Adapt your expertise to match your actual knowledge. ' +
      'Reference patterns from the knowledge vault. Provide concrete examples. Flag anti-patterns with severity.',
    setup_status: {
      claude_md_injected: claudeMdInjected,
      global_claude_md_injected: globalClaudeMdInjected,
      vault_has_entries: vaultHasEntries,
      vault_entry_count: stats.totalEntries,
    },
    executing_plans: executingPlans,
    next_steps: nextSteps,
  };
}

/**
 * Deactivate Salvador — drops persona and cleans up CLAUDE.md sections.
 */
export function deactivateAgent(): DeactivationResult {
  const globalResult = removeClaudeMdGlobal();
  return {
    deactivated: true,
    message: 'Goodbye! ' + PERSONA.name + ' persona deactivated. Reverting to default behavior.',
    cleanup: {
      globalClaudeMd: globalResult.removed,
    },
  };
}
