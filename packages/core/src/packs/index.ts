/**
 * Knowledge Packs — Barrel Exports
 */

export {
  packManifestSchema,
  PACK_TIERS,
  type PackManifest,
  type PackTier as ManifestPackTier,
  type PackStatus,
  type InstalledPack,
  type InstallResult,
  type ValidateResult,
} from './types.js';

export { PackInstaller } from './pack-installer.js';

export { PackLockfile, inferPackType } from './lockfile.js';
export type { LockEntry, PackType, PackSource, PackTier, LockfileData } from './lockfile.js';

export { resolvePack, checkNpmVersion, checkVersionCompat } from './resolver.js';
export type { ResolvedPack, ResolveOptions } from './resolver.js';
