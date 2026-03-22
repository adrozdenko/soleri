import { describe, it, expect } from 'vitest';
import { wrapWithMiddleware } from './middleware.js';
import type { FacadeConfig } from '../facades/types.js';
import type { OpMiddleware } from './types.js';

/** Helper to build a minimal facade with one op. */
function makeFacade(handler: (p: Record<string, unknown>) => Promise<unknown>): FacadeConfig {
  return {
    name: 'test_facade',
    description: 'Test facade',
    ops: [
      {
        name: 'test_op',
        description: 'Test op',
        auth: 'read',
        handler,
      },
    ],
  };
}

describe('wrapWithMiddleware', () => {
  it('does nothing when middleware array is empty', async () => {
    const handler = async () => ({ ok: true });
    const facade = makeFacade(handler);
    const originalHandler = facade.ops[0].handler;

    wrapWithMiddleware([facade], []);

    // Handler reference should be unchanged (early return)
    expect(facade.ops[0].handler).toBe(originalHandler);
  });

  it('wraps all ops across multiple facades', async () => {
    const calls: string[] = [];

    const facade1: FacadeConfig = {
      name: 'f1',
      description: 'Facade 1',
      ops: [
        {
          name: 'op_a',
          description: 'A',
          auth: 'read',
          handler: async () => {
            calls.push('f1:op_a');
            return {};
          },
        },
        {
          name: 'op_b',
          description: 'B',
          auth: 'read',
          handler: async () => {
            calls.push('f1:op_b');
            return {};
          },
        },
      ],
    };

    const facade2: FacadeConfig = {
      name: 'f2',
      description: 'Facade 2',
      ops: [
        {
          name: 'op_c',
          description: 'C',
          auth: 'write',
          handler: async () => {
            calls.push('f2:op_c');
            return {};
          },
        },
      ],
    };

    const mw: OpMiddleware = {
      name: 'tracker',
      before: async (ctx) => {
        calls.push(`before:${ctx.facade}:${ctx.op}`);
        return ctx.params;
      },
    };

    wrapWithMiddleware([facade1, facade2], [mw]);

    await facade1.ops[0].handler({});
    await facade1.ops[1].handler({});
    await facade2.ops[0].handler({});

    expect(calls).toEqual([
      'before:f1:op_a',
      'f1:op_a',
      'before:f1:op_b',
      'f1:op_b',
      'before:f2:op_c',
      'f2:op_c',
    ]);
  });

  it('passes modified params from before through to handler', async () => {
    const facade = makeFacade(async (params) => params);

    const mw: OpMiddleware = {
      name: 'injector',
      before: async (ctx) => ({ ...ctx.params, added: 'value' }),
    };

    wrapWithMiddleware([facade], [mw]);

    const result = await facade.ops[0].handler({ original: true });
    expect(result).toEqual({ original: true, added: 'value' });
  });

  it('passes after middleware the result and allows transformation', async () => {
    const facade = makeFacade(async () => ({ count: 1 }));

    const mw: OpMiddleware = {
      name: 'doubler',
      after: async (ctx) => {
        const data = ctx.result as Record<string, number>;
        return { count: data.count * 2 };
      },
    };

    wrapWithMiddleware([facade], [mw]);

    const result = await facade.ops[0].handler({});
    expect(result).toEqual({ count: 2 });
  });

  it('propagates error from before middleware', async () => {
    const facade = makeFacade(async () => ({ ok: true }));

    const mw: OpMiddleware = {
      name: 'blocker',
      before: async () => {
        throw new Error('Access denied');
      },
    };

    wrapWithMiddleware([facade], [mw]);

    await expect(facade.ops[0].handler({})).rejects.toThrow('Access denied');
  });

  it('propagates error from after middleware', async () => {
    const facade = makeFacade(async () => ({ ok: true }));

    const mw: OpMiddleware = {
      name: 'post-validator',
      after: async () => {
        throw new Error('Post-validation failed');
      },
    };

    wrapWithMiddleware([facade], [mw]);

    await expect(facade.ops[0].handler({})).rejects.toThrow('Post-validation failed');
  });

  it('chains before (first->last) and after (last->first) in onion order', async () => {
    const order: string[] = [];
    const facade = makeFacade(async () => {
      order.push('handler');
      return {};
    });

    const mw1: OpMiddleware = {
      name: 'outer',
      before: async (ctx) => {
        order.push('outer:before');
        return ctx.params;
      },
      after: async (ctx) => {
        order.push('outer:after');
        return ctx.result;
      },
    };

    const mw2: OpMiddleware = {
      name: 'inner',
      before: async (ctx) => {
        order.push('inner:before');
        return ctx.params;
      },
      after: async (ctx) => {
        order.push('inner:after');
        return ctx.result;
      },
    };

    wrapWithMiddleware([facade], [mw1, mw2]);
    await facade.ops[0].handler({});

    expect(order).toEqual([
      'outer:before',
      'inner:before',
      'handler',
      'inner:after',
      'outer:after',
    ]);
  });

  it('provides facade and op names in middleware context', async () => {
    const captured: Array<{ facade: string; op: string }> = [];
    const facade: FacadeConfig = {
      name: 'my_facade',
      description: 'My facade',
      ops: [
        {
          name: 'my_op',
          description: 'My op',
          auth: 'read',
          handler: async () => ({}),
        },
      ],
    };

    const mw: OpMiddleware = {
      name: 'spy',
      before: async (ctx) => {
        captured.push({ facade: ctx.facade, op: ctx.op });
        return ctx.params;
      },
    };

    wrapWithMiddleware([facade], [mw]);
    await facade.ops[0].handler({});

    expect(captured).toEqual([{ facade: 'my_facade', op: 'my_op' }]);
  });
});
