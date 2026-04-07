export { syncAllToMarkdown, syncEntryToMarkdown, entryToMarkdown } from './vault-markdown-sync.js';
export { Vault } from './vault.js';
export type { SearchResult, VaultStats, ProjectInfo, Memory, MemoryStats } from './vault.js';
export { VaultManager, type ConnectedVault } from './vault-manager.js';
export { TIER_WEIGHTS } from './vault-types.js';
export { VaultBranching } from './vault-branching.js';
export { GitVaultSync } from './git-vault-sync.js';
export type { GitVaultSyncConfig } from './git-vault-sync.js';
export {
  ObsidianSync,
  toObsidianMarkdown,
  fromObsidianMarkdown,
  titleToSlug,
} from './obsidian-sync.js';
export type {
  ObsidianSyncConfig,
  ExportOptions as ObsidianExportOptions,
  ImportOptions as ObsidianImportOptions,
  SyncMode as ObsidianSyncMode,
  SyncOptions as ObsidianSyncOptions,
  ExportResult as ObsidianExportResult,
  ImportResult as ObsidianImportResult,
  SyncResult as ObsidianSyncResult,
  ConflictInfo,
} from './obsidian-sync.js';
export type { BranchAction, BranchEntry, BranchSummary, MergeResult } from './vault-branching.js';
export type {
  VaultTier,
  VaultTierConfig,
  VaultManagerConfig,
  VaultTierInfo,
} from './vault-types.js';
export { validatePlaybook, parsePlaybookFromEntry } from './playbook.js';
export type { Playbook, PlaybookStep, PlaybookValidationResult } from './playbook.js';
export { DEFAULT_CANONICAL_TAGS } from './default-canonical-tags.js';
export {
  baseNormalizeTag,
  normalizeTag as normalizeTagCanonical,
  normalizeTags as normalizeTagsCanonical,
  isMetadataTag,
  computeEditDistance,
} from './tag-normalizer.js';
export { detectScope } from './scope-detector.js';
export type {
  ScopeTier,
  ConfidenceLevel,
  ScopeSignal,
  ScopeDetectionResult,
  ScopeInput,
} from './scope-detector.js';
export { KnowledgeReview } from './knowledge-review.js';
export type {
  ReviewStatus,
  ReviewEntry,
  ReviewSubmission,
  ReviewDecision,
} from './knowledge-review.js';
export { computeContentHash } from './content-hash.js';
export type { HashableEntry } from './content-hash.js';
