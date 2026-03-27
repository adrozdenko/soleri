/**
 * Lightweight update notification — checks npm registry for newer @soleri/core.
 *
 * - Non-blocking: call without await, notifications appear in stderr
 * - Rate-limited: at most once per 24 hours via cache file
 * - Opt-out: set SOLERI_NO_UPDATE_CHECK=1
 * - Zero dependencies: uses Node.js built-in fetch()
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { SOLERI_HOME, usedLegacyFallback } from './paths.js';

const CACHE_FILE = join(SOLERI_HOME, 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@soleri/core/latest';
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  checkedAt: number;
  latestVersion: string | null;
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  changelogUrl: string | null;
  hasBreakingChanges: boolean;
  hasMultipleReleases: boolean;
}

const CHANGELOG_BASE_URL = 'https://github.com/adrozdenko/soleri/releases/tag';

/**
 * Build a changelog URL for a given version.
 */
export function buildChangelogUrl(version: string): string {
  return `${CHANGELOG_BASE_URL}/v${version}`;
}

/**
 * Parse the major version from a semver string (x.y.z).
 */
function parseMajor(version: string): number {
  return Number(version.split('.')[0]) || 0;
}

/**
 * Parse the minor version from a semver string (x.y.z).
 */
function parseMinor(version: string): number {
  return Number(version.split('.')[1]) || 0;
}

/**
 * Detect breaking changes (major version bump) and multi-release jumps (minor +2).
 */
export function detectBreakingChanges(
  currentVersion: string,
  latestVersion: string,
): { hasBreakingChanges: boolean; hasMultipleReleases: boolean } {
  const currentMajor = parseMajor(currentVersion);
  const latestMajor = parseMajor(latestVersion);
  const hasBreakingChanges = latestMajor !== currentMajor;

  const currentMinor = parseMinor(currentVersion);
  const latestMinor = parseMinor(latestVersion);
  // Multiple releases: same major but minor jumped by 2+
  const hasMultipleReleases =
    !hasBreakingChanges && latestMajor === currentMajor && latestMinor - currentMinor >= 2;

  return { hasBreakingChanges, hasMultipleReleases };
}

function readCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    mkdirSync(SOLERI_HOME, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf-8');
  } catch {
    // Non-critical — skip silently
  }
}

/**
 * Simple semver comparison: returns true if b is newer than a.
 * Handles x.y.z format only (no pre-release tags).
 */
function isNewer(current: string, latest: string): boolean {
  const a = current.split('.').map(Number);
  const b = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((b[i] ?? 0) > (a[i] ?? 0)) return true;
    if ((b[i] ?? 0) < (a[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Check for updates and emit stderr notifications.
 * Call fire-and-forget (no await needed). Never throws.
 */
export async function checkForUpdate(agentId: string, currentVersion: string): Promise<void> {
  // Opt-out via env var
  if (process.env.SOLERI_NO_UPDATE_CHECK === '1') return;

  const tag = '[soleri]';

  // Migration notification (always check, regardless of rate limit)
  if (usedLegacyFallback(agentId)) {
    console.error(
      `${tag} Migration available: run "soleri agent migrate ${agentId}" to consolidate data under ~/.soleri/`,
    );
  }

  // Rate limit: skip if checked recently
  const cache = readCache();
  if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
    // Use cached result
    if (cache.latestVersion && isNewer(currentVersion, cache.latestVersion)) {
      emitUpdateNotifications(tag, currentVersion, cache.latestVersion);
    }
    return;
  }

  // Fetch latest version from npm
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      writeCache({ checkedAt: Date.now(), latestVersion: null });
      return;
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version ?? null;

    writeCache({ checkedAt: Date.now(), latestVersion });

    if (latestVersion && isNewer(currentVersion, latestVersion)) {
      emitUpdateNotifications(tag, currentVersion, latestVersion);
    }
  } catch {
    // Network error, timeout, etc. — fail silently
    writeCache({ checkedAt: Date.now(), latestVersion: null });
  }
}

/**
 * Emit update notification messages to stderr, including changelog URL
 * and breaking change / multi-release warnings.
 */
function emitUpdateNotifications(tag: string, currentVersion: string, latestVersion: string): void {
  console.error(`${tag} Update available: @soleri/core ${currentVersion} → ${latestVersion}`);
  console.error(`${tag} Run: soleri agent update`);
  console.error(`${tag} Changelog: ${buildChangelogUrl(latestVersion)}`);

  const { hasBreakingChanges, hasMultipleReleases } = detectBreakingChanges(
    currentVersion,
    latestVersion,
  );

  if (hasBreakingChanges) {
    const latestMajor = latestVersion.split('.')[0];
    console.error(`${tag} ⚠ Breaking changes in v${latestMajor}.0.0 — see migration guide`);
  } else if (hasMultipleReleases) {
    console.error(`${tag} Multiple releases since your version — review changelog`);
  }
}
