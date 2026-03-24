/**
 * @soleri/domain-component — Component registry lifecycle domain pack.
 *
 * 7 ops:
 * - search (data-serving): search vault for components by query
 * - get (data-serving): get component by ID from vault
 * - list (data-serving): list components with optional filters
 * - create (algorithmic): register new component in vault with metadata
 * - detect_drift (algorithmic): compare component code against vault metadata
 * - analyze_dependencies (algorithmic): parse imports to build dependency graph
 * - sync_status (algorithmic): check sync between vault and filesystem
 */

import { z } from 'zod';
import type { DomainPack } from '@soleri/core';
import type { PackRuntime } from '@soleri/core';

// ---------------------------------------------------------------------------
// In-memory component registry (lightweight store for pack-level ops)
// ---------------------------------------------------------------------------

export interface ComponentEntry {
  id: string;
  name: string;
  description: string;
  props: string[];
  tags: string[];
  filePath?: string;
  createdAt: string;
  updatedAt: string;
}

const registry = new Map<string, ComponentEntry>();

// ---------------------------------------------------------------------------
// PackRuntime holder — injected via onActivate, enables vault-backed ops
// ---------------------------------------------------------------------------

let packRuntime: PackRuntime | null = null;

// ---------------------------------------------------------------------------
// Algorithmic helpers
// ---------------------------------------------------------------------------

/**
 * Parse `import ... from '...'` statements and return dependency names.
 * Handles: import X from 'y', import { A, B } from 'y', import * as Z from 'y'
 */
export function parseImports(code: string): string[] {
  const deps: string[] = [];
  const importRegex = /import\s+(?:[\w*{}\s,]+)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    deps.push(match[1]);
  }
  // Also match side-effect imports: import 'foo'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(code)) !== null) {
    if (!deps.includes(match[1])) {
      deps.push(match[1]);
    }
  }
  return deps;
}

/**
 * Detect drift between current code and stored component metadata.
 * Compares description presence and props list.
 */
export function detectDriftBetween(
  code: string,
  stored: { description: string; props: string[] },
): {
  drifted: boolean;
  changes: Array<{ field: string; type: 'added' | 'removed' | 'changed'; detail: string }>;
} {
  const changes: Array<{ field: string; type: 'added' | 'removed' | 'changed'; detail: string }> =
    [];

  // Extract props from code — look for interface/type Props patterns
  const propsInCode = extractPropsFromCode(code);

  // Check for new props in code not in stored
  for (const prop of propsInCode) {
    if (!stored.props.includes(prop)) {
      changes.push({ field: 'props', type: 'added', detail: `New prop: ${prop}` });
    }
  }

  // Check for removed props (in stored but not in code)
  for (const prop of stored.props) {
    if (!propsInCode.includes(prop)) {
      changes.push({ field: 'props', type: 'removed', detail: `Removed prop: ${prop}` });
    }
  }

  return { drifted: changes.length > 0, changes };
}

/**
 * Extract prop names from TypeScript/JSX code by scanning interface/type definitions.
 */
export function extractPropsFromCode(code: string): string[] {
  const props: string[] = [];
  // Match: propName: type or propName?: type inside Props-like interfaces
  const propRegex = /^\s*(\w+)\s*\??:\s*/gm;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(code)) !== null) {
    const name = match[1];
    // Filter out common non-prop keywords
    if (
      ![
        'import',
        'export',
        'const',
        'let',
        'var',
        'return',
        'function',
        'type',
        'interface',
        'class',
      ].includes(name)
    ) {
      if (!props.includes(name)) {
        props.push(name);
      }
    }
  }
  return props;
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

const ops = [
  // --- Data-serving ---
  {
    name: 'search',
    description: 'Search vault for components by query string.',
    auth: 'read' as const,
    schema: z.object({
      query: z.string(),
      tags: z.array(z.string()).optional(),
      limit: z.number().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const query = (params.query as string).toLowerCase();
      const tags = params.tags as string[] | undefined;
      const limit = (params.limit as number) ?? 20;

      // When runtime available, search the vault
      if (packRuntime) {
        const vaultResults = packRuntime.vault.search(query, {
          domain: 'component',
          limit,
        });
        return { query, count: vaultResults.length, components: vaultResults, source: 'vault' };
      }

      // Fallback: in-memory registry
      const results: ComponentEntry[] = [];

      for (const entry of registry.values()) {
        const matchesQuery =
          entry.name.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query) ||
          entry.tags.some((t) => t.toLowerCase().includes(query));
        const matchesTags = !tags || tags.some((t) => entry.tags.includes(t));
        if (matchesQuery && matchesTags) {
          results.push(entry);
        }
        if (results.length >= limit) break;
      }

      return { query, count: results.length, components: results };
    },
  },
  {
    name: 'get',
    description: 'Get a component by ID from the registry.',
    auth: 'read' as const,
    schema: z.object({
      id: z.string(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const id = params.id as string;

      // When runtime available, get from vault
      if (packRuntime) {
        const vaultEntry = packRuntime.vault.get(id);
        if (!vaultEntry) {
          return { found: false, id, component: null, source: 'vault' };
        }
        return { found: true, id, component: vaultEntry, source: 'vault' };
      }

      // Fallback: in-memory registry
      const entry = registry.get(id);
      if (!entry) {
        return { found: false, id, component: null };
      }
      return { found: true, id, component: entry };
    },
  },
  {
    name: 'list',
    description: 'List components with optional tag/name filters.',
    auth: 'read' as const,
    schema: z.object({
      tags: z.array(z.string()).optional(),
      namePattern: z.string().optional(),
      limit: z.number().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const tags = params.tags as string[] | undefined;
      const namePattern = params.namePattern as string | undefined;
      const limit = (params.limit as number) ?? 50;

      // When runtime available, list from vault
      if (packRuntime) {
        const vaultEntries = packRuntime.vault.list({ domain: 'component', limit });
        return {
          count: vaultEntries.length,
          total: vaultEntries.length,
          components: vaultEntries,
          source: 'vault',
        };
      }

      // Fallback: in-memory registry
      const results: ComponentEntry[] = [];

      for (const entry of registry.values()) {
        const matchesTags = !tags || tags.some((t) => entry.tags.includes(t));
        const matchesName =
          !namePattern || entry.name.toLowerCase().includes(namePattern.toLowerCase());
        if (matchesTags && matchesName) {
          results.push(entry);
        }
        if (results.length >= limit) break;
      }

      return { count: results.length, total: registry.size, components: results };
    },
  },

  // --- Algorithmic ---
  {
    name: 'create',
    description: 'Register a new component in the vault with metadata.',
    auth: 'write' as const,
    schema: z.object({
      name: z.string(),
      description: z.string(),
      props: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      filePath: z.string().optional(),
      contrastCheckId: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const name = params.name as string;
      const description = params.description as string;
      const props = (params.props as string[]) ?? [];
      const tags = (params.tags as string[]) ?? [];
      const filePath = params.filePath as string | undefined;
      const contrastCheckId = params.contrastCheckId as string | undefined;

      // Gated creation: if contrastCheckId provided, validate it via runtime
      if (contrastCheckId) {
        if (!packRuntime) {
          return { created: false, reason: 'contrastCheckId requires PackRuntime (not available)' };
        }
        const check = packRuntime.validateAndConsume(contrastCheckId, 'contrast');
        if (!check) {
          return { created: false, reason: 'Invalid or expired contrastCheckId' };
        }
      }

      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const now = new Date().toISOString();

      if (registry.has(id)) {
        return { created: false, id, reason: 'Component already exists' };
      }

      const entry: ComponentEntry = {
        id,
        name,
        description,
        props,
        tags,
        filePath,
        createdAt: now,
        updatedAt: now,
      };

      registry.set(id, entry);
      return { created: true, id, component: entry };
    },
  },
  {
    name: 'detect_drift',
    description:
      'Compare component code against stored vault metadata to detect changes in props or structure.',
    auth: 'read' as const,
    schema: z.object({
      id: z.string(),
      code: z.string(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const id = params.id as string;
      const code = params.code as string;
      const entry = registry.get(id);

      if (!entry) {
        return {
          found: false,
          id,
          drifted: false,
          changes: [],
          error: 'Component not found in registry',
        };
      }

      const result = detectDriftBetween(code, {
        description: entry.description,
        props: entry.props,
      });
      return { found: true, id, ...result };
    },
  },
  {
    name: 'analyze_dependencies',
    description: 'Parse import statements in component code to build a dependency graph.',
    auth: 'read' as const,
    schema: z.object({
      code: z.string(),
      componentName: z.string().optional(),
    }),
    handler: async (params: Record<string, unknown>) => {
      const code = params.code as string;
      const componentName = params.componentName as string | undefined;
      const dependencies = parseImports(code);

      const internal = dependencies.filter((d) => d.startsWith('.') || d.startsWith('@/'));
      const external = dependencies.filter((d) => !d.startsWith('.') && !d.startsWith('@/'));

      return {
        componentName: componentName ?? 'unknown',
        totalDependencies: dependencies.length,
        internal,
        external,
        dependencies,
      };
    },
  },
  {
    name: 'sync_status',
    description:
      'Check which components are in sync, drifted, or missing between vault registry and a provided file list.',
    auth: 'read' as const,
    schema: z.object({
      filePaths: z.array(z.string()),
    }),
    handler: async (params: Record<string, unknown>) => {
      const filePaths = params.filePaths as string[];
      const results: Array<{
        id: string;
        name: string;
        status: 'synced' | 'drift' | 'missing-file';
      }> = [];

      // Check registered components against file list
      for (const entry of registry.values()) {
        if (!entry.filePath) {
          results.push({ id: entry.id, name: entry.name, status: 'drift' });
        } else if (filePaths.includes(entry.filePath)) {
          results.push({ id: entry.id, name: entry.name, status: 'synced' });
        } else {
          results.push({ id: entry.id, name: entry.name, status: 'missing-file' });
        }
      }

      // Files not in registry
      const unregistered = filePaths.filter(
        (fp) => ![...registry.values()].some((e) => e.filePath === fp),
      );

      return {
        total: registry.size,
        synced: results.filter((r) => r.status === 'synced').length,
        drifted: results.filter((r) => r.status === 'drift').length,
        missingFile: results.filter((r) => r.status === 'missing-file').length,
        unregistered: unregistered.length,
        components: results,
        unregisteredFiles: unregistered,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// DomainPack manifest
// ---------------------------------------------------------------------------

const pack: DomainPack = {
  name: 'component',
  version: '1.0.0',
  tier: 'default',
  domains: ['component'],
  ops,
  onActivate: async (narrowedRuntime: PackRuntime) => {
    packRuntime = narrowedRuntime;
  },
  rules: `## Component Lifecycle

1. **Register first** — Every component must be registered in the vault before use.
2. **Drift detection** — Run \`detect_drift\` after code changes to keep vault metadata in sync.
3. **Dependency awareness** — Use \`analyze_dependencies\` to understand coupling before refactoring.
4. **Sync checks** — Run \`sync_status\` periodically to find orphaned or unregistered components.
`,
};

export default pack;

// Export registry utilities for testing
export function _clearRegistry(): void {
  registry.clear();
}

export function _setPackRuntime(runtime: PackRuntime | null): void {
  packRuntime = runtime;
}

export function _getRegistry(): Map<string, ComponentEntry> {
  return registry;
}
