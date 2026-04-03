/**
 * Knowledge Packs — Barrel Exports
 */

export {
  packManifestSchema,
  PACK_TIERS,
  VALID_TRANSITIONS,
  type PackManifest,
  type PackTier as ManifestPackTier,
  type PackStatus,
  type PackState,
  type PackTransition,
  type InstalledPack,
  type InstallResult,
  type ValidateResult,
  type TrustLevel,
  type SourceType,
  type SkillInventoryItem,
  type SkillMetadata,
} from './types.js';

export { PackInstaller } from './pack-installer.js';
export { PackLifecycleManager } from './pack-lifecycle.js';

export { PackLockfile, inferPackType, LOCKFILE_VERSION } from './lockfile.js';
export type { LockEntry, PackType, PackSource, PackTier, LockfileData } from './lockfile.js';

export {
  resolvePack,
  checkNpmVersion,
  checkVersionCompat,
  getBuiltinKnowledgePacksDirs,
} from './resolver.js';
export type { ResolvedPack, ResolveOptions } from './resolver.js';
