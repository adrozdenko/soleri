import { z } from 'zod';

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
  /** Greeting message when agent introduces itself */
  greeting: z.string().min(10).max(300),
  /** Output directory (parent — agent dir will be created inside) */
  outputDir: z.string().min(1),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

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
