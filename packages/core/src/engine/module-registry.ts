/**
 * Engine module profiles — controls which modules load at startup.
 *
 * Profiles map to subsets of ENGINE_MODULES suffixes from register-engine.ts.
 * 'full' is the default for backward compatibility.
 */

/** Engine profile names */
export type EngineProfile = 'minimal' | 'standard' | 'full';

/** All valid engine profile names */
export const ENGINE_PROFILES: readonly EngineProfile[] = ['minimal', 'standard', 'full'] as const;

/**
 * Profile → module suffix mappings.
 *
 * minimal: bare essentials for a functioning agent
 * standard: adds intelligence, planning, and quality
 * full: everything (default, backward compatible)
 */
export const PROFILE_MODULES: Record<EngineProfile, readonly string[]> = {
  minimal: ['vault', 'admin', 'control', 'orchestrate'],
  standard: [
    'vault',
    'plan',
    'brain',
    'memory',
    'admin',
    'curator',
    'loop',
    'orchestrate',
    'control',
    'context',
    'archive',
  ],
  full: [
    'vault',
    'plan',
    'brain',
    'memory',
    'admin',
    'curator',
    'loop',
    'orchestrate',
    'control',
    'context',
    'agency',
    'chat',
    'operator',
    'archive',
    'sync',
    'review',
    'intake',
    'links',
    'branching',
    'embedding',
    'tier',
    'dream',
  ],
} as const;

/** All known module suffixes (for validation) */
export const ALL_MODULE_SUFFIXES = new Set(PROFILE_MODULES.full);

/**
 * Resolve which modules should be enabled.
 *
 * Priority: explicit modules list > profile > default ('full')
 * Unknown modules are warned and skipped.
 *
 * @param profile - Named profile (minimal/standard/full)
 * @param modules - Explicit module list (overrides profile)
 * @returns Set of enabled module suffixes
 */
export function resolveModules(profile?: EngineProfile, modules?: string[]): Set<string> {
  // Explicit module list takes precedence
  if (modules && modules.length > 0) {
    const resolved = new Set<string>();
    for (const mod of modules) {
      if (ALL_MODULE_SUFFIXES.has(mod)) {
        resolved.add(mod);
      } else {
        console.error(`[engine-profiles] Warning: unknown module "${mod}" — skipped`);
      }
    }
    return resolved;
  }

  // Profile-based resolution
  const effectiveProfile = profile ?? 'full';
  const profileModules = PROFILE_MODULES[effectiveProfile];
  if (!profileModules) {
    console.error(
      `[engine-profiles] Warning: unknown profile "${effectiveProfile}" — using 'full'`,
    );
    return new Set(PROFILE_MODULES.full);
  }

  return new Set(profileModules);
}
