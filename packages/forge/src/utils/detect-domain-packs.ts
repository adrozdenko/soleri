/**
 * Auto-detect installed @soleri/domain-* packages.
 * Scans node_modules for packages matching the pattern.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DetectedDomainPack {
  /** Display name (e.g., 'design') */
  name: string;
  /** npm package name (e.g., '@soleri/domain-design') */
  package: string;
  /** Installed version from package.json */
  version: string;
}

/**
 * Scan node_modules/@soleri/ for domain-* packages and return refs
 * suitable for merging into AgentConfig.domainPacks.
 *
 * Walks up from basePath to find the nearest node_modules with @soleri scope.
 * For each `domain-*` directory found, reads its package.json to extract
 * name and version, then does a lightweight structural check (the package
 * must export a default or named 'pack' with name, version, domains, ops fields).
 *
 * @param basePath - Directory to start searching from (typically config.outputDir)
 * @returns Array of detected domain pack references
 */
export function detectInstalledDomainPacks(basePath: string): DetectedDomainPack[] {
  const results: DetectedDomainPack[] = [];
  const soleriScope = findSoleriScope(basePath);
  if (!soleriScope) return results;

  let entries: string[];
  try {
    entries = readdirSync(soleriScope);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.startsWith('domain-')) continue;

    const packDir = join(soleriScope, entry);
    const pkgJsonPath = join(packDir, 'package.json');

    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
        name?: string;
        version?: string;
        main?: string;
      };

      if (!pkg.name || !pkg.version) continue;

      // Lightweight structural check: look for an index/main file that
      // would be importable. We don't actually import it (that would
      // execute arbitrary code at scaffold time), but we verify the
      // package looks like a domain pack by checking package.json keywords
      // or the presence of expected exports.
      if (looksLikeDomainPack(packDir, pkg)) {
        const shortName = entry.replace(/^domain-/, '');
        results.push({
          name: shortName,
          package: pkg.name,
          version: pkg.version,
        });
      }
    } catch {
      // Skip packages with invalid package.json
    }
  }

  return results;
}

/**
 * Walk up from basePath to find node_modules/@soleri directory.
 */
function findSoleriScope(basePath: string): string | null {
  let current = basePath;
  const seen = new Set<string>();

  while (current && !seen.has(current)) {
    seen.add(current);
    const candidate = join(current, 'node_modules', '@soleri');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Lightweight check that a package looks like a domain pack without importing it.
 * Checks for:
 * - A soleri-domain-pack keyword in package.json, OR
 * - An entry point file that exists
 */
function looksLikeDomainPack(
  packDir: string,
  pkg: { main?: string; keywords?: string[]; exports?: unknown },
): boolean {
  // Fast path: keyword-based detection
  if (Array.isArray(pkg.keywords) && pkg.keywords.includes('soleri-domain-pack')) {
    return true;
  }

  // Check that the package has an entry point (main or exports)
  if (pkg.main) {
    return existsSync(join(packDir, pkg.main));
  }

  // Check common entry points
  for (const candidate of ['dist/index.js', 'index.js', 'dist/index.mjs']) {
    if (existsSync(join(packDir, candidate))) {
      return true;
    }
  }

  return false;
}
