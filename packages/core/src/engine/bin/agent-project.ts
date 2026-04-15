/**
 * Agent project detection helpers.
 *
 * Extracted from soleri-engine.ts so tests can import without triggering
 * the engine's top-level main() bootstrap.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check whether a directory is an agent project (contains agent.yaml).
 * Used to gate project-local skill sync so unrelated cwd's don't get polluted.
 */
export function isAgentProjectDir(dir: string): boolean {
  return existsSync(join(dir, 'agent.yaml'));
}
