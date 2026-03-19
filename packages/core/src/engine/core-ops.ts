/**
 * Soleri v7 — Agent Core Ops
 *
 * Generates the agent-specific ops (health, identity, activate, setup)
 * from agent.yaml config, without generated TypeScript.
 *
 * These ops were previously hardcoded in the Forge entry-point template.
 * Now they're created dynamically by the engine at startup.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';

export interface AgentIdentityConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  domains: string[];
  principles: string[];
  tone: string;
  greeting?: string;
}

/**
 * Create agent-specific core ops from identity config.
 * These are registered under `{agentId}_core`.
 */
export function createCoreOps(
  runtime: AgentRuntime,
  identity: AgentIdentityConfig,
): OpDefinition[] {
  return [
    {
      name: 'health',
      description: 'Health check — vault status and agent info.',
      auth: 'read',
      handler: async () => {
        const s = runtime.vault.stats();
        return {
          status: 'ok',
          agent: { name: identity.name, role: identity.role, format: 'filetree' },
          vault: { entries: s.totalEntries, domains: Object.keys(s.byDomain) },
        };
      },
    },
    {
      name: 'identity',
      description: 'Get agent identity — name, role, principles.',
      auth: 'read',
      handler: async () => {
        // Check IdentityManager first (may have evolved via updates)
        const managed = runtime.identityManager?.getIdentity(identity.id);
        if (managed) return managed;

        return {
          name: identity.name,
          role: identity.role,
          description: identity.description,
          domains: identity.domains,
          principles: identity.principles,
          tone: identity.tone,
        };
      },
    },
    {
      name: 'activate',
      description: `Activate agent persona. Say "Hello, ${identity.name}!" to trigger.`,
      auth: 'read',
      schema: z.object({
        projectPath: z.string().optional().default('.'),
        deactivate: z.boolean().optional(),
      }),
      handler: async (params) => {
        if (params.deactivate) {
          return { deactivated: true, agent: identity.id };
        }

        // Seed identity on first activation
        if (runtime.identityManager && !runtime.identityManager.getIdentity(identity.id)) {
          runtime.identityManager.setIdentity(identity.id, {
            name: identity.name,
            role: identity.role,
            description: identity.description,
            personality: identity.principles,
            changedBy: 'system',
            changeReason: 'Initial identity seeded from agent.yaml',
          });
        }

        // Register project if project registry available
        const projectPath = (params.projectPath as string) ?? '.';
        if (runtime.projectRegistry) {
          try {
            runtime.projectRegistry.register(projectPath);
          } catch {
            // Project may already be registered
          }
        }

        // Build activation context
        const s = runtime.vault.stats();
        return {
          activated: true,
          agent: {
            id: identity.id,
            name: identity.name,
            role: identity.role,
            description: identity.description,
            format: 'filetree',
          },
          persona: {
            tone: identity.tone,
            principles: identity.principles,
            greeting: identity.greeting ?? `Hello! I am ${identity.name}.`,
          },
          vault: {
            connected: true,
            entries: s.totalEntries,
            domains: Object.keys(s.byDomain),
          },
          domains: identity.domains,
        };
      },
    },
    {
      name: 'register',
      description: 'Register a project for context tracking.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().default('.'),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string) ?? '.';
        if (runtime.projectRegistry) {
          try {
            const project = runtime.projectRegistry.register(projectPath);
            return { registered: true, project };
          } catch {
            return { registered: false, reason: 'Already registered or error' };
          }
        }
        return { registered: false, reason: 'Project registry not available' };
      },
    },
    {
      name: 'setup',
      description: 'Check setup status — vault entries, engine health, domain packs.',
      auth: 'read',
      handler: async () => {
        const s = runtime.vault.stats();
        return {
          agent: {
            id: identity.id,
            name: identity.name,
            format: 'filetree',
          },
          vault: {
            entries: s.totalEntries,
            domains: Object.keys(s.byDomain),
            byType: s.byType,
          },
          engine: {
            brain: true,
            curator: true,
            planner: true,
          },
          recommendations:
            s.totalEntries === 0
              ? ['Vault is empty — capture knowledge to start building intelligence']
              : [],
        };
      },
    },
  ];
}
