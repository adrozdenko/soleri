/**
 * Pack Lockfile — persists installed pack metadata to `soleri.lock`.
 *
 * Tracks installed pack versions, types, sources, and integrity hashes
 * for reproducible agent setups. The lockfile enables:
 * - `soleri pack install --frozen` (CI mode — fail if lockfile is stale)
 * - `soleri pack outdated` (compare installed vs. latest available)
 * - Persistence across restarts (unlike the in-memory PackInstaller registry)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────

export interface LockEntry {
  /** Pack ID (from manifest) */
  id: string;
  /** Installed version (semver) */
  version: string;
  /** Pack type: hooks, skills, knowledge, domain, bundle */
  type: PackType;
  /** Where it was installed from */
  source: PackSource;
  /** Path to installed pack directory */
  directory: string;
  /** SHA-256 of the manifest file at install time */
  integrity: string;
  /** ISO timestamp of install */
  installedAt: string;
  /** Number of vault entries seeded */
  vaultEntries: number;
  /** Skill names discovered */
  skills: string[];
  /** Hook names discovered */
  hooks: string[];
  /** Whether facades were registered */
  facadesRegistered: boolean;
  /** Compatible @soleri/core version range (from manifest "soleri" field) */
  soleriRange?: string;
  /** Pack tier: default (ships with engine), community (free), premium (unlocked today) */
  tier?: PackTier;
}

export type PackType = 'hooks' | 'skills' | 'knowledge' | 'domain' | 'bundle';
export type PackSource = 'built-in' | 'local' | 'npm';
export type PackTier = 'default' | 'community' | 'premium';

export interface LockfileData {
  /** Lockfile format version */
  version: 1;
  /** Map of packId → lock entry */
  packs: Record<string, LockEntry>;
}

// ─── Lockfile Manager ─────────────────────────────────────────────────

export class PackLockfile {
  private data: LockfileData;
  private dirty = false;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  /**
   * Get a lock entry by pack ID.
   */
  get(packId: string): LockEntry | undefined {
    return this.data.packs[packId];
  }

  /**
   * Set (add or update) a lock entry.
   */
  set(entry: LockEntry): void {
    this.data.packs[entry.id] = entry;
    this.dirty = true;
  }

  /**
   * Remove a lock entry.
   */
  remove(packId: string): boolean {
    if (!(packId in this.data.packs)) return false;
    delete this.data.packs[packId];
    this.dirty = true;
    return true;
  }

  /**
   * List all lock entries.
   */
  list(): LockEntry[] {
    return Object.values(this.data.packs);
  }

  /**
   * Check if a pack is locked.
   */
  has(packId: string): boolean {
    return packId in this.data.packs;
  }

  /**
   * Get number of locked packs.
   */
  get size(): number {
    return Object.keys(this.data.packs).length;
  }

  /**
   * Save lockfile to disk (only if dirty).
   */
  save(): boolean {
    if (!this.dirty) return false;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2) + '\n', 'utf-8');
    this.dirty = false;
    return true;
  }

  /**
   * Force reload from disk.
   */
  reload(): void {
    this.data = this.load();
    this.dirty = false;
  }

  /**
   * Compute integrity hash for a manifest file.
   */
  static computeIntegrity(manifestPath: string): string {
    if (!existsSync(manifestPath)) return '';
    const content = readFileSync(manifestPath, 'utf-8');
    return 'sha256-' + createHash('sha256').update(content).digest('hex');
  }

  private load(): LockfileData {
    if (!existsSync(this.filePath)) {
      return { version: 1, packs: {} };
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      if (raw.version === 1 && typeof raw.packs === 'object') {
        return raw as LockfileData;
      }
      return { version: 1, packs: {} };
    } catch {
      return { version: 1, packs: {} };
    }
  }
}

/**
 * Infer pack type from manifest content.
 */
export function inferPackType(manifest: {
  vault?: unknown;
  skills?: unknown;
  hooks?: unknown;
  facades?: unknown[];
  domains?: string[];
}): PackType {
  const hasVault = !!manifest.vault;
  const hasSkills = !!manifest.skills;
  const hasHooks = !!manifest.hooks;
  const hasFacades = (manifest.facades?.length ?? 0) > 0;

  // Bundle if multiple content types
  const types = [hasVault, hasSkills, hasHooks, hasFacades].filter(Boolean).length;
  if (types > 1) return 'bundle';

  if (hasHooks) return 'hooks';
  if (hasSkills) return 'skills';
  if (hasFacades) return 'domain';
  return 'knowledge';
}
