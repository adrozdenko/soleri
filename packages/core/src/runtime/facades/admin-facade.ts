/**
 * Admin facade — infrastructure ops.
 * health, config, telemetry, tokens, LLM, prompts.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createAdminOps } from '../admin-ops.js';
import { createAdminExtraOps } from '../admin-extra-ops.js';
import { createAdminSetupOps } from '../admin-setup-ops.js';
import { createSessionBriefingOps } from '../session-briefing.js';
import { createPluginOps } from '../plugin-ops.js';
import { createPackOps } from '../pack-ops.js';
import { createTelemetryOps } from '../telemetry-ops.js';

export function createAdminFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { llmClient, keyPool } = runtime;

  const ops: OpDefinition[] = [
    // ─── LLM (inline from core-ops.ts) ──────────────────────────
    {
      name: 'llm_rotate',
      description:
        'Force rotate the active API key for a provider. Useful when rate-limited or key is failing.',
      auth: 'write',
      schema: z.object({
        provider: z.enum(['openai', 'anthropic']),
      }),
      handler: async (params) => {
        const provider = params.provider as 'openai' | 'anthropic';
        const pool = keyPool[provider];
        if (!pool.hasKeys) return { rotated: false, error: `No ${provider} keys configured` };
        const newKey = pool.rotateOnError();
        return {
          rotated: newKey !== null,
          activeKeyIndex: pool.activeKeyIndex,
          poolSize: pool.poolSize,
          exhausted: pool.exhausted,
        };
      },
    },
    {
      name: 'llm_call',
      description: 'Make an LLM completion call. Uses model routing config and key pool rotation.',
      auth: 'write',
      schema: z.object({
        systemPrompt: z.string().describe('System prompt for the LLM.'),
        userPrompt: z.string().describe('User prompt / task input.'),
        model: z
          .string()
          .optional()
          .describe('Model name. Routed via model-routing.json if omitted.'),
        temperature: z.number().optional().describe('Sampling temperature (0-2). Default 0.3.'),
        maxTokens: z.number().optional().describe('Max output tokens. Default 500.'),
        caller: z.string().optional().describe('Caller name for routing. Default "core-ops".'),
        task: z.string().optional().describe('Task name for routing.'),
      }),
      handler: async (params) => {
        return llmClient.complete({
          model: (params.model as string) || undefined,
          systemPrompt: params.systemPrompt as string,
          userPrompt: params.userPrompt as string,
          temperature: params.temperature as number | undefined,
          maxTokens: params.maxTokens as number | undefined,
          caller: (params.caller as string) ?? 'core-ops',
          task: params.task as string | undefined,
        });
      },
    },

    // ─── Prompt Templates (inline from core-ops.ts) ─────────────
    {
      name: 'render_prompt',
      description:
        'Render a prompt template with variable substitution. Templates are .prompt files loaded from the templates directory.',
      auth: 'read' as const,
      schema: z.object({
        template: z.string().describe('Template name (without .prompt extension)'),
        variables: z.record(z.string()).optional().default({}),
        strict: z.boolean().optional().default(true),
      }),
      handler: async (params) => {
        const rendered = runtime.templateManager.render(
          params.template as string,
          (params.variables ?? {}) as Record<string, string>,
          { strict: params.strict as boolean },
        );
        return { rendered };
      },
    },
    {
      name: 'list_templates',
      description: 'List all loaded prompt templates.',
      auth: 'read' as const,
      handler: async () => ({
        templates: runtime.templateManager.listTemplates(),
      }),
    },

    // ─── Satellite ops ───────────────────────────────────────────
    ...createAdminOps(runtime),
    ...createAdminExtraOps(runtime),
    ...createAdminSetupOps(runtime),
    ...createSessionBriefingOps(runtime),
  ];

  // Plugin ops must mutate the same live op array that MCP dispatch reads.
  const pluginOps = createPluginOps(runtime, ops);
  ops.push(...pluginOps);

  // Pack ops
  ops.push(...createPackOps(runtime));

  // Telemetry ops
  ops.push(...createTelemetryOps(runtime));

  return ops;
}
