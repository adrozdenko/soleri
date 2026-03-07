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

      const { generateExtensionsIndex, generateExampleOp } = await import('@soleri/forge/lib');
      const config = { id: ctx.agentId, name: ctx.agentId } as Parameters<
        typeof generateExtensionsIndex
      >[0];
      writeFileSync(join(extDir, 'index.ts'), generateExtensionsIndex(config), 'utf-8');
      writeFileSync(join(extDir, 'ops', 'example.ts'), generateExampleOp(config), 'utf-8');

      p.log.success('Extensions directory created at src/extensions/');
      p.log.info(
        'Edit src/extensions/index.ts to register your custom ops, facades, and middleware.',
      );
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

      const fnName =
        'create' +
        name
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('') +
        'Op';

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
      const className = name
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');

      const content = `import { z } from 'zod';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

export function create${className}Facade(runtime: AgentRuntime): FacadeConfig {
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
      p.log.info('Import and add to src/extensions/index.ts middleware array.');
    });
}
