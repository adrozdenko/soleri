import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { FacadeConfig, AuthPolicy } from './types.js';
import { registerFacade, registerAllFacades } from './facade-factory.js';

// =============================================================================
// HELPERS
// =============================================================================

function createFacade(overrides?: Partial<FacadeConfig>): FacadeConfig {
  return {
    name: 'test_facade',
    description: 'Test facade',
    ops: [
      {
        name: 'read_op',
        description: 'Read',
        auth: 'read',
        handler: async () => ({ result: 'read' }),
      },
      {
        name: 'write_op',
        description: 'Write',
        auth: 'write',
        handler: async () => ({ result: 'write' }),
      },
      {
        name: 'admin_op',
        description: 'Admin',
        auth: 'admin',
        handler: async () => ({ result: 'admin' }),
      },
    ],
    ...overrides,
  };
}

type DispatchHandler = (args: { op: string; params: Record<string, unknown> }) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

function captureHandler(facade: FacadeConfig, authPolicy?: () => AuthPolicy): DispatchHandler {
  let captured: DispatchHandler | null = null;
  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as DispatchHandler;
    },
  };
  registerFacade(mockServer as never, facade, authPolicy);
  return captured!;
}

async function callOp(
  handler: DispatchHandler,
  op: string,
  params: Record<string, unknown> = {},
): Promise<{ success: boolean; error?: string; data?: unknown; op?: string; facade?: string }> {
  const result = await handler({ op, params });
  return JSON.parse(result.content[0].text);
}

// =============================================================================
// dispatchOp — op routing
// =============================================================================

describe('facade-factory dispatchOp — colocated', () => {
  it('returns error for unknown operation', async () => {
    const handler = captureHandler(createFacade());
    const result = await callOp(handler, 'nonexistent_op');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown operation');
    expect(result.error).toContain('nonexistent_op');
    expect(result.error).toContain('read_op');
    expect(result.op).toBe('nonexistent_op');
    expect(result.facade).toBe('test_facade');
  });

  it('dispatches to correct op handler and returns data', async () => {
    const handler = captureHandler(createFacade());

    const read = await callOp(handler, 'read_op');
    expect(read.success).toBe(true);
    expect(read.data).toEqual({ result: 'read' });
    expect(read.op).toBe('read_op');
    expect(read.facade).toBe('test_facade');
  });

  it('catches handler exceptions and returns error response', async () => {
    const facade = createFacade({
      ops: [
        {
          name: 'failing_op',
          description: 'Fails',
          auth: 'read',
          handler: async () => {
            throw new Error('Handler exploded');
          },
        },
      ],
    });
    const handler = captureHandler(facade);

    const result = await callOp(handler, 'failing_op');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Handler exploded');
  });

  it('catches non-Error throws and converts to string', async () => {
    const facade = createFacade({
      ops: [
        {
          name: 'string_throw',
          description: 'Throws string',
          auth: 'read',
          handler: async () => {
            throw 'raw string error';
          },
        },
      ],
    });
    const handler = captureHandler(facade);

    const result = await callOp(handler, 'string_throw');

    expect(result.success).toBe(false);
    expect(result.error).toBe('raw string error');
  });
});

// =============================================================================
// Schema validation
// =============================================================================

describe('facade-factory schema validation — colocated', () => {
  it('validates params against op schema and rejects invalid', async () => {
    const facade = createFacade({
      ops: [
        {
          name: 'validated_op',
          description: 'Has schema',
          auth: 'read',
          schema: z.object({ query: z.string(), limit: z.number() }),
          handler: async (params) => ({ echo: params }),
        },
      ],
    });
    const handler = captureHandler(facade);

    const result = await callOp(handler, 'validated_op', { query: 123 as unknown as string });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid params');
  });

  it('passes validated params to handler', async () => {
    const facade = createFacade({
      ops: [
        {
          name: 'validated_op',
          description: 'Has schema',
          auth: 'read',
          schema: z.object({ query: z.string(), limit: z.number().optional() }),
          handler: async (params) => ({ echo: params }),
        },
      ],
    });
    const handler = captureHandler(facade);

    const result = await callOp(handler, 'validated_op', { query: 'test' });

    expect(result.success).toBe(true);
    expect((result.data as { echo: unknown }).echo).toEqual({ query: 'test' });
  });

  it('passes raw params when no schema defined', async () => {
    const facade = createFacade({
      ops: [
        {
          name: 'no_schema',
          description: 'No schema',
          auth: 'read',
          handler: async (params) => ({ echo: params }),
        },
      ],
    });
    const handler = captureHandler(facade);

    const result = await callOp(handler, 'no_schema', { anything: 'goes' });

    expect(result.success).toBe(true);
    expect((result.data as { echo: unknown }).echo).toEqual({ anything: 'goes' });
  });
});

// =============================================================================
// Auth enforcement
// =============================================================================

describe('facade-factory auth — colocated', () => {
  it('permissive mode allows all ops', async () => {
    const handler = captureHandler(createFacade(), () => ({
      mode: 'permissive',
      callerLevel: 'read',
    }));

    expect((await callOp(handler, 'admin_op')).success).toBe(true);
  });

  it('enforce mode blocks higher-level ops', async () => {
    const handler = captureHandler(createFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'read',
    }));

    expect((await callOp(handler, 'read_op')).success).toBe(true);
    expect((await callOp(handler, 'write_op')).success).toBe(false);
    expect((await callOp(handler, 'admin_op')).success).toBe(false);
  });

  it('warn mode allows ops (does not block)', async () => {
    const handler = captureHandler(createFacade(), () => ({
      mode: 'warn',
      callerLevel: 'read',
    }));

    expect((await callOp(handler, 'write_op')).success).toBe(true);
    expect((await callOp(handler, 'admin_op')).success).toBe(true);
  });

  it('no auth policy defaults to permissive', async () => {
    const handler = captureHandler(createFacade());
    expect((await callOp(handler, 'admin_op')).success).toBe(true);
  });

  it('per-op overrides take precedence over op auth level', async () => {
    const handler = captureHandler(createFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'write',
      overrides: { read_op: 'admin' },
    }));

    // read_op overridden to admin — blocked for write caller
    expect((await callOp(handler, 'read_op')).success).toBe(false);
    // write_op unchanged — allowed
    expect((await callOp(handler, 'write_op')).success).toBe(true);
  });

  it('auth policy is evaluated per dispatch (mutable at runtime)', async () => {
    let mode: AuthPolicy['mode'] = 'permissive';
    const handler = captureHandler(createFacade(), () => ({
      mode,
      callerLevel: 'read',
    }));

    expect((await callOp(handler, 'write_op')).success).toBe(true);

    mode = 'enforce';
    expect((await callOp(handler, 'write_op')).success).toBe(false);
  });
});

// =============================================================================
// registerAllFacades + hot ops
// =============================================================================

describe('registerAllFacades — colocated', () => {
  it('registers all facades on the server', () => {
    const registered: string[] = [];
    const mockServer = {
      tool: (name: string) => {
        registered.push(name);
      },
    };

    registerAllFacades(mockServer as never, [
      createFacade({ name: 'facade_a' }),
      createFacade({ name: 'facade_b' }),
    ]);

    expect(registered).toContain('facade_a');
    expect(registered).toContain('facade_b');
  });

  it('accepts legacy function auth policy', () => {
    const registered: string[] = [];
    const mockServer = {
      tool: (name: string) => {
        registered.push(name);
      },
    };

    registerAllFacades(mockServer as never, [createFacade()], () => ({
      mode: 'permissive' as const,
      callerLevel: 'read' as const,
    }));

    expect(registered).toContain('test_facade');
  });

  it('promotes hot ops to standalone tools with agentId prefix', () => {
    const registered: string[] = [];
    const mockServer = {
      tool: (name: string) => {
        registered.push(name);
      },
    };

    const facade = createFacade({
      ops: [
        {
          name: 'search',
          description: 'Search',
          auth: 'read',
          hot: true,
          handler: async () => ({}),
        },
        { name: 'delete', description: 'Delete', auth: 'admin', handler: async () => ({}) },
      ],
    });

    registerAllFacades(mockServer as never, [facade], { agentId: 'myagent' });

    expect(registered).toContain('test_facade');
    expect(registered).toContain('myagent_search');
    expect(registered).not.toContain('myagent_delete');
  });

  it('promotes ops listed in hotOps option', () => {
    const registered: string[] = [];
    const mockServer = {
      tool: (name: string) => {
        registered.push(name);
      },
    };

    registerAllFacades(mockServer as never, [createFacade()], {
      agentId: 'agent',
      hotOps: ['write_op'],
    });

    expect(registered).toContain('agent_write_op');
    expect(registered).not.toContain('agent_read_op');
  });

  it('does not promote hot ops without agentId', () => {
    const registered: string[] = [];
    const mockServer = {
      tool: (name: string) => {
        registered.push(name);
      },
    };

    const facade = createFacade({
      ops: [
        {
          name: 'search',
          description: 'Search',
          auth: 'read',
          hot: true,
          handler: async () => ({}),
        },
      ],
    });

    registerAllFacades(mockServer as never, [facade]);

    expect(registered).toEqual(['test_facade']);
  });

  it('hot op handler executes correctly', async () => {
    let capturedHandler: ((params: unknown) => Promise<unknown>) | null = null;
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => {
        if (name === 'agent_search') {
          capturedHandler = handler as typeof capturedHandler;
        }
      },
    };

    const facade = createFacade({
      ops: [
        {
          name: 'search',
          description: 'Search',
          auth: 'read',
          hot: true,
          schema: z.object({ query: z.string() }),
          handler: async (params) => ({ results: [], query: (params as { query: string }).query }),
        },
      ],
    });

    registerAllFacades(mockServer as never, [facade], { agentId: 'agent' });

    expect(capturedHandler).not.toBeNull();
    const result = (await capturedHandler!({ query: 'hello' })) as {
      content: Array<{ text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.data.query).toBe('hello');
  });

  it('hot op handler catches errors gracefully', async () => {
    let capturedHandler: ((params: unknown) => Promise<unknown>) | null = null;
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => {
        if (name === 'agent_boom') {
          capturedHandler = handler as typeof capturedHandler;
        }
      },
    };

    const facade = createFacade({
      ops: [
        {
          name: 'boom',
          description: 'Explodes',
          auth: 'read',
          hot: true,
          handler: async () => {
            throw new Error('Kaboom');
          },
        },
      ],
    });

    registerAllFacades(mockServer as never, [facade], { agentId: 'agent' });

    const result = (await capturedHandler!({})) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Kaboom');
  });

  it('hot op respects auth policy enforcement', async () => {
    let capturedHandler: ((params: unknown) => Promise<unknown>) | null = null;
    const mockServer = {
      tool: (name: string, _desc: string, _schema: unknown, handler: unknown) => {
        if (name === 'agent_admin_op') {
          capturedHandler = handler as typeof capturedHandler;
        }
      },
    };

    const facade = createFacade({
      ops: [
        {
          name: 'admin_op',
          description: 'Admin',
          auth: 'admin',
          hot: true,
          handler: async () => ({ ok: true }),
        },
      ],
    });

    registerAllFacades(mockServer as never, [facade], {
      agentId: 'agent',
      authPolicy: () => ({ mode: 'enforce', callerLevel: 'read' }),
    });

    const result = (await capturedHandler!({})) as { content: Array<{ text: string }> };
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('requires admin');
  });
});
