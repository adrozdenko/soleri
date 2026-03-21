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
        const persona = runtime.persona;
        const personaInstructions = runtime.personaInstructions;
        const hasPersona = persona.template !== 'none';

        // Check if identity manager has custom identity (updated after initial seed)
        const customIdentity = runtime.identityManager?.getIdentity(identity.id);
        const hasCustomIdentity = customIdentity && customIdentity.version > 1;

        const agentName = hasCustomIdentity
          ? customIdentity.name
          : hasPersona
            ? persona.name
            : identity.name;
        const agentRole = hasCustomIdentity ? customIdentity.role : identity.role;
        const agentDescription = hasCustomIdentity
          ? customIdentity.description
          : identity.description;

        const response: Record<string, unknown> = {
          activated: true,
          domains: identity.domains,
          agent: {
            id: identity.id,
            name: agentName,
            role: agentRole,
            description: agentDescription,
            format: 'filetree',
          },
          vault: {
            connected: true,
            entries: s.totalEntries,
            domains: Object.keys(s.byDomain),
          },
        };

        if (hasPersona) {
          response.persona = {
            template: persona.template,
            name: hasCustomIdentity ? customIdentity.name : persona.name,
            culture: persona.culture,
            voice: hasCustomIdentity
              ? customIdentity.personality.join(', ') || persona.voice
              : persona.voice,
            traits: hasCustomIdentity ? customIdentity.personality : persona.traits,
            quirks: persona.quirks,
            greeting: personaInstructions.greeting,
            instructions: personaInstructions.instructions,
          };
        } else {
          response.personaSetup = {
            needed: true,
            message: 'No persona configured yet. Would you like to set one up?',
            options: [
              {
                id: 'italian-craftsperson',
                label: 'Italian Craftsperson (default)',
                hint: 'Warm, opinionated about quality, sprinkles Italian expressions — perfetto!',
              },
              {
                id: 'custom',
                label: 'Describe your own',
                hint: 'Tell me who you want your agent to be',
              },
              { id: 'skip', label: 'Skip for now', hint: 'Use the agent without a persona' },
            ],
            hint: 'Run: op:set_persona params:{ template: "italian-craftsperson" } or op:set_persona params:{ description: "A calm zen master who values harmony" }',
          };
        }

        return response;
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
