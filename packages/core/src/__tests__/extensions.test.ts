import { describe, it, expect } from 'vitest';
import { wrapWithMiddleware } from '../extensions/middleware.js';
import type { FacadeConfig } from '../facades/types.js';
import type { OpMiddleware, AgentExtensions } from '../extensions/types.js';

describe('extensions', () => {
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
        before: async (ctx) => {
          order.push('first:before');
          return ctx.params;
        },
        after: async (ctx) => {
          order.push('first:after');
          return ctx.result;
        },
      };
      const mw2: OpMiddleware = {
        name: 'second',
        before: async (ctx) => {
          order.push('second:before');
          return ctx.params;
        },
        after: async (ctx) => {
          order.push('second:after');
          return ctx.result;
        },
      };

      wrapWithMiddleware([facade], [mw1, mw2]);
      await facade.ops[0].handler({});

      expect(order).toEqual([
        'first:before',
        'second:before',
        'handler',
        'second:after',
        'first:after',
      ]);
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
        before: async () => {
          throw new Error('Blocked by policy');
        },
      };

      wrapWithMiddleware([facade], [mw]);
      await expect(facade.ops[0].handler({})).rejects.toThrow('Blocked by policy');
    });
  });
});
