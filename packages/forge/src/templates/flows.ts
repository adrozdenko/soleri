import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the core data/flows directory.
 *
 * Primary: sibling package path (monorepo — dist/templates/ → packages/core/data/flows).
 * Fallback: traverse node_modules for published installs.
 */
function resolveFlowsDir(): string {
  // Monorepo layout: packages/forge/dist/templates/ → packages/core/data/flows
  const sibling = join(__dirname, '..', '..', '..', 'core', 'data', 'flows');
  if (existsSync(sibling)) return sibling;

  // Published install: walk up until we find node_modules/@soleri/core
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, 'node_modules', '@soleri', 'core', 'data', 'flows');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `[forge/flows] Cannot locate @soleri/core data/flows directory. ` +
      `Searched sibling path: ${sibling}`,
  );
}

const FLOWS_DIR = resolveFlowsDir();

const FLOW_FILES = [
  'build.flow.yaml',
  'deliver.flow.yaml',
  'design.flow.yaml',
  'enhance.flow.yaml',
  'explore.flow.yaml',
  'fix.flow.yaml',
  'plan.flow.yaml',
  'review.flow.yaml',
];

/**
 * Generate flow YAML files for the scaffolded agent.
 * Returns an array of { path, content } tuples for each flow file.
 */
export function generateFlowFiles(): Array<{ path: string; content: string }> {
  return FLOW_FILES.map((filename) => ({
    path: `flows/${filename}`,
    content: readFileSync(join(FLOWS_DIR, filename), 'utf-8'),
  }));
}
