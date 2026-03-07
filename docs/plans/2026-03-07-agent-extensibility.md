# Agent Extensibility Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Soleri-generated agents extensible by users while keeping core features updatable via `npm update @soleri/core`.

**Architecture:** Introduce a `src/extensions/` directory convention with auto-discovery in the generated entry point. Users register custom ops, facades, middleware, and lifecycle hooks via a typed `AgentExtensions` contract exported from `@soleri/core`. The entry point dynamically imports extensions at startup — if the directory doesn't exist, the agent runs vanilla. Core ops and user extensions never share files.

**Tech Stack:** TypeScript, Zod, `@soleri/core` types, `@soleri/forge` templates, `@soleri/cli` Commander.js commands

---

## Task 1: Extension Types in `@soleri/core`

**Files:**
- Create: `packages/core/src/extensions/types.ts`
- Create: `packages/core/src/extensions/middleware.ts`
- Create: `packages/core/src/extensions/index.ts`
- Modify: `packages/core/src/index.ts` (add exports)
- Test: `packages/core/src/__tests__/extensions.test.ts`

**Step 1: Write the failing test**

```ts
// packages/core/src/__tests__/extensions.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { wrapWithMiddleware } from '../extensions/middleware.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { OpMiddleware, AgentExtensions } from '../extensions/types.js';

describe('extensions', () => {
  let runtime: AgentRuntime;

  afterEach(() => {
    runtime?.close();
  });

  describe('AgentExtensions type', () => {
    it('should accept empty extensions', () => {
      const ext: AgentExtensions = {};
      expect(ext.ops).toBeUndefined();
      expect(ext.facades).toBeUndefined();
      expect(ext.middleware).toBeUndefined();
      expect(ext.hooks).toBeUndefined();
    });

    it('should accept extensions with ops', () => {
      const ext: AgentExtensions = {
        ops: [
          {
            name: 'custom_op',
            description: 'A custom op',
            auth: 'read',
            handler: async () => ({ ok: true }),
          },
        ],
      };
      expect(ext.ops).toHaveLength(1);
    });

    it('should accept extensions with facades', () => {
      const ext: AgentExtensions = {
        facades: [
          {
            name: 'my_facade',
            description: 'Custom facade',
            ops: [
              {
                name: 'do_thing',
                description: 'Does a thing',
                auth: 'write',
                handler: async () => ({ done: true }),
              },
            ],
          },
        ],
      };
      expect(ext.facades).toHaveLength(1);
    });
  });

  describe('wrapWithMiddleware', () => {
    it('should wrap facade ops with before middleware', async () => {
      const calls: string[] = [];
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test facade',
        ops: [
          {
            name: 'greet',
            description: 'Say hello',
            auth: 'read',
            handler: async (params) => {
              calls.push('handler');
              return { message: `Hello ${params.name}` };
            },
          },
        ],
      };

      const mw: OpMiddleware = {
        name: 'logger',
        before: async (ctx) => {
          calls.push(`before:${ctx.op}`);
          return ctx.params;
        },
      };

      wrapWithMiddleware([facade], [mw]);
      const result = await facade.ops[0].handler({ name: 'World' });

      expect(calls).toEqual(['before:greet', 'handler']);
      expect(result).toEqual({ message: 'Hello World' });
    });

    it('should wrap facade ops with after middleware', async () => {
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test facade',
        ops: [
          {
            name: 'greet',
            description: 'Say hello',
            auth: 'read',
            handler: async () => ({ message: 'Hello' }),
          },
        ],
      };

      const mw: OpMiddleware = {
        name: 'enricher',
        after: async (ctx) => {
          const data = ctx.result as Record<string, unknown>;
          return { ...data, enriched: true };
        },
      };

      wrapWithMiddleware([facade], [mw]);
      const result = await facade.ops[0].handler({});
      expect(result).toEqual({ message: 'Hello', enriched: true });
    });

    it('should chain multiple middleware in order', async () => {
      const order: string[] = [];
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test',
        ops: [
          {
            name: 'op1',
            description: 'Op',
            auth: 'read',
            handler: async () => {
              order.push('handler');
              return { v: 1 };
            },
          },
        ],
      };

      const mw1: OpMiddleware = {
        name: 'first',
        before: async (ctx) => { order.push('first:before'); return ctx.params; },
        after: async (ctx) => { order.push('first:after'); return ctx.result; },
      };
      const mw2: OpMiddleware = {
        name: 'second',
        before: async (ctx) => { order.push('second:before'); return ctx.params; },
        after: async (ctx) => { order.push('second:after'); return ctx.result; },
      };

      wrapWithMiddleware([facade], [mw1, mw2]);
      await facade.ops[0].handler({});

      expect(order).toEqual(['first:before', 'second:before', 'handler', 'second:after', 'first:after']);
    });

    it('should allow before middleware to modify params', async () => {
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test',
        ops: [
          {
            name: 'echo',
            description: 'Echo',
            auth: 'read',
            handler: async (params) => params,
          },
        ],
      };

      const mw: OpMiddleware = {
        name: 'injector',
        before: async (ctx) => ({ ...ctx.params, injected: true }),
      };

      wrapWithMiddleware([facade], [mw]);
      const result = await facade.ops[0].handler({ original: true });
      expect(result).toEqual({ original: true, injected: true });
    });

    it('should handle empty middleware array (no-op)', async () => {
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test',
        ops: [
          {
            name: 'op',
            description: 'Op',
            auth: 'read',
            handler: async () => ({ ok: true }),
          },
        ],
      };

      wrapWithMiddleware([facade], []);
      const result = await facade.ops[0].handler({});
      expect(result).toEqual({ ok: true });
    });

    it('should propagate middleware errors', async () => {
      const facade: FacadeConfig = {
        name: 'test',
        description: 'Test',
        ops: [
          {
            name: 'op',
            description: 'Op',
            auth: 'read',
            handler: async () => ({ ok: true }),
          },
        ],
      };

      const mw: OpMiddleware = {
        name: 'blocker',
        before: async () => { throw new Error('Blocked by policy'); },
      };

      wrapWithMiddleware([facade], [mw]);
      await expect(facade.ops[0].handler({})).rejects.toThrow('Blocked by policy');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/__tests__/extensions.test.ts`
Expected: FAIL — modules don't exist yet

**Step 3: Write the extension types**

```ts
// packages/core/src/extensions/types.ts
import type { OpDefinition, FacadeConfig } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';

/**
 * Middleware that wraps op execution with before/after hooks.
 *
 * - `before` runs before the op handler. Return modified params or throw to reject.
 * - `after` runs after the op handler. Return modified result or throw.
 *
 * Multiple middleware are chained: before hooks run first→last,
 * after hooks run last→first (onion model).
 */
export interface OpMiddleware {
  /** Middleware name (for logging/debugging) */
  name: string;
  /** Runs before op handler. Return modified params or throw to reject. */
  before?: (ctx: MiddlewareContext) => Promise<Record<string, unknown>>;
  /** Runs after op handler. Return modified result or throw. */
  after?: (ctx: MiddlewareContext & { result: unknown }) => Promise<unknown>;
}

export interface MiddlewareContext {
  facade: string;
  op: string;
  params: Record<string, unknown>;
}

/**
 * User-defined extensions for a Soleri agent.
 *
 * Extensions live in `src/extensions/` and are auto-discovered by the entry
 * point at startup. Core ops from `@soleri/core` are never modified — extensions
 * are additive (new ops, new facades) or decorative (middleware).
 *
 * @example
 * ```ts
 * // src/extensions/index.ts
 * import type { AgentExtensions } from '@soleri/core';
 * import type { AgentRuntime } from '@soleri/core';
 *
 * export default function loadExtensions(runtime: AgentRuntime): AgentExtensions {
 *   return {
 *     ops: [myCustomOp(runtime)],
 *     facades: [myCustomFacade(runtime)],
 *     middleware: [auditLogger],
 *   };
 * }
 * ```
 */
export interface AgentExtensions {
  /** Extra ops merged into the core facade */
  ops?: OpDefinition[];
  /** New facades registered as separate MCP tools */
  facades?: FacadeConfig[];
  /** Middleware applied to all ops across all facades */
  middleware?: OpMiddleware[];
  /** Lifecycle hooks */
  hooks?: {
    /** Called after runtime init, before MCP server starts */
    onStartup?: (runtime: AgentRuntime) => Promise<void>;
    /** Called on SIGTERM/SIGINT before process exits */
    onShutdown?: (runtime: AgentRuntime) => Promise<void>;
  };
}
```

**Step 4: Write the middleware utility**

```ts
// packages/core/src/extensions/middleware.ts
import type { FacadeConfig } from '../facades/types.js';
import type { OpMiddleware } from './types.js';

/**
 * Wrap all ops in the given facades with middleware.
 *
 * Middleware chain follows the onion model:
 * - before hooks: first middleware → last middleware → handler
 * - after hooks:  last middleware → first middleware (reverse)
 *
 * This mutates the facade ops in-place (replaces handlers).
 */
export function wrapWithMiddleware(facades: FacadeConfig[], middleware: OpMiddleware[]): void {
  if (middleware.length === 0) return;

  for (const facade of facades) {
    for (const op of facade.ops) {
      const originalHandler = op.handler;

      op.handler = async (params: Record<string, unknown>) => {
        // Run before hooks (first → last)
        let currentParams = params;
        for (const mw of middleware) {
          if (mw.before) {
            currentParams = await mw.before({
              facade: facade.name,
              op: op.name,
              params: currentParams,
            });
          }
        }

        // Run original handler
        let result = await originalHandler(currentParams);

        // Run after hooks (last → first)
        for (let i = middleware.length - 1; i >= 0; i--) {
          const mw = middleware[i];
          if (mw.after) {
            result = await mw.after({
              facade: facade.name,
              op: op.name,
              params: currentParams,
              result,
            });
          }
        }

        return result;
      };
    }
  }
}
```

**Step 5: Write the barrel export**

```ts
// packages/core/src/extensions/index.ts
export type { AgentExtensions, OpMiddleware, MiddlewareContext } from './types.js';
export { wrapWithMiddleware } from './middleware.js';
```

**Step 6: Add exports to `packages/core/src/index.ts`**

After the `// --- Facades` section (around line 252), add:

```ts
// --- Extensions ---------------------------------------------------------------
export type { AgentExtensions, OpMiddleware, MiddlewareContext } from './extensions/index.js';
export { wrapWithMiddleware } from './extensions/index.js';
```

**Step 7: Run the tests**

Run: `cd packages/core && npx vitest run src/__tests__/extensions.test.ts`
Expected: All 7 tests PASS

**Step 8: Commit**

```bash
git add packages/core/src/extensions/ packages/core/src/__tests__/extensions.test.ts packages/core/src/index.ts
git commit -m "feat(core): add AgentExtensions types and middleware utility"
```

---

## Task 2: Extensions Scaffold Template in `@soleri/forge`

**Files:**
- Create: `packages/forge/src/templates/extensions.ts`
- Modify: `packages/forge/src/scaffolder.ts` (add extensions dir + files to scaffold)
- Test: verify scaffold output includes extensions

**Step 1: Write the extensions template generator**

```ts
// packages/forge/src/templates/extensions.ts
import type { AgentConfig } from '../types.js';

/**
 * Generate the extensions manifest (src/extensions/index.ts).
 * This is the user's entry point for customization.
 */
export function generateExtensionsIndex(config: AgentConfig): string {
  return `/**
 * ${config.name} — Custom Extensions
 *
 * Add your custom ops, facades, middleware, and lifecycle hooks here.
 * This file is auto-discovered by the agent entry point at startup.
 *
 * Core ops from @soleri/core are never modified — your extensions are
 * additive (new ops, new facades) or decorative (middleware).
 *
 * See: https://soleri.dev/docs/extending
 */

import type { AgentExtensions, AgentRuntime } from '@soleri/core';

// Import your custom ops, facades, and middleware here:
// import { myCustomOp } from './ops/my-custom-op.js';
// import { myFacade } from './facades/my-facade.js';
// import { auditLogger } from './middleware/audit-logger.js';

export default function loadExtensions(runtime: AgentRuntime): AgentExtensions {
  return {
    // ── Custom ops (merged into ${config.id}_core facade) ──────────
    // ops: [
    //   myCustomOp(runtime),
    // ],

    // ── Custom facades (registered as separate MCP tools) ──────────
    // facades: [
    //   myFacade(runtime),
    // ],

    // ── Middleware (wraps ALL ops across ALL facades) ───────────────
    // middleware: [
    //   auditLogger,
    // ],

    // ── Lifecycle hooks ────────────────────────────────────────────
    // hooks: {
    //   onStartup: async (rt) => {
    //     console.error('[${config.id}] Custom startup logic');
    //   },
    //   onShutdown: async (rt) => {
    //     console.error('[${config.id}] Custom shutdown logic');
    //   },
    // },
  };
}
`;
}

/**
 * Generate an example custom op file.
 */
export function generateExampleOp(config: AgentConfig): string {
  return `/**
 * Example custom op — add your own logic here.
 *
 * Custom ops are merged into the ${config.id}_core facade alongside
 * the 200+ built-in ops from @soleri/core. They have full access
 * to the agent runtime (vault, brain, planner, etc.).
 */

import { z } from 'zod';
import type { OpDefinition, AgentRuntime } from '@soleri/core';

export function createExampleOp(runtime: AgentRuntime): OpDefinition {
  return {
    name: 'example',
    description: 'Example custom op — replace with your own logic.',
    auth: 'read',
    schema: z.object({
      message: z.string().optional().describe('Optional message'),
    }),
    handler: async (params) => {
      const stats = runtime.vault.stats();
      return {
        message: params.message ?? 'Hello from custom extension!',
        vaultEntries: stats.totalEntries,
      };
    },
  };
}
`;
}
```

**Step 2: Update scaffolder to create extensions directory**

In `packages/forge/src/scaffolder.ts`:

a) Add import at top (after line 25):
```ts
import { generateExtensionsIndex, generateExampleOp } from './templates/extensions.js';
```

b) Add `'src/extensions'`, `'src/extensions/ops'`, `'src/extensions/facades'`, `'src/extensions/middleware'` to the `dirs` array (after `'src/__tests__'`, around line 406).

c) Add extensions files to `sourceFiles` array (after the facades test entry, around line 451):
```ts
['src/extensions/index.ts', generateExtensionsIndex(config)],
['src/extensions/ops/example.ts', generateExampleOp(config)],
```

d) Add extensions to `previewScaffold` files array (before the `.mcp.json` entry, around line 72):
```ts
{
  path: 'src/extensions/',
  description: 'User extension directory — custom ops, facades, middleware, hooks',
},
```

**Step 3: Verify by running forge tests**

Run: `cd packages/forge && npx vitest run`
Expected: PASS (existing tests should still pass; scaffold output now includes extensions)

**Step 4: Commit**

```bash
git add packages/forge/src/templates/extensions.ts packages/forge/src/scaffolder.ts
git commit -m "feat(forge): scaffold extensions directory with example op"
```

---

## Task 3: Update Entry Point Template for Auto-Discovery

**Files:**
- Modify: `packages/forge/src/templates/entry-point.ts`
- Modify: `packages/forge/src/templates/test-facades.ts` (add extensions test block)

**Step 1: Update entry-point template**

In `packages/forge/src/templates/entry-point.ts`, make these changes to the generated code:

a) Add `wrapWithMiddleware` to the import from `@soleri/core` (line ~24):
```ts
import {
  createAgentRuntime,
  createCoreOps,
  createDomainFacades,
  registerAllFacades,
  seedDefaultPlaybooks,
  wrapWithMiddleware,
} from '@soleri/core';
import type { OpDefinition, AgentExtensions } from '@soleri/core';
```

b) After the domain facades creation (line ~211) and before the MCP server creation (line ~214), insert the extensions auto-discovery block:

```ts
  // --- User extensions (auto-discovered from src/extensions/) ------
  let extensions: AgentExtensions = {};
  try {
    const ext = await import('./extensions/index.js');
    const loader = ext.default ?? ext.loadExtensions;
    if (typeof loader === 'function') {
      extensions = loader(runtime);
    } else if (typeof loader === 'object') {
      extensions = loader;
    }
    if (extensions.ops?.length || extensions.facades?.length || extensions.middleware?.length) {
      console.error(\`[\${tag}] Extensions loaded: \${extensions.ops?.length ?? 0} ops, \${extensions.facades?.length ?? 0} facades, \${extensions.middleware?.length ?? 0} middleware\`);
    }
  } catch {
    // No extensions directory or load error — run vanilla
  }

  // Merge user ops into core facade
  if (extensions.ops?.length) {
    coreFacade.ops.push(...extensions.ops);
  }

  // Collect user facades
  const userFacades = extensions.facades ?? [];

  // Apply middleware to all facades
  const allFacades = [coreFacade, ...domainFacades, ...userFacades];
  if (extensions.middleware?.length) {
    wrapWithMiddleware(allFacades, extensions.middleware);
  }

  // Lifecycle: onStartup
  if (extensions.hooks?.onStartup) {
    await extensions.hooks.onStartup(runtime);
  }
```

c) Update the facades variable and registerAllFacades call (replace `const facades = [coreFacade, ...domainFacades];`):
```ts
  registerAllFacades(server, allFacades);

  console.error(\`[\${tag}] \${PERSONA.name} — \${PERSONA.role}\`);
  console.error(\`[\${tag}] Registered \${allFacades.length} facades with \${allFacades.reduce((sum, f) => sum + f.ops.length, 0)} operations\`);
```

d) Update the shutdown handler to call onShutdown:
```ts
  const shutdown = async (): Promise<void> => {
    console.error(\`[\${tag}] Shutting down...\`);
    if (extensions.hooks?.onShutdown) {
      try {
        await extensions.hooks.onShutdown(runtime);
      } catch (err) {
        console.error(\`[\${tag}] Extension shutdown error:\`, err);
      }
    }
    runtime.close();
    process.exit(0);
  };
```

**Step 2: Run forge tests**

Run: `cd packages/forge && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/forge/src/templates/entry-point.ts
git commit -m "feat(forge): auto-discover extensions in generated entry point"
```

---

## Task 4: CLI `extend` Command

**Files:**
- Create: `packages/cli/src/commands/extend.ts`
- Modify: `packages/cli/src/main.ts` (register command)

**Step 1: Write the extend command**

```ts
// packages/cli/src/commands/extend.ts
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectAgent } from '../utils/agent-context.js';

export function registerExtend(program: Command): void {
  const extend = program
    .command('extend')
    .description('Manage agent extensions — custom ops, facades, middleware');

  extend
    .command('init')
    .description('Initialize the extensions directory (if not already present)')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected. Run this from an agent root.');
        process.exit(1);
      }

      const extDir = join(ctx.agentPath, 'src', 'extensions');
      if (existsSync(join(extDir, 'index.ts'))) {
        p.log.info('Extensions directory already exists.');
        return;
      }

      const dirs = ['', 'ops', 'facades', 'middleware'];
      for (const d of dirs) {
        mkdirSync(join(extDir, d), { recursive: true });
      }

      // Lazy import forge template to avoid hard dep at CLI level
      const { generateExtensionsIndex, generateExampleOp } = await import(
        '@soleri/forge/templates/extensions'
      );
      const config = { id: ctx.agentId, name: ctx.agentId };
      writeFileSync(join(extDir, 'index.ts'), generateExtensionsIndex(config as any), 'utf-8');
      writeFileSync(join(extDir, 'ops', 'example.ts'), generateExampleOp(config as any), 'utf-8');

      p.log.success(`Extensions directory created at src/extensions/`);
      p.log.info('Edit src/extensions/index.ts to register your custom ops, facades, and middleware.');
    });

  extend
    .command('add-op')
    .argument('<name>', 'Operation name in snake_case (e.g., "summarize_pr")')
    .description('Scaffold a new custom op')
    .action(async (name: string) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected. Run this from an agent root.');
        process.exit(1);
      }

      const opsDir = join(ctx.agentPath, 'src', 'extensions', 'ops');
      mkdirSync(opsDir, { recursive: true });

      const fileName = name.replace(/_/g, '-');
      const filePath = join(opsDir, `${fileName}.ts`);

      if (existsSync(filePath)) {
        p.log.error(`File already exists: src/extensions/ops/${fileName}.ts`);
        process.exit(1);
      }

      const fnName = 'create' + name
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') + 'Op';

      const content = `import { z } from 'zod';
import type { OpDefinition, AgentRuntime } from '@soleri/core';

export function ${fnName}(runtime: AgentRuntime): OpDefinition {
  return {
    name: '${name}',
    description: 'TODO: describe what this op does',
    auth: 'read',
    schema: z.object({
      // TODO: define your parameters
    }),
    handler: async (params) => {
      // TODO: implement your logic
      // You have access to runtime.vault, runtime.brain, runtime.planner, etc.
      return { status: 'ok' };
    },
  };
}
`;

      writeFileSync(filePath, content, 'utf-8');
      p.log.success(`Created src/extensions/ops/${fileName}.ts`);
      p.log.info(`Import ${fnName} in src/extensions/index.ts and add it to the ops array.`);
    });

  extend
    .command('add-facade')
    .argument('<name>', 'Facade name in kebab-case (e.g., "github")')
    .description('Scaffold a new custom facade')
    .action(async (name: string) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected. Run this from an agent root.');
        process.exit(1);
      }

      const facadesDir = join(ctx.agentPath, 'src', 'extensions', 'facades');
      mkdirSync(facadesDir, { recursive: true });

      const filePath = join(facadesDir, `${name}.ts`);
      if (existsSync(filePath)) {
        p.log.error(`File already exists: src/extensions/facades/${name}.ts`);
        process.exit(1);
      }

      const facadeName = `${ctx.agentId}_${name.replace(/-/g, '_')}`;

      const content = `import { z } from 'zod';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

export function create${name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Facade(runtime: AgentRuntime): FacadeConfig {
  return {
    name: '${facadeName}',
    description: 'TODO: describe this facade',
    ops: [
      {
        name: 'status',
        description: 'TODO: describe this op',
        auth: 'read',
        schema: z.object({}),
        handler: async () => {
          return { status: 'ok' };
        },
      },
    ],
  };
}
`;

      writeFileSync(filePath, content, 'utf-8');
      p.log.success(`Created src/extensions/facades/${name}.ts`);
      p.log.info(`Import and add the facade to src/extensions/index.ts facades array.`);
      p.log.info(`This will register as MCP tool: ${facadeName}`);
    });

  extend
    .command('add-middleware')
    .argument('<name>', 'Middleware name in kebab-case (e.g., "audit-logger")')
    .description('Scaffold a new middleware')
    .action(async (name: string) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected. Run this from an agent root.');
        process.exit(1);
      }

      const mwDir = join(ctx.agentPath, 'src', 'extensions', 'middleware');
      mkdirSync(mwDir, { recursive: true });

      const filePath = join(mwDir, `${name}.ts`);
      if (existsSync(filePath)) {
        p.log.error(`File already exists: src/extensions/middleware/${name}.ts`);
        process.exit(1);
      }

      const varName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      const content = `import type { OpMiddleware } from '@soleri/core';

export const ${varName}: OpMiddleware = {
  name: '${name}',
  before: async (ctx) => {
    // Runs before every op. Return modified params or throw to reject.
    // console.error(\`[\${ctx.facade}.\${ctx.op}] called\`);
    return ctx.params;
  },
  after: async (ctx) => {
    // Runs after every op. Return modified result or throw.
    return ctx.result;
  },
};
`;

      writeFileSync(filePath, content, 'utf-8');
      p.log.success(`Created src/extensions/middleware/${name}.ts`);
      p.log.info(`Import and add to src/extensions/index.ts middleware array.`);
    });
}
```

**Step 2: Register in main.ts**

In `packages/cli/src/main.ts`, add:
```ts
import { registerExtend } from './commands/extend.js';
```
And before `program.parse()`:
```ts
registerExtend(program);
```

**Step 3: Verify CLI builds**

Run: `cd packages/cli && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/cli/src/commands/extend.ts packages/cli/src/main.ts
git commit -m "feat(cli): add extend command for scaffolding custom ops, facades, middleware"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `src/content/docs/docs/extending.md`

**Step 1: Rewrite the extending guide**

Replace the current quick-reference content with a comprehensive guide covering:

1. **Overview** — the three-layer model (core engine → agent shell → user extensions)
2. **Getting started** — `npx @soleri/cli extend init`
3. **Adding custom ops** — with full example
4. **Adding custom facades** — with full example
5. **Adding middleware** — with audit logger example
6. **Lifecycle hooks** — onStartup / onShutdown
7. **What NOT to edit** — src/index.ts, activation/, core ops
8. **Upgrading** — `npm update @soleri/core` safety guarantee
9. **Quick reference** — existing CLI commands (add-domain, install-knowledge, hooks, governance)

**Step 2: Commit**

```bash
git add src/content/docs/docs/extending.md
git commit -m "docs: comprehensive agent extensibility guide"
```

---

## Task 6: Integration Test — Scaffold + Extensions

**Files:**
- Create: `packages/forge/src/__tests__/extensions-scaffold.test.ts`

**Step 1: Write the integration test**

```ts
// packages/forge/src/__tests__/extensions-scaffold.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { scaffold } from '../scaffolder.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scaffold extensions', () => {
  const outputDir = join(tmpdir(), 'soleri-ext-test-' + Date.now());
  const agentId = 'ext-test-agent';
  const agentDir = join(outputDir, agentId);

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('should create extensions directory with index and example op', () => {
    const result = scaffold({
      id: agentId,
      name: 'Extension Test',
      role: 'Test agent',
      description: 'Agent for testing extensions scaffold',
      domains: ['testing'],
      principles: ['Test everything'],
      tone: 'pragmatic',
      outputDir,
    });

    // Extensions directory exists
    expect(existsSync(join(agentDir, 'src', 'extensions', 'index.ts'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'ops', 'example.ts'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'facades'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'middleware'))).toBe(true);

    // Extensions index references the agent ID
    const indexContent = readFileSync(join(agentDir, 'src', 'extensions', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('ext-test-agent_core');
    expect(indexContent).toContain('loadExtensions');
    expect(indexContent).toContain('AgentExtensions');

    // Entry point imports extensions
    const entryPoint = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
    expect(entryPoint).toContain('wrapWithMiddleware');
    expect(entryPoint).toContain('./extensions/index.js');
    expect(entryPoint).toContain('AgentExtensions');
  });

  it('should include extensions in preview', () => {
    const { previewScaffold } = require('../scaffolder.js');
    const preview = previewScaffold({
      id: agentId,
      name: 'Extension Test',
      role: 'Test agent',
      description: 'Agent for testing extensions scaffold',
      domains: ['testing'],
      principles: ['Test everything'],
      tone: 'pragmatic',
      outputDir,
    });

    const extFile = preview.files.find((f: any) => f.path === 'src/extensions/');
    expect(extFile).toBeDefined();
    expect(extFile.description).toContain('extension');
  });
});
```

**Step 2: Run**

Run: `cd packages/forge && npx vitest run src/__tests__/extensions-scaffold.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/forge/src/__tests__/extensions-scaffold.test.ts
git commit -m "test(forge): integration test for extensions scaffold"
```

---

## Task 7: Export Extensions Template from Forge

**Files:**
- Modify: `packages/forge/src/index.ts` or relevant barrel (check what's exported)
- Needed so CLI can `import { generateExtensionsIndex } from '@soleri/forge/templates/extensions'`

**Step 1: Check forge exports**

Read `packages/forge/src/index.ts` (or `package.json` exports field) and add:
```ts
export { generateExtensionsIndex, generateExampleOp } from './templates/extensions.js';
```

**Step 2: Commit**

```bash
git add packages/forge/src/index.ts
git commit -m "feat(forge): export extension template generators"
```

---

## Summary

| Task | Package | What | Commit Message |
|------|---------|------|----------------|
| 1 | `@soleri/core` | Extension types + middleware utility + tests | `feat(core): add AgentExtensions types and middleware utility` |
| 2 | `@soleri/forge` | Extensions scaffold template | `feat(forge): scaffold extensions directory with example op` |
| 3 | `@soleri/forge` | Entry point auto-discovery | `feat(forge): auto-discover extensions in generated entry point` |
| 4 | `@soleri/cli` | `extend` CLI command (init, add-op, add-facade, add-middleware) | `feat(cli): add extend command` |
| 5 | docs | Comprehensive extending guide | `docs: comprehensive agent extensibility guide` |
| 6 | `@soleri/forge` | Integration test | `test(forge): integration test for extensions scaffold` |
| 7 | `@soleri/forge` | Export template generators for CLI | `feat(forge): export extension template generators` |

**Dependency order:** Task 1 → Tasks 2+3 (parallel) → Task 7 → Task 4 → Tasks 5+6 (parallel)
