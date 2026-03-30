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
  AgentConfigInput,
  SetupTarget,
  ScaffoldResult,
  ScaffoldPreview,
  AgentInfo,
  InstallKnowledgeResult,
  AddDomainResult,
} from './types.js';
export { AgentConfigSchema, SETUP_TARGETS, MODEL_PRESETS } from './types.js';

// ─── v7 File-Tree Agent ──────────────────────────────────────────────
export {
  scaffoldFileTree,
  SKILLS_REGISTRY,
  ESSENTIAL_SKILLS,
  resolveSkillsFilter,
} from './scaffold-filetree.js';
export type { FileTreeScaffoldResult } from './scaffold-filetree.js';
export { AgentYamlSchema, TONES } from './agent-schema.js';
export type { AgentYaml, AgentYamlInput } from './agent-schema.js';
export { composeClaudeMd } from './compose-claude-md.js';
export type { ComposedClaudeMd, ToolEntry } from './compose-claude-md.js';
export { generateExtensionsIndex, generateExampleOp } from './templates/extensions.js';
export { generateClaudeMdTemplate } from './templates/claude-md-template.js';
export {
  getEngineRulesContent,
  getEngineMarker,
  getModularEngineRules,
  ENGINE_FEATURES,
} from './templates/shared-rules.js';
export type { EngineFeature } from './templates/shared-rules.js';
export { generateInjectClaudeMd } from './templates/inject-claude-md.js';
export { generateSkills } from './templates/skills.js';
export { generateTelegramBot } from './templates/telegram-bot.js';
export { generateTelegramAgent } from './templates/telegram-agent.js';
export { generateTelegramConfig } from './templates/telegram-config.js';
export { generateTelegramSupervisor } from './templates/telegram-supervisor.js';
export { generateEntryPoint } from './templates/entry-point.js';
