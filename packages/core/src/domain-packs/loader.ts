/**
 * Domain Pack loader — resolves, validates, and dependency-sorts domain packs.
 */

import { validateDomainPack } from './types.js';
import type { DomainPack, DomainPackManifest, DomainPackRef } from './types.js';

/**
 * Load a single domain pack from an npm package.
 *
 * @param packageName - npm package name (e.g., '@soleri/domain-design')
 * @returns Validated DomainPackManifest
 * @throws If package cannot be imported or fails validation
 */
export async function loadDomainPack(packageName: string): Promise<DomainPackManifest> {
  let mod: Record<string, unknown>;
  try {
    mod = await import(packageName);
  } catch (err) {
    throw new Error(
      `Failed to import domain pack "${packageName}": ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // Support both default export and named 'pack' export
  const packCandidate = mod.default ?? mod.pack;
  if (!packCandidate) {
    throw new Error(`Domain pack "${packageName}" has no default or named "pack" export.`);
  }

  const result = validateDomainPack(packCandidate);
  if (!result.success) {
    throw new Error(`Domain pack "${packageName}" failed validation: ${result.errors.message}`);
  }

  const manifest: DomainPackManifest = { ...result.data, packageName };

  // Warn if pack's engine requirement is mismatched
  try {
    const pkgJson = await import(`${packageName}/package.json`, { with: { type: 'json' } })
      .then((m) => m.default)
      .catch(() => null);
    const peerCore = pkgJson?.peerDependencies?.['@soleri/core'];
    if (peerCore) {
      const requiredMajor = parseInt(peerCore.replace(/[^0-9]/g, ''), 10);
      const { ENGINE_MAJOR_VERSION } = await import('../engine/module-manifest.js');
      if (requiredMajor && ENGINE_MAJOR_VERSION && requiredMajor > ENGINE_MAJOR_VERSION) {
        console.error(
          `[warn] Domain pack "${packageName}" requires @soleri/core ${peerCore} ` +
            `but engine is v${ENGINE_MAJOR_VERSION}. Upgrade @soleri/core.`,
        );
      }
    }
  } catch {
    // Version check is best-effort — don't block loading
  }

  return manifest;
}

/**
 * Load all domain packs from AgentConfig refs.
 *
 * @param refs - Array of DomainPackRef from agent config
 * @returns Validated and dependency-sorted packs
 */
export async function loadDomainPacksFromConfig(
  refs: DomainPackRef[],
): Promise<DomainPackManifest[]> {
  const results = await Promise.allSettled(refs.map((ref) => loadDomainPack(ref.package)));
  const packs: DomainPackManifest[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      packs.push(result.value);
    } else {
      console.error(
        `[warn] Failed to load domain pack "${refs[i].package}": ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
    }
  }
  return resolveDependencies(packs);
}

/**
 * Topological sort of domain packs by their `requires` field.
 *
 * @param packs - Array of domain packs (validated)
 * @returns Sorted array (dependencies before dependents)
 * @throws On circular dependencies or missing dependencies
 */
export function resolveDependencies<T extends DomainPack>(packs: T[]): T[] {
  const byName = new Map<string, T>();
  for (const pack of packs) {
    byName.set(pack.name, pack);
  }

  // Check for missing dependencies
  for (const pack of packs) {
    if (pack.requires) {
      for (const dep of pack.requires) {
        if (!byName.has(dep)) {
          throw new Error(
            `Domain pack "${pack.name}" requires "${dep}" but it was not found in the loaded packs.`,
          );
        }
      }
    }
  }

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const pack of packs) {
    inDegree.set(pack.name, 0);
    adjList.set(pack.name, []);
  }

  for (const pack of packs) {
    if (pack.requires) {
      for (const dep of pack.requires) {
        adjList.get(dep)!.push(pack.name);
        inDegree.set(pack.name, (inDegree.get(pack.name) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: T[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(byName.get(current)!);

    for (const dependent of adjList.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== packs.length) {
    const remaining = packs
      .filter((p) => !sorted.some((s) => s.name === p.name))
      .map((p) => p.name);
    throw new Error(`Circular dependency detected among domain packs: ${remaining.join(', ')}`);
  }

  return sorted;
}
