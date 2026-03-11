/**
 * Deprecation utilities — log warnings for deprecated ops with migration paths.
 *
 * Follows Soleri's semver policy:
 * 1. Op marked deprecated → logs warning (minor version)
 * 2. Warning persists for 2+ minor versions
 * 3. Op removed (next major version)
 */

const warned = new Set<string>();

export interface DeprecationInfo {
  /** The deprecated op/function name */
  name: string;
  /** Version when it was deprecated */
  since: string;
  /** Version when it will be removed */
  removeIn?: string;
  /** What to use instead */
  replacement?: string;
  /** Additional migration guidance */
  message?: string;
}

/**
 * Log a deprecation warning (once per op per process lifetime).
 */
export function deprecationWarning(info: DeprecationInfo): void {
  if (warned.has(info.name)) return;
  warned.add(info.name);

  const parts = [`[DEPRECATED] "${info.name}" is deprecated since v${info.since}.`];
  if (info.replacement) parts.push(`Use "${info.replacement}" instead.`);
  if (info.removeIn) parts.push(`Will be removed in v${info.removeIn}.`);
  if (info.message) parts.push(info.message);

  console.warn(parts.join(' '));
}

/**
 * Create a deprecated op handler that wraps the real handler with a warning.
 */
export function wrapDeprecated<T extends (...args: unknown[]) => unknown>(
  fn: T,
  info: DeprecationInfo,
): T {
  return ((...args: unknown[]) => {
    deprecationWarning(info);
    return fn(...args);
  }) as T;
}

/**
 * Clear warned set (for testing).
 */
export function resetDeprecationWarnings(): void {
  warned.clear();
}
