/**
 * Soleri v7 — File-Tree Agent Schema
 *
 * Defines the agent.yaml format for file-tree agents.
 * This replaces the old AgentConfigSchema that generated TypeScript projects.
 *
 * An agent is a folder. This schema defines agent.yaml — the single source
 * of truth for identity and engine configuration.
 */

import { z } from 'zod';
import { ENGINE_FEATURES } from './templates/shared-rules.js';

// ─── Constants ────────────────────────────────────────────────────────

/** Communication tones */
export const TONES = ['precise', 'mentor', 'pragmatic'] as const;
export type Tone = (typeof TONES)[number];

/** Engine profiles — control which modules load at startup */
export const ENGINE_PROFILES = ['minimal', 'standard', 'full'] as const;
export type EngineProfile = (typeof ENGINE_PROFILES)[number];

/** Where to set up client integration */
export const SETUP_TARGETS = ['claude', 'codex', 'opencode', 'both', 'all'] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];

// ─── Sub-Schemas ──────────────────────────────────────────────────────

/** External vault connection */
const VaultConnectionSchema = z.object({
  /** Display name for this vault */
  name: z.string().min(1),
  /** Absolute path to vault SQLite database */
  path: z.string().min(1),
  /** Search priority (0–1). Higher = results ranked higher. Default: 0.5 */
  priority: z.number().min(0).max(1).optional().default(0.5),
});

/** Domain pack reference */
const DomainPackSchema = z.object({
  /** Domain name (e.g., "design", "code-review") */
  name: z.string().min(1),
  /** npm package name (e.g., "@soleri/domain-design") */
  package: z.string().min(1),
  /** Semver version constraint (optional) */
  version: z.string().optional(),
});

/** Compaction policy — thresholds for session rotation */
const CompactionPolicySchema = z.object({
  /** Max tool calls / runs before compaction. Default: 200 */
  maxRuns: z.number().int().positive().optional(),
  /** Max cumulative input tokens before compaction. Default: 2_000_000 */
  maxInputTokens: z.number().int().positive().optional(),
  /** Max wall-clock age as duration string (e.g. '72h', '30m', '7d'). Default: '72h' */
  maxAge: z
    .string()
    .regex(/^\d+(ms|s|m|h|d)$/, 'Must be a duration like "72h", "30m", "7d"')
    .optional(),
});

/** Engine configuration */
const EngineConfigSchema = z.object({
  /** Path to agent's vault SQLite database. Default: ~/.{id}/vault.db */
  vault: z.string().optional(),
  /** Enable brain/learning loop. Default: true */
  learning: z.boolean().optional().default(true),
  /** Session compaction policy — thresholds for automatic session rotation */
  compactionPolicy: CompactionPolicySchema.optional(),
  /**
   * Engine rule modules to include in CLAUDE.md.
   * Core rules are always included. Feature modules are additive.
   * Omit or leave empty to include ALL modules (backward compatible).
   * Example: ['vault', 'planning'] includes core + vault + planning rules.
   */
  features: z.array(z.enum(ENGINE_FEATURES as unknown as [string, ...string[]])).optional(),
  /** Engine profile — controls which runtime modules are loaded. Default: 'full' (all modules). */
  profile: z.enum(['minimal', 'standard', 'full']).optional(),
  /** Explicit module list — overrides profile. Use module suffixes (e.g., 'vault', 'brain', 'plan'). */
  modules: z.array(z.string()).optional(),
});

/** Client setup configuration */
const SetupConfigSchema = z.object({
  /** Target client for MCP registration */
  target: z.enum(SETUP_TARGETS).optional().default('claude'),
  /** Primary model for the client */
  model: z.string().optional().default('claude-code-sonnet-4'),
});

// ─── Workflow Sub-Schemas ─────────────────────────────────────────────

/** Gate phases in a workflow */
export const GATE_PHASES = ['brainstorming', 'pre-execution', 'post-task', 'completion'] as const;
export type GatePhase = (typeof GATE_PHASES)[number];

/** Workflow gate definition (maps to gates.yaml) */
export const WorkflowGateSchema = z.object({
  phase: z.enum(GATE_PHASES),
  requirement: z.string().min(1),
  check: z.string().min(1),
});

/** Task template ordering */
export const TASK_ORDERS = ['before-implementation', 'after-implementation', 'parallel'] as const;

/** Task template types */
export const TASK_TYPES = [
  'implementation',
  'test',
  'story',
  'documentation',
  'verification',
] as const;

/** Workflow task template (injected during plan generation) */
export const WorkflowTaskTemplateSchema = z.object({
  taskType: z.enum(TASK_TYPES),
  titleTemplate: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
  tools: z.array(z.string()).optional().default([]),
  order: z.enum(TASK_ORDERS),
});

/** Workflow intent types */
export const INTENTS = ['BUILD', 'FIX', 'REVIEW', 'PLAN', 'IMPROVE', 'DELIVER'] as const;
export type Intent = (typeof INTENTS)[number];

/** Workflow definition (maps to workflow folder contents) */
export const WorkflowDefinitionSchema = z.object({
  /** Unique workflow ID (derived from folder name if not specified) */
  id: z.string().optional(),
  /** generic or domain tier */
  tier: z.enum(['generic', 'domain']).optional().default('generic'),
  /** Human-readable title */
  title: z.string().min(1),
  /** When to activate this workflow */
  trigger: z.string().optional(),
  /** What this workflow does */
  description: z.string().optional(),
  /** Numbered step-by-step process (from prompt.md, parsed at runtime) */
  steps: z.string().optional(),
  /** Success criteria */
  expectedOutcome: z.string().optional(),
  /** ID of generic workflow this domain workflow extends */
  extends: z.string().optional(),
  /** Domain filtering: skip UI playbooks for backend tasks */
  domain: z.enum(['ui', 'backend', 'any']).optional().default('any'),
  /** Intents that trigger this workflow */
  matchIntents: z.array(z.enum(INTENTS)).optional().default([]),
  /** Keywords in plan text that trigger this workflow */
  matchKeywords: z.array(z.string()).optional().default([]),
  /** Lifecycle checkpoints */
  gates: z.array(WorkflowGateSchema).optional().default([]),
  /** Task templates injected during plan generation */
  taskTemplates: z.array(WorkflowTaskTemplateSchema).optional().default([]),
  /** Tools auto-added to plan's tool chain */
  toolInjections: z.array(z.string()).optional().default([]),
  /** Completion gate validation rules */
  verificationCriteria: z.array(z.string()).optional().default([]),
});

// ─── Workspace & Routing Schemas ─────────────────────────────────────

/** Workspace definition — scoped context area within an agent */
export const WorkspaceSchema = z.object({
  /** Unique workspace identifier (kebab-case) */
  id: z.string().min(1),
  /** Human-readable workspace name */
  name: z.string().min(1),
  /** What this workspace is for */
  description: z.string().min(1),
  /** Context file name within the workspace directory. Default: CONTEXT.md */
  contextFile: z.string().optional().default('CONTEXT.md'),
});

/** Routing entry — maps task patterns to workspaces */
export const RoutingEntrySchema = z.object({
  /** Task pattern that triggers this route (e.g., "write script", "review code") */
  pattern: z.string().min(1),
  /** Target workspace id */
  workspace: z.string().min(1),
  /** Extra context files to load for this route */
  context: z.array(z.string()).optional().default([]),
  /** Skills to activate for this route */
  skills: z.array(z.string()).optional().default([]),
});

// ─── Main Agent Schema ────────────────────────────────────────────────

/**
 * agent.yaml schema — the single source of truth for a file-tree agent.
 *
 * This is what `soleri create` generates and what the engine reads on startup.
 */
export const AgentYamlSchema = z.object({
  // ─── Identity (required) ────────────────────────
  /** Agent identifier — kebab-case, used for directories and tool prefixes */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case (e.g., "gaudi", "my-agent")'),
  /** Human-readable display name */
  name: z.string().min(1).max(50),
  /** One-line role description */
  role: z.string().min(1).max(100),
  /** Longer description of capabilities */
  description: z.string().min(10).max(500),
  /** Knowledge domains (discovered from usage if empty) */
  domains: z.array(z.string().min(1)).max(20).optional().default([]),
  /** Core principles (discovered from usage if empty) */
  principles: z.array(z.string().min(1)).max(10).optional().default([]),

  // ─── Personality (optional) ─────────────────────
  /** Communication tone */
  tone: z.enum(TONES).optional().default('pragmatic'),
  /** Composable persona — defines character, voice, cultural texture */
  persona: z.record(z.unknown()).optional(),
  /** Greeting message (auto-generated if omitted) */
  greeting: z.string().min(10).max(300).optional(),

  // ─── Engine ─────────────────────────────────────
  /** Knowledge engine configuration */
  engine: EngineConfigSchema.optional().default({}),

  // ─── Vault Connections ──────────────────────────
  /** Link to external vaults for shared knowledge */
  vaults: z.array(VaultConnectionSchema).optional(),

  // ─── Client Setup ──────────────────────────────
  /** LLM client integration settings */
  setup: SetupConfigSchema.optional().default({}),

  // ─── Skills ─────────────────────────────────────
  /**
   * Controls which skills are scaffolded.
   * - 'essential' (default): ~7 core skills for a lightweight start
   * - 'all': scaffold all available skills (backward compat)
   * - string[]: scaffold only the named skills
   */
  skillsFilter: z
    .union([z.literal('all'), z.literal('essential'), z.array(z.string())])
    .optional()
    .default('essential'),

  // ─── Workspaces & Routing ───────────────────────
  /** Scoped context areas within the agent */
  workspaces: z.array(WorkspaceSchema).optional(),
  /** Task pattern → workspace routing table */
  routing: z.array(RoutingEntrySchema).optional(),

  // ─── Domain Packs ──────────────────────────────
  /** npm domain packs with custom ops and knowledge */
  packs: z.array(DomainPackSchema).optional(),

  // ─── Git Initialization ────────────────────────
  /** Git initialization configuration. If omitted, git is not initialized. */
  git: z
    .object({
      /** Whether to run git init in the scaffolded agent directory */
      init: z.boolean(),
      /** Optional remote repository configuration */
      remote: z
        .object({
          /** How to set up the remote: 'gh' creates via GitHub CLI, 'manual' uses a provided URL */
          type: z.enum(['gh', 'manual']),
          /** Remote URL (required for 'manual', auto-generated for 'gh') */
          url: z.string().optional(),
          /** Repository visibility for 'gh' type. Default: 'private' */
          visibility: z.enum(['public', 'private']).optional().default('private'),
        })
        .optional(),
    })
    .optional(),
});

export type AgentYaml = z.infer<typeof AgentYamlSchema>;
export type AgentYamlInput = z.input<typeof AgentYamlSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type RoutingEntry = z.infer<typeof RoutingEntrySchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowGate = z.infer<typeof WorkflowGateSchema>;
export type WorkflowTaskTemplate = z.infer<typeof WorkflowTaskTemplateSchema>;
