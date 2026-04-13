import { z } from 'zod';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Communication tone for the agent persona */
const TONES = ['precise', 'mentor', 'pragmatic'] as const;

/** Default parent directory for new agents: ~/.soleri/ */
const SOLERI_HOME_DEFAULT = process.env.SOLERI_HOME ?? join(homedir(), '.soleri');

/** Where to scaffold host/client integration setup. */
export const SETUP_TARGETS = ['claude', 'codex', 'opencode', 'both', 'all'] as const;
export type SetupTarget = (typeof SETUP_TARGETS)[number];

/** Available model presets for agent configuration */
export const MODEL_PRESETS = [
  'claude-code-sonnet-4',
  'claude-code-opus-4',
  'claude-code-3.7-sonnet',
  'claude-code-3.5-haiku',
  'claude-4-sonnet',
  'claude-4-opus',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gemini-2.5',
  'gemini-2.5-flash',
] as const;

/** Agent configuration — everything needed to scaffold */
export const AgentConfigSchema = z.object({
  /** Agent identifier (kebab-case, used for directory and package name) */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case (e.g., "gaudi", "my-agent")'),
  /** Human-readable display name */
  name: z.string().min(1).max(50),
  /** One-line role description */
  role: z.string().min(1).max(100),
  /** Longer description of what this agent does */
  description: z.string().min(10).max(500),
  /** Knowledge domains this agent covers (discovered from usage if empty) */
  domains: z.array(z.string().min(1)).max(20).optional().default([]),
  /** Core principles the agent follows (discovered from usage if empty) */
  principles: z.array(z.string()).max(10).optional().default([]),
  /** Communication tone: precise, mentor, or pragmatic */
  tone: z.enum(TONES).optional().default('pragmatic'),
  /** Greeting message when agent introduces itself (auto-generated if omitted) */
  greeting: z.string().min(10).max(300).optional(),
  /** Output directory (parent — agent dir will be created inside, defaults to ~/.soleri/) */
  outputDir: z.string().min(1).optional().default(SOLERI_HOME_DEFAULT),
  /** Hook packs to install after scaffolding (optional) */
  hookPacks: z.array(z.string()).optional(),
  /** Skills to include (if omitted, all skills are included for backward compat) */
  skills: z.array(z.string()).optional(),
  /** Primary model for the coder agent */
  model: z.string().optional().default('claude-code-sonnet-4'),
  /** AI client setup target: Claude Code, Codex, or both */
  setupTarget: z.enum(SETUP_TARGETS).optional().default('claude'),
  /** Enable Telegram transport scaffolding. Default: false. */
  telegram: z.boolean().optional().default(false),
  /** Domain packs — npm packages with custom ops, knowledge, rules, and skills. */
  domainPacks: z
    .array(
      z.object({
        name: z.string(),
        package: z.string(),
        version: z.string().optional(),
      }),
    )
    .optional(),
  /** Vault connections — link to existing vaults instead of importing knowledge. */
  vaults: z
    .array(
      z.object({
        /** Display name for this vault connection */
        name: z.string(),
        /** Absolute path to the vault SQLite database */
        path: z.string(),
        /** Search priority (0-1). Higher = results ranked higher. Default: 0.5 */
        priority: z.number().min(0).max(1).optional().default(0.5),
      }),
    )
    .optional(),
  /** @deprecated Use vaults[] instead. Shorthand for a single shared vault at priority 0.6. */
  sharedVaultPath: z.string().optional(),
  /** Composable persona configuration. If omitted, Italian Craftsperson default is used. */
  persona: z.record(z.string(), z.unknown()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Input type — fields with defaults are optional (use before Zod parsing) */
export type AgentConfigInput = z.input<typeof AgentConfigSchema>;

/** Result of scaffolding */
export interface ScaffoldResult {
  success: boolean;
  agentDir: string;
  filesCreated: string[];
  domains: string[];
  summary: string;
}

/** Agent info for listing */
export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  path: string;
  domains: string[];
  hasNodeModules: boolean;
  hasDistDir: boolean;
}

/** Preview of what will be created */
export interface ScaffoldPreview {
  agentDir: string;
  files: Array<{ path: string; description: string }>;
  facades: Array<{ name: string; ops: string[] }>;
  domains: string[];
  persona: { name: string; role: string };
}

/** Result of adding a domain to an existing agent */
export interface AddDomainResult {
  success: boolean;
  agentPath: string;
  domain: string;
  agentId: string;
  facadeGenerated: boolean;
  buildOutput: string;
  warnings: string[];
  summary: string;
}

/** Result of installing knowledge packs into an existing agent */
export interface InstallKnowledgeResult {
  success: boolean;
  agentPath: string;
  agentId: string;
  bundlesInstalled: number;
  entriesTotal: number;
  domainsAdded: string[];
  domainsUpdated: string[];
  facadesGenerated: string[];
  sourceFilesPatched: string[];
  buildOutput: string;
  warnings: string[];
  summary: string;
}
