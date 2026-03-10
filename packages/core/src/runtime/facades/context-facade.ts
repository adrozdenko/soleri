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
      schema: z.object({
        prompt: z.string().describe('The user prompt to analyze.'),
      }),
      handler: async (params) => {
        return contextEngine.extractEntities(params.prompt as string);
      },
    },
    {
      name: 'context_retrieve_knowledge',
      description:
        'Retrieve relevant knowledge from vault (FTS), Cognee (vector), and brain (recommendations). Returns scored and ranked items.',
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
