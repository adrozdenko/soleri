import { z } from 'zod';

/** Communication tone for the agent persona */
const TONES = ['precise', 'mentor', 'pragmatic'] as const;

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
  /** Knowledge domains this agent covers */
  domains: z.array(z.string().min(1)).min(1).max(20),
  /** Core principles the agent follows (3-7 recommended) */
  principles: z.array(z.string()).min(1).max(10),
  /** Communication tone: precise, mentor, or pragmatic */
  tone: z.enum(TONES).optional().default('pragmatic'),
  /** Greeting message when agent introduces itself (auto-generated if omitted) */
  greeting: z.string().min(10).max(300).optional(),
  /** Output directory (parent — agent dir will be created inside, defaults to cwd) */
  outputDir: z.string().min(1).optional().default(process.cwd()),
  /** Hook packs to install after scaffolding (optional) */
  hookPacks: z.array(z.string()).optional(),
  /** Skills to include (if omitted, all skills are included for backward compat) */
  skills: z.array(z.string()).optional(),
  /** Primary model for the coder agent */
  model: z.string().optional().default('claude-code-sonnet-4'),
  /** AI client setup target: Claude Code, Codex, or both */
  setupTarget: z.enum(SETUP_TARGETS).optional().default('opencode'),
  /** Enable Telegram transport scaffolding. Default: false. */
  telegram: z.boolean().optional().default(false),
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
