/**
 * Soleri v7 — Direct Engine Registration
 *
 * Registers all engine modules as MCP tools without the facade factory.
 * Each module gets a single MCP tool with op-based dispatch.
 *
 * This replaces:
 *   - facade-factory.ts (generic dispatch layer)
 *   - registerAllFacades() + registerFacade() + dispatchOp()
 *   - FacadeConfig type (no longer needed)
 *
 * What stays:
 *   - createVaultFacadeOps(), createBrainFacadeOps(), etc. (op definitions)
 *   - createAgentRuntime() (module initialization)
 *   - OpDefinition type (handler + schema + auth)
 *   - Auth checking (same logic, inlined)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition, AuthPolicy } from '../facades/types.js';
import { AUTH_LEVEL_RANK } from '../facades/types.js';

// Re-export op creators (these are the source of truth for op definitions)
import { createVaultFacadeOps } from '../runtime/facades/vault-facade.js';
import { createPlanFacadeOps } from '../runtime/facades/plan-facade.js';
import { createBrainFacadeOps } from '../runtime/facades/brain-facade.js';
import { createMemoryFacadeOps } from '../runtime/facades/memory-facade.js';
import { createAdminFacadeOps } from '../runtime/facades/admin-facade.js';
import { createCuratorFacadeOps } from '../runtime/facades/curator-facade.js';
import { createLoopFacadeOps } from '../runtime/facades/loop-facade.js';
import { createOrchestrateFacadeOps } from '../runtime/facades/orchestrate-facade.js';
import { createControlFacadeOps } from '../runtime/facades/control-facade.js';
import { createCogneeFacadeOps } from '../runtime/facades/cognee-facade.js';
import { createContextFacadeOps } from '../runtime/facades/context-facade.js';
import { createAgencyFacadeOps } from '../runtime/facades/agency-facade.js';
import { createChatFacadeOps } from '../runtime/facades/chat-facade.js';
import { createDomainFacade } from '../runtime/domain-ops.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface EngineRegistrationOptions {
  /** Agent ID — used as tool name prefix (e.g., "gaudi" → "gaudi_vault") */
  agentId: string;
  /** Auth policy factory (optional — defaults to permissive) */
  authPolicy?: () => AuthPolicy;
  /** Additional ops to add to the core facade (agent-specific ops like health, activate) */
  coreOps?: OpDefinition[];
  /** Knowledge domains for domain-specific facades */
  domains?: string[];
  /** Domain packs (from @soleri/domain-*) */
  domainPacks?: Array<{ name: string; facades?: Array<{ name: string; ops: OpDefinition[] }> }>;
  /** Op names to ALSO register as standalone MCP tools (hot ops) */
  hotOps?: string[];
}

export interface EngineRegistrationResult {
  /** All registered MCP tool names */
  tools: string[];
  /** Total op count across all tools */
  totalOps: number;
}

// ─── Module Definition ────────────────────────────────────────────────

interface ModuleDef {
  /** Suffix for tool name: {agentId}_{suffix} */
  suffix: string;
  /** Tool description */
  description: string;
  /** Op creator function */
  createOps: (runtime: AgentRuntime) => OpDefinition[];
  /** Only register if this condition is true (default: always) */
  condition?: (runtime: AgentRuntime) => boolean;
}

const ENGINE_MODULES: ModuleDef[] = [
  {
    suffix: 'vault',
    description: 'Knowledge management — search, CRUD, import/export, intake, archival.',
    createOps: createVaultFacadeOps,
  },
  {
    suffix: 'plan',
    description: 'Plan lifecycle — create, approve, execute, reconcile, complete, grading.',
    createOps: createPlanFacadeOps,
  },
  {
    suffix: 'brain',
    description: 'Learning system — intelligence pipeline, strengths, feedback, sessions.',
    createOps: createBrainFacadeOps,
  },
  {
    suffix: 'memory',
    description: 'Session & cross-project memory — capture, search, dedup, promote.',
    createOps: createMemoryFacadeOps,
  },
  {
    suffix: 'admin',
    description: 'Infrastructure — health, config, telemetry, tokens, LLM, prompts.',
    createOps: createAdminFacadeOps,
  },
  {
    suffix: 'curator',
    description: 'Quality — duplicate detection, contradictions, grooming, health audit.',
    createOps: createCuratorFacadeOps,
  },
  {
    suffix: 'loop',
    description: 'Iterative validation loops — start, iterate, cancel, complete, history.',
    createOps: createLoopFacadeOps,
  },
  {
    suffix: 'orchestrate',
    description:
      'Execution orchestration — project registration, playbooks, plan/execute/complete.',
    createOps: createOrchestrateFacadeOps,
  },
  {
    suffix: 'control',
    description: 'Agent behavior — identity, intent routing, morphing, guidelines, governance.',
    createOps: createControlFacadeOps,
  },
  {
    suffix: 'context',
    description: 'Context analysis — entity extraction, knowledge retrieval, confidence scoring.',
    createOps: createContextFacadeOps,
  },
  {
    suffix: 'agency',
    description: 'Proactive intelligence — file watching, pattern surfacing, warnings.',
    createOps: createAgencyFacadeOps,
  },
  {
    suffix: 'chat',
    description: 'Chat transport — session management, response chunking, authentication.',
    createOps: createChatFacadeOps,
  },
  {
    suffix: 'cognee',
    description: 'Knowledge graph — Cognee search, sync, export, graph stats.',
    createOps: createCogneeFacadeOps,
    condition: (rt) => rt.cognee !== null && rt.cognee !== undefined,
  },
];

// ─── Core Registration ────────────────────────────────────────────────

/**
 * Register all engine modules as MCP tools on the given server.
 *
 * Each module becomes one MCP tool: `{agentId}_{module}` with `op` + `params` arguments.
 * Dispatch is a direct switch on op name — no generic factory, no FacadeConfig type.
 */
export function registerEngine(
  server: McpServer,
  runtime: AgentRuntime,
  options: EngineRegistrationOptions,
): EngineRegistrationResult {
  const { agentId, authPolicy, coreOps, domains, domainPacks, hotOps } = options;
  const hotSet = new Set(hotOps ?? []);
  const registeredTools: string[] = [];
  let totalOps = 0;

  // 1. Register semantic module tools
  for (const mod of ENGINE_MODULES) {
    if (mod.condition && !mod.condition(runtime)) continue;

    const ops = mod.createOps(runtime);
    const toolName = `${agentId}_${mod.suffix}`;

    registerModuleTool(server, toolName, mod.description, ops, authPolicy);
    registeredTools.push(toolName);
    totalOps += ops.length;

    // Hot ops: also register as standalone tools
    for (const op of ops) {
      if (op.hot || hotSet.has(op.name)) {
        registerStandaloneTool(server, agentId, toolName, op, authPolicy);
        registeredTools.push(`${agentId}_${op.name}`);
      }
    }
  }

  // 2. Register core facade (agent-specific ops: health, identity, activate, etc.)
  if (coreOps && coreOps.length > 0) {
    const coreName = `${agentId}_core`;
    registerModuleTool(
      server,
      coreName,
      'Agent-specific operations — health, identity, activation.',
      coreOps,
      authPolicy,
    );
    registeredTools.push(coreName);
    totalOps += coreOps.length;
  }

  // 3. Register domain facades
  if (domains) {
    for (const domain of domains) {
      const domainConfig = createDomainFacade(runtime, agentId, domain);
      registerModuleTool(
        server,
        domainConfig.name,
        domainConfig.description,
        domainConfig.ops,
        authPolicy,
      );
      registeredTools.push(domainConfig.name);
      totalOps += domainConfig.ops.length;
    }
  }

  // 4. Register domain pack facades
  if (domainPacks) {
    for (const pack of domainPacks) {
      if (pack.facades) {
        for (const facade of pack.facades) {
          const packToolName = `${agentId}_${facade.name}`;
          registerModuleTool(
            server,
            packToolName,
            `Domain pack: ${pack.name}`,
            facade.ops,
            authPolicy,
          );
          registeredTools.push(packToolName);
          totalOps += facade.ops.length;
        }
      }
    }
  }

  return { tools: registeredTools, totalOps };
}

// ─── Tool Registration (No Factory) ──────────────────────────────────

/**
 * Register a single grouped tool with op dispatch.
 * This is the replacement for registerFacade() — same behavior, no FacadeConfig type.
 */
function registerModuleTool(
  server: McpServer,
  toolName: string,
  description: string,
  ops: OpDefinition[],
  authPolicy?: () => AuthPolicy,
): void {
  const opNames = ops.map((o) => o.name);
  const opMap = new Map(ops.map((o) => [o.name, o]));

  server.tool(
    toolName,
    description,
    {
      op: z.string().describe(`Operation: ${opNames.join(' | ')}`),
      params: z.record(z.unknown()).optional().default({}).describe('Operation parameters'),
    },
    async ({ op: opName, params }) => {
      const op = opMap.get(opName);
      if (!op) {
        return jsonResponse({
          success: false,
          error: `Unknown operation "${opName}" on ${toolName}. Available: ${opNames.join(', ')}`,
          op: opName,
          facade: toolName,
        });
      }

      // Auth check
      const policy = authPolicy?.();
      const authErr = checkAuth(opName, op.auth, toolName, policy);
      if (authErr) return jsonResponse(authErr);

      // Validate + execute
      try {
        let validatedParams = params;
        if (op.schema) {
          const result = op.schema.safeParse(params);
          if (!result.success) {
            return jsonResponse({
              success: false,
              error: `Invalid params for ${opName}: ${result.error.message}`,
              op: opName,
              facade: toolName,
            });
          }
          validatedParams = result.data as Record<string, unknown>;
        }

        const data = await op.handler(validatedParams);
        return jsonResponse({ success: true, data, op: opName, facade: toolName });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: message, op: opName, facade: toolName });
      }
    },
  );
}

/**
 * Register a single op as a standalone MCP tool (hot op).
 */
function registerStandaloneTool(
  server: McpServer,
  agentId: string,
  parentTool: string,
  op: OpDefinition,
  authPolicy?: () => AuthPolicy,
): void {
  const toolName = `${agentId}_${op.name}`;
  const schema = op.schema
    ? (op.schema as z.ZodObject<z.ZodRawShape>).shape
      ? (op.schema as z.ZodObject<z.ZodRawShape>)
      : z.object({ params: op.schema })
    : z.object({});

  server.tool(
    toolName,
    op.description,
    schema instanceof z.ZodObject ? schema.shape : {},
    async (params) => {
      const policy = authPolicy?.();
      const authErr = checkAuth(op.name, op.auth, parentTool, policy);
      if (authErr) return jsonResponse(authErr);

      try {
        let validatedParams = params as Record<string, unknown>;
        if (op.schema) {
          const result = op.schema.safeParse(params);
          if (!result.success) {
            return jsonResponse({
              success: false,
              error: `Invalid params: ${result.error.message}`,
              op: op.name,
              facade: parentTool,
            });
          }
          validatedParams = result.data as Record<string, unknown>;
        }

        const data = await op.handler(validatedParams);
        return jsonResponse({ success: true, data, op: op.name, facade: parentTool });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: message, op: op.name, facade: parentTool });
      }
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function checkAuth(
  opName: string,
  opAuth: string,
  toolName: string,
  policy: AuthPolicy | undefined,
): { success: false; error: string; op: string; facade: string } | null {
  if (!policy || policy.mode === 'permissive') return null;

  const requiredLevel = policy.overrides?.[opName] ?? (opAuth as keyof typeof AUTH_LEVEL_RANK);
  const callerRank = AUTH_LEVEL_RANK[policy.callerLevel] ?? 0;
  const requiredRank = AUTH_LEVEL_RANK[requiredLevel as keyof typeof AUTH_LEVEL_RANK] ?? 0;

  if (callerRank >= requiredRank) return null;

  const message = `Auth denied: "${opName}" requires ${requiredLevel}, caller has ${policy.callerLevel}`;

  if (policy.mode === 'warn') {
    console.error(`[auth-warn] ${message}`);
    return null;
  }

  return { success: false, error: message, op: opName, facade: toolName };
}

function jsonResponse(data: Record<string, unknown>): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
