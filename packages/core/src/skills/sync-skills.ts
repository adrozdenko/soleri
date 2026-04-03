/**
 * Skill sync — discovers SKILL.md files in agent skills directories
 * and installs them for Claude Code discovery.
 *
 * Default: project-local `.claude/skills/` with canonical (unprefixed) names
 * and symlinks so source edits propagate automatically.
 *
 * Optional `global: true` installs to `~/.claude/skills/` with agent-prefixed
 * names and file copies (symlinks to project paths don't work globally).
 *
 * Called automatically at engine startup and by admin_setup_global.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import type { SkillMetadata, SourceType } from '../packs/types.js';
import { classifyTrust } from './trust-classifier.js';
import { checkVersionCompat } from '../packs/resolver.js';

export interface SkillEntry {
  name: string;
  sourcePath: string;
  /** Trust and source metadata (populated during classification) */
  metadata?: SkillMetadata;
}

export interface SyncResult {
  installed: string[];
  updated: string[];
  skipped: string[];
  failed: string[];
  removed: string[];
  /** Stale global entries cleaned up during project-local install */
  cleanedGlobal: string[];
}

export interface SyncOptions {
  /** Install globally to ~/.claude/skills/ with agent-prefixed names (default: false) */
  global?: boolean;
  /** Project root for project-local installs (default: process.cwd()) */
  projectRoot?: string;
}

/** Error thrown when a skill requires approval due to scripts trust level */
export class ApprovalRequiredError extends Error {
  readonly skillName: string;
  readonly trust: 'scripts';
  readonly inventory: SkillMetadata['inventory'];

  constructor(skillName: string, inventory: SkillMetadata['inventory']) {
    super(
      `Skill "${skillName}" contains executable scripts and requires explicit approval. ` +
        `Scripts found: ${inventory
          .filter((i) => i.kind === 'script')
          .map((i) => i.path)
          .join(', ')}`,
    );
    this.name = 'ApprovalRequiredError';
    this.skillName = skillName;
    this.trust = 'scripts';
    this.inventory = inventory;
  }
}

/** Discover skill files (SKILL.md) in skills directories */
export function discoverSkills(skillsDirs: string[]): SkillEntry[] {
  const skills: SkillEntry[] = [];

  for (const dir of skillsDirs) {
    if (!existsSync(dir)) continue;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        skills.push({ name: entry.name, sourcePath: skillPath });
      }
    }
  }

  return skills;
}

/** Inject agent branding after YAML frontmatter and rewrite skill name */
function brandSkillContent(content: string, agentName: string, prefixedName?: string): string {
  // Find end of frontmatter (second ---)
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd === -1) return content;

  let before = content.slice(0, fmEnd + 3);
  const after = content.slice(fmEnd + 3);

  // Rewrite name: field in frontmatter to include agent prefix
  if (prefixedName) {
    before = before.replace(/^(name:\s*).+$/m, `$1${prefixedName}`);
  }

  const brandLine = `\n\n> **${agentName}** skill\n`;
  return before + brandLine + after;
}

/**
 * Sync skills to Claude Code's skills directory.
 *
 * Default (project-local): installs to `<projectRoot>/.claude/skills/` using
 * canonical (unprefixed) names and symlinks for automatic propagation.
 *
 * Global (`options.global: true`): installs to `~/.claude/skills/` using
 * agent-prefixed names and file copies (symlinks to project paths won't work).
 *
 * Project-local installs also clean up stale `{agent}-soleri-*` entries from
 * the global `~/.claude/skills/` directory to eliminate duplication.
 */
export function syncSkillsToClaudeCode(
  skillsDirs: string[],
  agentName?: string,
  options: SyncOptions = {},
): SyncResult {
  const isGlobal = options.global === true;
  const projectRoot = options.projectRoot ?? process.cwd();

  const skillsDir = isGlobal
    ? join(homedir(), '.claude', 'skills')
    : join(projectRoot, '.claude', 'skills');

  const skills = discoverSkills(skillsDirs);
  const result: SyncResult = {
    installed: [],
    updated: [],
    skipped: [],
    failed: [],
    removed: [],
    cleanedGlobal: [],
  };

  if (skills.length === 0) return result;

  for (const skill of skills) {
    // Global installs use agent-prefixed names; local uses canonical names
    const skillName =
      isGlobal && agentName
        ? `${agentName.toLowerCase().replace(/\s+/g, '-')}-${skill.name}`
        : skill.name;
    const targetDir = join(skillsDir, skillName);
    const targetPath = join(targetDir, 'SKILL.md');

    try {
      if (isGlobal) {
        // Global: copy with branding (original behavior)
        const sourceContent = readFileSync(skill.sourcePath, 'utf-8');
        const branded = agentName
          ? brandSkillContent(sourceContent, agentName, skillName)
          : sourceContent;

        if (!existsSync(targetPath)) {
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(targetPath, branded);
          result.installed.push(skill.name);
        } else {
          const sourceMtime = statSync(skill.sourcePath).mtimeMs;
          const targetMtime = statSync(targetPath).mtimeMs;
          if (sourceMtime > targetMtime) {
            writeFileSync(targetPath, branded);
            result.updated.push(skill.name);
          } else {
            result.skipped.push(skill.name);
          }
        }
      } else {
        // Project-local: symlink the skill directory
        const sourceSkillDir = dirname(skill.sourcePath);

        if (existsSync(targetDir)) {
          // Check if it's already a symlink pointing to the right place
          try {
            const stat = lstatSync(targetDir);
            if (stat.isSymbolicLink()) {
              // Already a symlink — skip
              result.skipped.push(skill.name);
              continue;
            }
          } catch {
            // lstat failed — remove and recreate
          }
          // Not a symlink — remove the copy and replace with symlink
          rmSync(targetDir, { recursive: true, force: true });
        }

        mkdirSync(skillsDir, { recursive: true });
        // Use relative symlink so the project stays portable
        const relPath = relative(skillsDir, sourceSkillDir);
        symlinkSync(relPath, targetDir);
        result.installed.push(skill.name);
      }
    } catch {
      result.failed.push(skill.name);
    }
  }

  // Orphan cleanup: remove skills that belong to this agent but are no longer in source
  if (agentName) {
    const prefix = `${agentName.toLowerCase().replace(/\s+/g, '-')}-`;
    const syncedNames = new Set<string>(
      [...result.installed, ...result.updated, ...result.skipped, ...result.failed].map((name) =>
        isGlobal ? `${prefix}${name}` : name,
      ),
    );

    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !lstatSync(join(skillsDir, entry.name)).isSymbolicLink())
          continue;
        const matchPrefix = isGlobal ? entry.name.startsWith(prefix) : true;
        if (!matchPrefix) continue;
        if (syncedNames.has(entry.name)) continue;

        // Orphan detected — stage backup then remove
        const orphanPath = join(skillsDir, entry.name);
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const stagingDir = join(homedir(), '.soleri', 'staging', timestamp);
          mkdirSync(stagingDir, { recursive: true });
          const orphanStat = lstatSync(orphanPath);
          if (!orphanStat.isSymbolicLink()) {
            cpSync(orphanPath, join(stagingDir, entry.name), { recursive: true });
          }
          rmSync(orphanPath, { recursive: true, force: true });
          result.removed.push(entry.name);
        } catch {
          result.failed.push(entry.name);
        }
      }
    } catch {
      // Skills directory doesn't exist or is unreadable — nothing to clean
    }
  }

  // Task 3: Clean up stale global entries when doing a project-local install
  if (!isGlobal && agentName) {
    cleanStaleGlobalSkills(agentName, result);
  }

  return result;
}

/**
 * Remove ALL `{agent}-soleri-*` entries from ~/.claude/skills/
 * to clean up duplicates left by the old global-install behavior.
 *
 * Cleans entries from ALL agents, not just the current one — any
 * `*-soleri-*` entry in the global dir is a stale copy from a previous
 * global install. Canonical skills now live in project-local .claude/skills/.
 */
function cleanStaleGlobalSkills(agentName: string, result: SyncResult): void {
  const globalSkillsDir = join(homedir(), '.claude', 'skills');
  if (!existsSync(globalSkillsDir)) return;

  // Match any agent-prefixed soleri skill: <anything>-soleri-<skillname>
  // Canonical project-local names look like "soleri-*" (no agent prefix).
  const stalePattern = /^.+-soleri-.+$/;

  try {
    const entries = readdirSync(globalSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!stalePattern.test(entry.name)) continue;

      const staleDir = join(globalSkillsDir, entry.name);
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const stagingDir = join(homedir(), '.soleri', 'staging', timestamp);
        mkdirSync(stagingDir, { recursive: true });
        cpSync(staleDir, join(stagingDir, entry.name), { recursive: true });
        rmSync(staleDir, { recursive: true, force: true });
        result.cleanedGlobal.push(entry.name);
      } catch {
        // Best-effort cleanup — don't fail the sync
      }
    }
  } catch {
    // Global skills dir unreadable — nothing to clean
  }
}

// =============================================================================
// TRUST CLASSIFICATION & SOURCE TRACKING
// =============================================================================

/**
 * Check engine version compatibility for a skill.
 * Returns 'compatible', 'unknown' (no version specified), or 'invalid'.
 */
export function checkSkillCompatibility(
  engineVersion?: string,
  currentVersion?: string,
): 'compatible' | 'unknown' | 'invalid' {
  if (!engineVersion) return 'unknown';
  if (!currentVersion) return 'unknown';
  return checkVersionCompat(currentVersion, engineVersion) ? 'compatible' : 'invalid';
}

/**
 * Infer the source type for a skill based on its directory path.
 */
function inferSourceType(skillDir: string): SourceType {
  if (skillDir.includes('node_modules')) return 'npm';
  if (skillDir.includes('.soleri') || skillDir.includes('.salvador')) return 'builtin';
  return 'local';
}

/**
 * Read engine version from a skill's SKILL.md frontmatter.
 * Looks for `engine:` or `engineVersion:` in YAML frontmatter.
 */
function readSkillEngineVersion(skillPath: string): string | undefined {
  try {
    const content = readFileSync(skillPath, 'utf-8');
    const fmStart = content.indexOf('---');
    if (fmStart !== 0) return undefined;
    const fmEnd = content.indexOf('---', 3);
    if (fmEnd === -1) return undefined;
    const fm = content.slice(3, fmEnd);
    // eslint-disable-next-line no-control-regex
    const match = fm.match(/^(?:engine|engineVersion)\s*:\s*["']?([^"'\n]+)["']?/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

export interface ClassifySkillsOptions {
  /** Current engine version for compatibility checking */
  currentEngineVersion?: string;
  /** Skills that have been explicitly approved for scripts trust level */
  approvedScripts?: Set<string>;
}

/**
 * Classify skills with trust levels and source tracking.
 * Enriches SkillEntry[] with metadata. Throws ApprovalRequiredError
 * for skills with 'scripts' trust unless explicitly approved.
 */
export function classifySkills(
  skills: SkillEntry[],
  options: ClassifySkillsOptions = {},
): SkillEntry[] {
  return skills.map((skill) => {
    const skillDir = dirname(skill.sourcePath);
    const { trust, inventory } = classifyTrust(skillDir);

    // Approval gate for scripts
    if (trust === 'scripts' && !options.approvedScripts?.has(skill.name)) {
      throw new ApprovalRequiredError(skill.name, inventory);
    }

    const engineVersion = readSkillEngineVersion(skill.sourcePath);
    const sourceType = inferSourceType(skillDir);
    const compatibility = checkSkillCompatibility(engineVersion, options.currentEngineVersion);

    const metadata: SkillMetadata = {
      trust,
      source: { type: sourceType, uri: skillDir },
      compatibility,
      engineVersion,
      inventory,
    };

    return { ...skill, metadata };
  });
}
