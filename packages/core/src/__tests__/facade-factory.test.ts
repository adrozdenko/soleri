import { describe, it, expect } from 'vitest';
import type { FacadeConfig, AuthPolicy } from '../facades/types.js';

// Import the internal dispatchOp via registerFacade — we test through the public API
// by creating a mock McpServer that captures the registered handler.
import { registerFacade } from '../facades/facade-factory.js';

function createTestFacade(): FacadeConfig {
  return {
    name: 'test_facade',
    description: 'Test facade',
    ops: [
      {
        name: 'read_op',
        description: 'A read operation',
        auth: 'read',
        handler: async () => ({ status: 'ok' }),
      },
      {
        name: 'write_op',
        description: 'A write operation',
        auth: 'write',
        handler: async () => ({ written: true }),
      },
      {
        name: 'admin_op',
        description: 'An admin operation',
        auth: 'admin',
        handler: async () => ({ admin: true }),
      },
    ],
  };
}

// Capture the handler registered with McpServer
function captureHandler(
  facade: FacadeConfig,
  authPolicy?: () => AuthPolicy,
): (args: { op: string; params: Record<string, unknown> }) => Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  let captured:
    | ((args: { op: string; params: Record<string, unknown> }) => Promise<{
        content: Array<{ type: string; text: string }>;
      }>)
    | null = null;
  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade, authPolicy);
  return captured!;
}

async function callOp(
  handler: ReturnType<typeof captureHandler>,
  op: string,
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const result = await handler({ op, params: {} });
  return JSON.parse(result.content[0].text);
}

describe('facade-factory auth enforcement', () => {
  it('permissive mode allows all ops regardless of caller level', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'permissive',
      callerLevel: 'read',
    }));

    const read = await callOp(handler, 'read_op');
    const write = await callOp(handler, 'write_op');
    const admin = await callOp(handler, 'admin_op');

    expect(read.success).toBe(true);
    expect(write.success).toBe(true);
    expect(admin.success).toBe(true);
  });

  it('enforce mode blocks ops above caller level', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'read',
    }));

    const read = await callOp(handler, 'read_op');
    const write = await callOp(handler, 'write_op');
    const admin = await callOp(handler, 'admin_op');

    expect(read.success).toBe(true);
    expect(write.success).toBe(false);
    expect(write.error).toContain('requires write');
    expect(admin.success).toBe(false);
    expect(admin.error).toContain('requires admin');
  });

  it('enforce mode allows write caller to execute read and write ops', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'write',
    }));

    const read = await callOp(handler, 'read_op');
    const write = await callOp(handler, 'write_op');
    const admin = await callOp(handler, 'admin_op');

    expect(read.success).toBe(true);
    expect(write.success).toBe(true);
    expect(admin.success).toBe(false);
  });

  it('enforce mode allows admin caller to execute all ops', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'admin',
    }));

    expect((await callOp(handler, 'read_op')).success).toBe(true);
    expect((await callOp(handler, 'write_op')).success).toBe(true);
    expect((await callOp(handler, 'admin_op')).success).toBe(true);
  });

  it('warn mode allows ops but logs warning', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'warn',
      callerLevel: 'read',
    }));

    // Warn mode allows execution even for higher auth levels
    const write = await callOp(handler, 'write_op');
    expect(write.success).toBe(true);
  });

  it('no auth policy defaults to permissive', async () => {
    const handler = captureHandler(createTestFacade());

    const admin = await callOp(handler, 'admin_op');
    expect(admin.success).toBe(true);
  });

  it('per-op overrides take precedence', async () => {
    const handler = captureHandler(createTestFacade(), () => ({
      mode: 'enforce',
      callerLevel: 'write',
      overrides: { read_op: 'admin' }, // escalate read_op to admin
    }));

    // read_op normally requires 'read' but override says 'admin'
    const read = await callOp(handler, 'read_op');
    expect(read.success).toBe(false);
    expect(read.error).toContain('requires admin');

    // write_op still works at write level
    const write = await callOp(handler, 'write_op');
    expect(write.success).toBe(true);
  });

  it('auth policy getter is called per dispatch (mutable)', async () => {
    let mode: AuthPolicy['mode'] = 'permissive';
    const handler = captureHandler(createTestFacade(), () => ({
      mode,
      callerLevel: 'read',
    }));

    // Permissive — write op works
    expect((await callOp(handler, 'write_op')).success).toBe(true);

    // Switch to enforce at runtime
    mode = 'enforce';
    expect((await callOp(handler, 'write_op')).success).toBe(false);
  });
});
