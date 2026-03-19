/**
 * Semantic facade assembler — creates domain-specific facades
 * matching Salvador's engine-level architecture.
 *
 * Each facade becomes its own MCP tool with op dispatch.
 */

import type { FacadeConfig } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultFacadeOps } from './vault-facade.js';
import { createPlanFacadeOps } from './plan-facade.js';
import { createBrainFacadeOps } from './brain-facade.js';
import { createMemoryFacadeOps } from './memory-facade.js';
import { createAdminFacadeOps } from './admin-facade.js';
import { createCuratorFacadeOps } from './curator-facade.js';
import { createLoopFacadeOps } from './loop-facade.js';
import { createOrchestrateFacadeOps } from './orchestrate-facade.js';
import { createControlFacadeOps } from './control-facade.js';
import { createContextFacadeOps } from './context-facade.js';
import { createAgencyFacadeOps } from './agency-facade.js';
import { createChatFacadeOps } from './chat-facade.js';

export function createSemanticFacades(runtime: AgentRuntime, agentId: string): FacadeConfig[] {
  const facades: FacadeConfig[] = [
    {
      name: `${agentId}_vault`,
      description: 'Knowledge management — search, CRUD, import/export, intake, archival.',
      ops: createVaultFacadeOps(runtime),
    },
    {
      name: `${agentId}_plan`,
      description: 'Plan lifecycle — create, approve, execute, reconcile, complete, grading.',
      ops: createPlanFacadeOps(runtime),
    },
    {
      name: `${agentId}_brain`,
      description: 'Learning system — intelligence pipeline, strengths, feedback, sessions.',
      ops: createBrainFacadeOps(runtime),
    },
    {
      name: `${agentId}_memory`,
      description: 'Session & cross-project memory — capture, search, dedup, promote.',
      ops: createMemoryFacadeOps(runtime),
    },
    {
      name: `${agentId}_admin`,
      description: 'Infrastructure — health, config, telemetry, tokens, LLM, prompts.',
      ops: createAdminFacadeOps(runtime),
    },
    {
      name: `${agentId}_curator`,
      description: 'Quality — duplicate detection, contradictions, grooming, health audit.',
      ops: createCuratorFacadeOps(runtime),
    },
    {
      name: `${agentId}_loop`,
      description: 'Iterative validation loops — start, iterate, cancel, complete, history.',
      ops: createLoopFacadeOps(runtime),
    },
    {
      name: `${agentId}_orchestrate`,
      description:
        'Execution orchestration — project registration, playbooks, plan/execute/complete.',
      ops: createOrchestrateFacadeOps(runtime),
    },
    {
      name: `${agentId}_control`,
      description: 'Agent behavior — identity, intent routing, morphing, guidelines, governance.',
      ops: createControlFacadeOps(runtime),
    },
    {
      name: `${agentId}_context`,
      description: 'Context analysis — entity extraction, knowledge retrieval, confidence scoring.',
      ops: createContextFacadeOps(runtime),
    },
    {
      name: `${agentId}_agency`,
      description:
        'Proactive intelligence — file watching, pattern surfacing, warnings, clarification.',
      ops: createAgencyFacadeOps(runtime),
    },
    {
      name: `${agentId}_chat`,
      description:
        'Chat transport — session management, response chunking, authentication for chat-based interfaces.',
      ops: createChatFacadeOps(runtime),
    },
  ];

  return facades;
}
