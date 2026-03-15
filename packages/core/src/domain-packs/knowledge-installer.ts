/**
 * Three-tier knowledge installer for domain packs.
 *
 * Respects KnowledgeManifest tiers:
 * - canonical/: seed_canonical (immutable, highest authority)
 * - curated/: import via vault (curator-eligible)
 * - captured/: import via vault (tier=captured)
 *
 * All entries tagged with origin=pack and source=packName.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AgentRuntime } from '../runtime/types.js';
import type { DomainPack } from './types.js';

export interface KnowledgeInstallResult {
  canonical: number;
  curated: number;
  captured: number;
  skipped: number;
}

/**
 * Install knowledge from a domain pack into the agent's vault.
 *
 * @param pack - The domain pack with knowledge manifest
 * @param runtime - Agent runtime with vault access
 * @param rootDir - Absolute path to the pack's root directory
 */
export async function installKnowledge(
  pack: DomainPack,
  runtime: AgentRuntime,
  rootDir: string,
): Promise<KnowledgeInstallResult> {
  const result: KnowledgeInstallResult = { canonical: 0, curated: 0, captured: 0, skipped: 0 };

  if (!pack.knowledge) return result;

  const { vault } = runtime;
  const knowledge = pack.knowledge;

  // Tier 1: Canonical (immutable)
  if (knowledge.canonical) {
    const dir = resolve(rootDir, knowledge.canonical);
    if (existsSync(dir)) {
      const count = importMarkdownEntries(vault, dir, {
        tier: 'canonical',
        origin: 'pack',
        source: pack.name,
        immutable: true,
      });
      result.canonical = count;
    }
  }

  // Tier 2: Curated (grooming-eligible)
  if (knowledge.curated) {
    const dir = resolve(rootDir, knowledge.curated);
    if (existsSync(dir)) {
      const count = importMarkdownEntries(vault, dir, {
        tier: 'curated',
        origin: 'pack',
        source: pack.name,
      });
      result.curated = count;
    }
  }

  // Tier 3: Captured (seed learnings)
  if (knowledge.captured) {
    const dir = resolve(rootDir, knowledge.captured);
    if (existsSync(dir)) {
      const count = importMarkdownEntries(vault, dir, {
        tier: 'captured',
        origin: 'pack',
        source: pack.name,
      });
      result.captured = count;
    }
  }

  return result;
}

/** Import markdown files from a directory into the vault. */
function importMarkdownEntries(
  vault: AgentRuntime['vault'],
  dir: string,
  meta: { tier: string; origin: string; source: string; immutable?: boolean },
): number {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  let imported = 0;

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    const id = `pack-${meta.source}-${file.replace(/\.md$/, '')}`;

    // Skip if canonical entry already exists (immutable = never overwrite)
    if (meta.immutable && vault.get(id)) continue;

    vault.upsert({
      id,
      type: 'pattern',
      title: file.replace(/\.md$/, '').replace(/-/g, ' '),
      description: content.slice(0, 200),
      severity: 'suggestion',
      tags: [`pack:${meta.source}`, `tier:${meta.tier}`],
      domain: meta.source,
      origin: meta.origin,
    });
    imported++;
  }

  return imported;
}
