/**
 * Agent project detection helpers.
 *
 * Extracted from soleri-engine.ts so tests can import without triggering
 * the engine's top-level main() bootstrap.
 */

import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Check whether a directory is an agent project (contains an agent.yaml file).
 * Used to gate project-local skill sync so unrelated cwd's don't get polluted.
 *
 * Requires agent.yaml to be a regular file — a directory of that name returns false.
 */
export function isAgentProjectDir(dir: string): boolean {
  try {
    return statSync(join(dir, 'agent.yaml')).isFile();
  } catch {
    return false;
  }
}

/**
 * Check whether two agent.yaml paths refer to the same file. Accepts absolute
 * or relative paths; normalizes via `path.resolve` before comparing.
 */
export function sameAgentYaml(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}
