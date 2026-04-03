/**
 * Pack Resolver — resolution chain for discovering packs.
 *
 * Resolution order:
 * 1. Local file path (absolute or relative)
 * 2. Built-in packs (bundled with the agent)
 * 3. npm registry (@soleri/pack-* or soleri-pack-*)
 *
 * Each source implements the PackSource interface.
 */

import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ─── Built-in knowledge-packs discovery ──────────────────────────────

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

/**
 * Discover the built-in `knowledge-packs/` directory shipped with @soleri/core.
 * Tries multiple levels up from this file's compiled location to account for
 * different installation layouts (monorepo dev, npm install, npx).
 */
export function getBuiltinKnowledgePacksDirs(): string[] {
  const dirs: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const candidate = resolve(_dirname, ...Array<string>(i).fill('..'), 'knowledge-packs');
    if (existsSync(candidate)) {
      dirs.push(candidate);
      break;
    }
  }
  return dirs;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface ResolvedPack {
  /** Local directory path to the pack */
  directory: string;
  /** Where it was resolved from */
  source: 'local' | 'built-in' | 'npm';
  /** npm package name (if resolved from npm) */
  npmPackage?: string;
  /** Resolved version (if from npm) */
  resolvedVersion?: string;
}

export interface ResolveOptions {
  /** Built-in pack directories to search */
  builtinDirs?: string[];
  /** Whether to try npm resolution. Default: true */
  npm?: boolean;
  /** Specific version to install (e.g., "1.2.0") */
  version?: string;
  /** npm timeout in ms. Default: 30_000 */
  npmTimeout?: number;
}

// ─── Resolver ─────────────────────────────────────────────────────────

/**
 * Resolve a pack identifier to a local directory path.
 *
 * @param pack - Local path, built-in name, or npm package name
 * @param options - Resolution options
 * @returns Resolved pack directory and source metadata
 */
export function resolvePack(pack: string, options: ResolveOptions = {}): ResolvedPack {
  // 1. Local path — absolute or relative, or existing directory
  if (pack.startsWith('/') || pack.startsWith('.') || existsSync(pack)) {
    const dir = resolve(pack);
    if (!existsSync(dir)) {
      throw new Error(`Local pack directory not found: ${dir}`);
    }
    return { directory: dir, source: 'local' };
  }

  // 2. Built-in packs — search configured directories
  if (options.builtinDirs) {
    for (const builtinDir of options.builtinDirs) {
      const packDir = join(builtinDir, pack);
      if (existsSync(packDir) && existsSync(join(packDir, 'soleri-pack.json'))) {
        return { directory: packDir, source: 'built-in' };
      }
    }
  }

  // 3. npm registry
  if (options.npm !== false) {
    return resolveFromNpm(pack, options);
  }

  throw new Error(
    `Pack "${pack}" not found. Checked: local path, built-in directories${options.npm !== false ? ', npm registry' : ''}.`,
  );
}

/**
 * Resolve a pack from the npm registry.
 * Downloads via `npm pack` and extracts to a temp directory.
 */
function resolveFromNpm(pack: string, options: ResolveOptions): ResolvedPack {
  // Normalize npm package name
  const npmName = pack.startsWith('@')
    ? pack.replace(/@[^/]*$/, '') // Strip version from scoped: @scope/name@1.0 → @scope/name
    : pack.includes('/')
      ? pack
      : `@soleri/pack-${pack.replace(/@.*$/, '')}`;

  // Extract version
  const version =
    options.version ??
    (pack.includes('@') && !pack.startsWith('@')
      ? pack.split('@').pop()
      : pack.startsWith('@') && pack.split('@').length === 3
        ? pack.split('@').pop()
        : undefined);

  const spec = version ? `${npmName}@${version}` : npmName;
  const tmpDir = join(tmpdir(), `soleri-pack-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    execFileSync('npm', ['pack', spec, '--pack-destination', tmpDir], {
      stdio: 'pipe',
      timeout: options.npmTimeout ?? 30_000,
    });

    // Find the tarball
    const files = readdirSync(tmpDir).filter((f) => f.endsWith('.tgz'));
    if (files.length === 0) {
      throw new Error(`No tarball found after npm pack ${spec}`);
    }

    const extractDir = join(tmpDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', join(tmpDir, files[0]), '-C', extractDir], {
      stdio: 'pipe',
      timeout: 15_000,
    });

    // npm pack extracts to a 'package/' subdirectory
    const packageDir = join(extractDir, 'package');
    if (!existsSync(packageDir)) {
      throw new Error(`Extracted package directory not found at ${packageDir}`);
    }

    // Extract resolved version from package.json if present
    let resolvedVersion: string | undefined;
    try {
      const pkgPath = join(packageDir, 'package.json');
      if (existsSync(pkgPath)) {
        const { readFileSync } = require('node:fs');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        resolvedVersion = pkg.version;
      }
    } catch {
      // Version extraction is best-effort
    }

    return {
      directory: packageDir,
      source: 'npm',
      npmPackage: npmName,
      resolvedVersion,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to resolve "${spec}" from npm: ${msg}`, { cause: e });
  }
}

/**
 * Check basic semver compatibility: does `version` satisfy `range`?
 *
 * Supports: ">=1.0.0", ">=1.0.0 <2.0.0", "^1.2.3", exact version "1.0.0".
 * Returns true if range is empty/undefined (no constraint).
 */
export function checkVersionCompat(version: string, range?: string): boolean {
  if (!range) return true;
  const r = range.trim();
  if (!r) return true;

  const v = parseVer(version);
  if (!v) return true; // Can't parse → don't block

  // Handle caret: ^1.2.3 means >=1.2.3 <2.0.0
  if (r.startsWith('^')) {
    const base = parseVer(r.slice(1));
    if (!base) return true;
    return compareVer(v, base) >= 0 && v[0] === base[0];
  }

  // Handle tilde: ~1.2.3 means >=1.2.3 <1.3.0
  if (r.startsWith('~')) {
    const base = parseVer(r.slice(1));
    if (!base) return true;
    return compareVer(v, base) >= 0 && v[0] === base[0] && v[1] === base[1];
  }

  // Handle compound ranges: ">=1.0.0 <2.0.0"
  const parts = r.split(/\s+/).filter(Boolean);
  return parts.every((part) => {
    if (part.startsWith('>=')) {
      const base = parseVer(part.slice(2));
      return base ? compareVer(v, base) >= 0 : true;
    }
    if (part.startsWith('>')) {
      const base = parseVer(part.slice(1));
      return base ? compareVer(v, base) > 0 : true;
    }
    if (part.startsWith('<=')) {
      const base = parseVer(part.slice(2));
      return base ? compareVer(v, base) <= 0 : true;
    }
    if (part.startsWith('<')) {
      const base = parseVer(part.slice(1));
      return base ? compareVer(v, base) < 0 : true;
    }
    // Exact match
    const exact = parseVer(part);
    return exact ? compareVer(v, exact) === 0 : true;
  });
}

type SemVer = [number, number, number];

function parseVer(s: string): SemVer | null {
  const m = s.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

function compareVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Check if a newer version is available on npm.
 * Returns the latest version string, or null if check fails.
 */
export function checkNpmVersion(npmPackage: string, timeout = 10_000): string | null {
  try {
    const output = execFileSync('npm', ['view', npmPackage, 'version'], {
      stdio: 'pipe',
      timeout,
    });
    return output.toString().trim() || null;
  } catch {
    return null;
  }
}
