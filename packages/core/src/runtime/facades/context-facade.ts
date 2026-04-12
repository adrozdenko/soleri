/**
 * Context facade — entity extraction, knowledge retrieval, and context analysis.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

export function createContextFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { contextEngine } = runtime;

  return [
    {
      name: 'context_extract_entities',
      description:
        'Extract named entities from a prompt — files, functions, domains, actions, technologies, patterns.',
      auth: 'read',
      schema: z
        .object({
          prompt: z.string().optional().describe('The user prompt to analyze.'),
          text: z.string().optional().describe('Alias for prompt — use either field.'),
        })
        .refine((v) => v.prompt !== undefined || v.text !== undefined, {
          message: 'Provide either "prompt" or "text"',
        }),
      handler: async (params) => {
        const input =
          (params.prompt as string | undefined) ?? (params.text as string | undefined) ?? '';
        return contextEngine.extractEntities(input);
      },
    },
    {
      name: 'context_retrieve_knowledge',
      description:
        'Retrieve relevant knowledge from vault (FTS) and brain (recommendations). Returns scored and ranked items.',
      auth: 'read',
      schema: z.object({
        prompt: z.string().describe('Query to search for.'),
        domain: z.string().optional().describe('Filter by domain.'),
      }),
      handler: async (params) => {
        return contextEngine.retrieveKnowledge(
          params.prompt as string,
          params.domain as string | undefined,
        );
      },
    },
    {
      name: 'context_analyze',
      description:
        'Full context analysis — extract entities, retrieve knowledge, compute confidence, detect domains. Combines all signals into a single response.',
      auth: 'read',
      schema: z.object({
        prompt: z.string().describe('The user prompt to analyze.'),
        domain: z.string().optional().describe('Optional domain hint.'),
      }),
      handler: async (params) => {
        return contextEngine.analyze(params.prompt as string, params.domain as string | undefined);
      },
    },
  ];
}
