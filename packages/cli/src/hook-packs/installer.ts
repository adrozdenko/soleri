/**
 * Hook pack installer — copies hookify files to ~/.claude/ (global) or project .claude/ (local).
 */
import { existsSync, copyFileSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getPack } from './registry.js';

/** Resolve the target .claude/ directory. */
function resolveClaudeDir(projectDir?: string): string {
  if (projectDir) return join(projectDir, '.claude');
  return join(homedir(), '.claude');
}

/**
 * Resolve all hookify file paths for a pack, handling composed packs.
 * Returns a map of hook name → source file path.
 */
function resolveHookFiles(packName: string): Map<string, string> {
  const pack = getPack(packName);
  if (!pack) return new Map();

  const files = new Map<string, string>();

  if (pack.manifest.composedFrom) {
    // Composed pack: gather files from constituent packs
    for (const subPackName of pack.manifest.composedFrom) {
      const subFiles = resolveHookFiles(subPackName);
      for (const [hook, path] of subFiles) {
        files.set(hook, path);
      }
    }
  } else {
    // Direct pack: look for hookify files in the pack directory
    for (const hook of pack.manifest.hooks) {
      const filePath = join(pack.dir, `hookify.${hook}.local.md`);
      if (existsSync(filePath)) {
        files.set(hook, filePath);
      }
    }
  }

  return files;
}

/**
 * Install a hook pack to ~/.claude/ (default) or project .claude/ (--project).
 * Skips files that already exist (idempotent).
 */
export function installPack(
  packName: string,
  options?: { projectDir?: string },
): { installed: string[]; skipped: string[] } {
  const pack = getPack(packName);
  if (!pack) {
    throw new Error(`Unknown hook pack: "${packName}"`);
  }

  const claudeDir = resolveClaudeDir(options?.projectDir);
  mkdirSync(claudeDir, { recursive: true });

  const hookFiles = resolveHookFiles(packName);
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const [hook, sourcePath] of hookFiles) {
    const destPath = join(claudeDir, `hookify.${hook}.local.md`);
    if (existsSync(destPath)) {
      skipped.push(hook);
    } else {
      copyFileSync(sourcePath, destPath);
      installed.push(hook);
    }
  }

  return { installed, skipped };
}

/**
 * Remove a hook pack's files from target directory.
 */
export function removePack(
  packName: string,
  options?: { projectDir?: string },
): { removed: string[] } {
  const pack = getPack(packName);
  if (!pack) {
    throw new Error(`Unknown hook pack: "${packName}"`);
  }

  const claudeDir = resolveClaudeDir(options?.projectDir);
  const removed: string[] = [];

  for (const hook of pack.manifest.hooks) {
    const filePath = join(claudeDir, `hookify.${hook}.local.md`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      removed.push(hook);
    }
  }

  return { removed };
}

/**
 * Check if a pack is installed.
 * Returns true (all hooks present), false (none present), or 'partial'.
 */
export function isPackInstalled(
  packName: string,
  options?: { projectDir?: string },
): boolean | 'partial' {
  const pack = getPack(packName);
  if (!pack) return false;

  const claudeDir = resolveClaudeDir(options?.projectDir);
  let present = 0;

  for (const hook of pack.manifest.hooks) {
    if (existsSync(join(claudeDir, `hookify.${hook}.local.md`))) {
      present++;
    }
  }

  if (present === 0) return false;
  if (present === pack.manifest.hooks.length) return true;
  return 'partial';
}

/**
 * Get the installed version of a hook from its file header.
 * Returns null if no version found or file doesn't exist.
 */
export function getInstalledHookVersion(
  hook: string,
  options?: { projectDir?: string },
): string | null {
  const claudeDir = resolveClaudeDir(options?.projectDir);
  const filePath = join(claudeDir, `hookify.${hook}.local.md`);
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/^# Version: (.+)$/m);
  return match ? match[1] : null;
}
