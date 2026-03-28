/**
 * Trust Classifier — scans a skill directory and determines its trust level.
 *
 * Classification rules:
 * - `.sh`, `.ts`, `.js` files (non-declaration) -> `scripts`
 * - Non-`.md` files (images, JSON, etc.) -> `assets`
 * - `.md` files only -> `markdown_only`
 *
 * Also builds a full inventory of all files with their classified kind.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import type { TrustLevel, SkillInventoryItem } from '../packs/types.js';

/** File extensions that indicate executable scripts */
const SCRIPT_EXTENSIONS = new Set(['.sh', '.ts', '.js', '.mjs', '.cjs', '.py', '.rb', '.bash']);

/** File extensions considered markdown/documentation */
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

/** File extensions for TypeScript declaration files (not executable) */
const DECLARATION_PATTERN = /\.d\.[mc]?ts$/;

/**
 * Classify a skill directory and return its trust level and inventory.
 *
 * @param dirPath - Absolute path to the skill directory
 * @returns Trust level and full file inventory
 */
export function classifyTrust(dirPath: string): {
  trust: TrustLevel;
  inventory: SkillInventoryItem[];
} {
  if (!existsSync(dirPath)) {
    return { trust: 'markdown_only', inventory: [] };
  }

  const inventory: SkillInventoryItem[] = [];
  walkDir(dirPath, dirPath, inventory);

  // Determine trust level from inventory
  const hasScripts = inventory.some((item) => item.kind === 'script');
  const hasAssets = inventory.some((item) => item.kind === 'asset');

  let trust: TrustLevel;
  if (hasScripts) {
    trust = 'scripts';
  } else if (hasAssets) {
    trust = 'assets';
  } else {
    trust = 'markdown_only';
  }

  return { trust, inventory };
}

/**
 * Namespace object for backward compatibility and namespaced access.
 * Delegates to standalone `classifyTrust` function.
 */
export const TrustClassifier = {
  classify(dirPath: string): Promise<{ trust: TrustLevel; inventory: SkillInventoryItem[] }> {
    return Promise.resolve(classifyTrust(dirPath));
  },
};

/** Recursively walk a directory and classify all files */
function walkDir(rootDir: string, currentDir: string, inventory: SkillInventoryItem[]): void {
  let names: string[];
  try {
    names = readdirSync(currentDir);
  } catch {
    return;
  }

  for (const name of names) {
    const fullPath = join(currentDir, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Skip hidden directories and node_modules
      if (name.startsWith('.') || name === 'node_modules') continue;
      walkDir(rootDir, fullPath, inventory);
      continue;
    }

    if (!stat.isFile()) continue;

    const relPath = relative(rootDir, fullPath).replaceAll('\\', '/');
    const ext = extname(name).toLowerCase();
    const kind = classifyFile(name, ext);

    inventory.push({ path: relPath, kind });
  }
}

/** Classify a single file by its extension and name */
function classifyFile(fileName: string, ext: string): SkillInventoryItem['kind'] {
  // SKILL.md is the primary skill definition
  if (fileName === 'SKILL.md' || fileName === 'skill.md') {
    return 'skill';
  }

  // Declaration files are not executable
  if (DECLARATION_PATTERN.test(fileName)) {
    return 'reference';
  }

  // Script files
  if (SCRIPT_EXTENSIONS.has(ext)) {
    return 'script';
  }

  // Markdown files are references
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return 'reference';
  }

  // Everything else is an asset
  return 'asset';
}
