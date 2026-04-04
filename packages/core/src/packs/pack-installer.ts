/**
 * Pack Installer — validates, loads vault entries, registers facades.
 *
 * Install flow:
 * 1. Read and validate soleri-pack.json manifest
 * 2. Load vault intelligence bundles from vault/ subdirectory
 * 3. Register facades via plugin system
 * 4. Discover skills and hooks
 * 5. Return install summary
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import {
  packManifestSchema,
  type InstalledPack,
  type InstallResult,
  type ValidateResult,
} from './types.js';
import { loadIntelligenceData } from '../intelligence/loader.js';
import type { Vault } from '../vault/vault.js';
import type { PluginRegistry } from '../plugins/plugin-registry.js';
import type { PluginContext } from '../plugins/types.js';
import type { PackRuntime } from '../domain-packs/pack-runtime.js';
import { PackLifecycleManager } from './pack-lifecycle.js';

const MANIFEST_FILENAME = 'soleri-pack.json';

// =============================================================================
// PACK REGISTRY (in-memory)
// =============================================================================

export class PackInstaller {
  private packs = new Map<string, InstalledPack>();
  readonly lifecycle = new PackLifecycleManager();

  constructor(
    private vault: Vault,
    private pluginRegistry: PluginRegistry,
  ) {}

  /**
   * Validate a pack directory without installing.
   */
  validate(packDir: string): ValidateResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check manifest
    const manifestPath = join(packDir, MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) {
      return { valid: false, errors: [`No ${MANIFEST_FILENAME} found in ${packDir}`], warnings };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch (e) {
      return {
        valid: false,
        errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        warnings,
      };
    }

    const parseResult = packManifestSchema.safeParse(raw);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return { valid: false, errors: issues, warnings };
    }

    const manifest = parseResult.data;

    // 2. Count vault entries
    let vaultEntries = 0;
    const vaultDir = join(packDir, manifest.vault?.dir ?? 'vault');
    if (existsSync(vaultDir)) {
      const entries = loadIntelligenceData(vaultDir);
      vaultEntries = entries.length;
    } else if (manifest.vault) {
      warnings.push(`Vault directory "${manifest.vault.dir}" declared but not found`);
    }

    // 3. Count skills
    const skillsDir = join(packDir, manifest.skills?.dir ?? 'skills');
    const skills = existsSync(skillsDir) ? listMarkdownFiles(skillsDir) : [];
    if (manifest.skills && skills.length === 0) {
      warnings.push(`Skills directory "${manifest.skills.dir}" declared but empty or not found`);
    }

    // 4. Count hooks
    const hooksDir = join(packDir, manifest.hooks?.dir ?? 'hooks');
    const hooks = existsSync(hooksDir) ? listMarkdownFiles(hooksDir) : [];
    if (manifest.hooks && hooks.length === 0) {
      warnings.push(`Hooks directory "${manifest.hooks.dir}" declared but empty or not found`);
    }

    // 5. Count facades/ops
    const facades = manifest.facades.length;
    const ops = manifest.facades.reduce((sum, f) => sum + f.ops.length, 0);

    return {
      valid: true,
      manifest,
      errors,
      warnings,
      counts: { vaultEntries, skills: skills.length, hooks: hooks.length, facades, ops },
    };
  }

  /**
   * Install a knowledge pack from a directory.
   */
  async install(
    packDir: string,
    runtimeCtx?: unknown,
    packRuntime?: PackRuntime,
  ): Promise<InstallResult> {
    // Validate first
    const validation = this.validate(packDir);
    if (!validation.valid || !validation.manifest) {
      return {
        id: 'unknown',
        installed: false,
        vaultEntries: 0,
        skills: [],
        hooks: [],
        facades: 0,
        error: validation.errors.join('; '),
      };
    }

    const manifest = validation.manifest;

    // Check duplicate
    if (this.packs.has(manifest.id)) {
      return {
        id: manifest.id,
        installed: false,
        vaultEntries: 0,
        skills: [],
        hooks: [],
        facades: 0,
        error: `Pack "${manifest.id}" is already installed`,
      };
    }

    try {
      // 1. Seed vault entries
      let vaultEntries = 0;
      const vaultDir = join(packDir, manifest.vault?.dir ?? 'vault');
      if (existsSync(vaultDir)) {
        const entries = loadIntelligenceData(vaultDir);
        if (entries.length > 0) {
          this.vault.seed(entries);
          vaultEntries = entries.length;
        }
      }

      // 2. Register facades via plugin system
      let facadesRegistered = false;
      if (manifest.facades.length > 0) {
        // Convert pack manifest to plugin-compatible format for registry
        const pluginLoaded = {
          manifest: {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            domain: manifest.domains[0],
            dependencies: manifest.dependencies,
            facades: manifest.facades,
            intelligence: [],
          },
          directory: packDir,
          provenance: 'custom' as const,
        };

        if (!this.pluginRegistry.get(manifest.id)) {
          this.pluginRegistry.register(pluginLoaded);
        }

        const ctx: PluginContext = {
          packRuntime:
            packRuntime ??
            ({
              vault: {},
              getProject: () => undefined,
              listProjects: () => [],
              createCheck: () => '',
              validateCheck: () => null,
              validateAndConsume: () => null,
            } as unknown as PackRuntime),
          runtime: runtimeCtx ?? {},
          manifest: pluginLoaded.manifest,
          directory: packDir,
        };

        await this.pluginRegistry.activate(manifest.id, ctx);
        facadesRegistered = true;
      }

      // 3. Discover skills and sync to .claude/skills/<packId>:<skill>/
      const skillsDir = join(packDir, manifest.skills?.dir ?? 'skills');
      const skills = existsSync(skillsDir) ? listMarkdownFiles(skillsDir) : [];

      if (skills.length > 0) {
        try {
          const { syncSkillsToClaudeCode } = await import('../skills/sync-skills.js');
          syncSkillsToClaudeCode([skillsDir], manifest.id, { global: true });
        } catch {
          // Skill sync is best-effort — never blocks install
        }
      }

      // 4. Discover hooks
      const hooksDir = join(packDir, manifest.hooks?.dir ?? 'hooks');
      const hooks = existsSync(hooksDir) ? listMarkdownFiles(hooksDir) : [];

      // Track installed pack with lifecycle
      this.lifecycle.initState(manifest.id, 'installed');
      this.lifecycle.transition(manifest.id, 'ready', 'Initial install');

      const installed: InstalledPack = {
        id: manifest.id,
        manifest,
        directory: packDir,
        status: 'ready',
        vaultEntries,
        skills,
        hooks,
        facadesRegistered,
        installedAt: Date.now(),
        transitions: this.lifecycle.getTransitions(manifest.id),
      };
      this.packs.set(manifest.id, installed);

      return {
        id: manifest.id,
        installed: true,
        vaultEntries,
        skills,
        hooks,
        facades: manifest.facades.length,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);

      // Transition to error state
      this.lifecycle.initState(manifest.id, 'installed');
      this.lifecycle.transition(manifest.id, 'error', error);

      this.packs.set(manifest.id, {
        id: manifest.id,
        manifest,
        directory: packDir,
        status: 'error',
        error,
        errorMessage: error,
        vaultEntries: 0,
        skills: [],
        hooks: [],
        facadesRegistered: false,
        installedAt: Date.now(),
        transitions: this.lifecycle.getTransitions(manifest.id),
      });

      return {
        id: manifest.id,
        installed: false,
        vaultEntries: 0,
        skills: [],
        hooks: [],
        facades: 0,
        error,
      };
    }
  }

  /**
   * Uninstall a pack — deactivates facades, removes from registry.
   * Note: vault entries are NOT removed (they become part of knowledge).
   */
  uninstall(packId: string): boolean {
    const pack = this.packs.get(packId);
    if (!pack) return false;

    // Deactivate facades
    if (pack.facadesRegistered) {
      this.pluginRegistry.deactivate(packId);
    }

    // Remove pack skills from .claude/skills/
    if (pack.skills.length > 0) {
      try {
        const claudeSkillsDir = join(homedir(), '.claude', 'skills');
        for (const skillPath of pack.skills) {
          const skillName = basename(skillPath, '.md');
          const registeredPath = join(claudeSkillsDir, `${packId}:${skillName}`);
          if (existsSync(registeredPath)) {
            rmSync(registeredPath, { recursive: true, force: true });
          }
        }
      } catch {
        // Skill cleanup is best-effort
      }
    }

    // Transition to uninstalled
    try {
      this.lifecycle.transition(packId, 'uninstalled', 'User uninstall');
    } catch {
      // May not be tracked in lifecycle — continue anyway
    }
    this.lifecycle.remove(packId);

    pack.status = 'uninstalled';
    this.packs.delete(packId);
    return true;
  }

  /**
   * Disable a pack — deactivates capabilities but preserves vault entries.
   */
  disable(packId: string): boolean {
    const pack = this.packs.get(packId);
    if (!pack) return false;

    this.lifecycle.transition(packId, 'disabled', 'User disabled');

    // Deactivate facades
    if (pack.facadesRegistered) {
      this.pluginRegistry.deactivate(packId);
    }

    pack.status = 'disabled';
    pack.disabledAt = Date.now();
    pack.transitions = this.lifecycle.getTransitions(packId);
    return true;
  }

  /**
   * Enable a previously disabled pack — reactivates capabilities.
   */
  async enable(packId: string, runtimeCtx?: unknown, packRuntime?: PackRuntime): Promise<boolean> {
    const pack = this.packs.get(packId);
    if (!pack) return false;

    this.lifecycle.transition(packId, 'ready', 'User enabled');

    // Reactivate facades
    if (pack.manifest.facades.length > 0 && this.pluginRegistry.get(packId)) {
      const ctx: PluginContext = {
        packRuntime:
          packRuntime ??
          ({
            vault: {},
            getProject: () => undefined,
            listProjects: () => [],
            createCheck: () => '',
            validateCheck: () => null,
            validateAndConsume: () => null,
          } as unknown as PackRuntime),
        runtime: runtimeCtx ?? {},
        manifest: this.pluginRegistry.get(packId)!.manifest,
        directory: pack.directory,
      };
      await this.pluginRegistry.activate(packId, ctx);
      pack.facadesRegistered = true;
    }

    pack.status = 'ready';
    pack.disabledAt = undefined;
    pack.transitions = this.lifecycle.getTransitions(packId);
    return true;
  }

  /**
   * Get an installed pack by ID.
   */
  get(packId: string): InstalledPack | undefined {
    return this.packs.get(packId);
  }

  /**
   * List all installed packs.
   */
  list(): InstalledPack[] {
    return Array.from(this.packs.values());
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function listMarkdownFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => basename(f, '.md'));
  } catch {
    return [];
  }
}
