/**
 * @soleri/forge — Public API
 *
 * Import this for programmatic access to forge functions.
 * The main index.ts starts the MCP server — use this for library usage.
 */
export { scaffold, previewScaffold, listAgents } from './scaffolder.js';
export { installKnowledge, generateVaultOnlyDomainFacade } from './knowledge-installer.js';
export { addDomain } from './domain-manager.js';
export { patchIndexTs, patchClaudeMdContent } from './patching.js';
export type {
  AgentConfig,
  ScaffoldResult,
  ScaffoldPreview,
  AgentInfo,
  InstallKnowledgeResult,
  AddDomainResult,
} from './types.js';
export { AgentConfigSchema } from './types.js';
