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
import { createOperatorFacadeOps } from './operator-facade.js';
import { createArchiveFacadeOps } from './archive-facade.js';
import { createSyncFacadeOps } from './sync-facade.js';
import { createReviewFacadeOps } from './review-facade.js';
import { createIntakeFacadeOps } from './intake-facade.js';
import { createLinksFacadeOps } from './links-facade.js';
import { createBranchingFacadeOps } from './branching-facade.js';
import { createTierFacadeOps } from './tier-facade.js';

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
    {
      name: `${agentId}_operator`,
      description: 'Operator profile — personality learning, signals, adaptation.',
      ops: createOperatorFacadeOps(runtime),
    },
    {
      name: `${agentId}_archive`,
      description: 'Archival, lifecycle, and knowledge maintenance.',
      ops: createArchiveFacadeOps(runtime),
    },
    {
      name: `${agentId}_sync`,
      description: 'Git, Obsidian, and pack sync operations.',
      ops: createSyncFacadeOps(runtime),
    },
    {
      name: `${agentId}_review`,
      description: 'Knowledge review workflow.',
      ops: createReviewFacadeOps(runtime),
    },
    {
      name: `${agentId}_intake`,
      description: 'Content ingestion — books, URLs, text, batch import.',
      ops: createIntakeFacadeOps(runtime),
    },
    {
      name: `${agentId}_links`,
      description: 'Entry linking — create, traverse, suggest, orphan detection.',
      ops: createLinksFacadeOps(runtime),
    },
    {
      name: `${agentId}_branching`,
      description: 'Vault branching — create, list, merge, delete branches.',
      ops: createBranchingFacadeOps(runtime),
    },
    {
      name: `${agentId}_tier`,
      description: 'Multi-vault tiers — connect, disconnect, search across sources.',
      ops: createTierFacadeOps(runtime),
    },
  ];

  return facades;
}
