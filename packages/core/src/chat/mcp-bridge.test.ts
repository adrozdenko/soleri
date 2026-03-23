/**
 * McpToolBridge — colocated tests.
 *
 * Covers: registration, allowlist filtering, execution, compression,
 * truncation, error handling, executor factory.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { McpToolBridge } from './mcp-bridge.js';
import type { McpToolRegistration } from './agent-loop-types.js';

function makeTool(name: string, result: unknown = 'ok'): McpToolRegistration {
  return {
    name,
    description: `Tool ${name}`,
    inputSchema: { type: 'object' },
    handler: async () => result,
  };
}

describe('McpToolBridge', () => {
  let bridge: McpToolBridge;

  beforeEach(() => {
    bridge = new McpToolBridge();
  });

  describe('registration', () => {
    test('register adds a tool', () => {
      bridge.register(makeTool('vault_search'));
      expect(bridge.has('vault_search')).toBe(true);
      expect(bridge.size).toBe(1);
    });

    test('registerAll adds multiple tools', () => {
      bridge.registerAll([makeTool('a'), makeTool('b'), makeTool('c')]);
      expect(bridge.size).toBe(3);
      expect(bridge.listTools().sort()).toEqual(['a', 'b', 'c']);
    });

    test('register overwrites existing tool', () => {
      bridge.register(makeTool('x', 'v1'));
      bridge.register(makeTool('x', 'v2'));
      expect(bridge.size).toBe(1);
    });

    test('clear removes all tools', () => {
      bridge.registerAll([makeTool('a'), makeTool('b')]);
      bridge.clear();
      expect(bridge.size).toBe(0);
      expect(bridge.has('a')).toBe(false);
    });
  });

  describe('allowlist', () => {
    test('only registers allowed tools', () => {
      const filtered = new McpToolBridge({ allowlist: ['allowed'] });
      filtered.register(makeTool('allowed'));
      filtered.register(makeTool('blocked'));
      expect(filtered.has('allowed')).toBe(true);
      expect(filtered.has('blocked')).toBe(false);
      expect(filtered.size).toBe(1);
    });

    test('registerAll respects allowlist', () => {
      const filtered = new McpToolBridge({ allowlist: ['a', 'c'] });
      filtered.registerAll([makeTool('a'), makeTool('b'), makeTool('c')]);
      expect(filtered.listTools().sort()).toEqual(['a', 'c']);
    });
  });

  describe('getTools', () => {
    test('returns AgentTool array', () => {
      bridge.register(makeTool('vault_search'));
      const tools = bridge.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('vault_search');
      expect(tools[0].description).toBe('Tool vault_search');
      expect(tools[0].inputSchema).toEqual({ type: 'object' });
    });

    test('returns empty array when no tools', () => {
      expect(bridge.getTools()).toEqual([]);
    });
  });

  describe('execute', () => {
    test('returns string output', async () => {
      bridge.register(makeTool('echo', 'hello world'));
      const result = await bridge.execute('echo', {});
      expect(result.output).toBe('hello world');
      expect(result.isError).toBe(false);
    });

    test('stringifies non-string results', async () => {
      bridge.register(makeTool('data', { key: 'value' }));
      const result = await bridge.execute('data', {});
      expect(result.output).toBe('{"key":"value"}');
      expect(result.isError).toBe(false);
    });

    test('returns error for unknown tool', async () => {
      const result = await bridge.execute('nonexistent', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Unknown tool');
    });

    test('catches handler errors', async () => {
      bridge.register({
        ...makeTool('broken'),
        handler: async () => {
          throw new Error('kaboom');
        },
      });
      const result = await bridge.execute('broken', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('kaboom');
    });

    test('passes input to handler', async () => {
      let received: Record<string, unknown> = {};
      bridge.register({
        ...makeTool('capture'),
        handler: async (input) => {
          received = input;
          return 'ok';
        },
      });
      await bridge.execute('capture', { foo: 'bar' });
      expect(received).toEqual({ foo: 'bar' });
    });

    test('truncates output exceeding maxOutput', async () => {
      const small = new McpToolBridge({ maxOutput: 50 });
      small.register(makeTool('verbose', 'x'.repeat(200)));
      const result = await small.execute('verbose', {});
      expect(result.output.length).toBeLessThanOrEqual(100); // 50 + truncation notice
      expect(result.output).toContain('truncated');
    });
  });

  describe('compressor', () => {
    test('applies compressor to output', async () => {
      const compressing = new McpToolBridge({
        compressor: (_name, output, _max) => output.toUpperCase(),
      });
      compressing.register(makeTool('echo', 'hello'));
      const result = await compressing.execute('echo', {});
      expect(result.output).toBe('HELLO');
    });

    test('truncates after compression if still too long', async () => {
      const compressing = new McpToolBridge({
        compressor: (_name, output) => output, // no-op compressor
        maxOutput: 20,
      });
      compressing.register(makeTool('big', 'x'.repeat(100)));
      const result = await compressing.execute('big', {});
      expect(result.output).toContain('truncated');
    });
  });

  describe('createExecutor', () => {
    test('returns a function that delegates to execute', async () => {
      bridge.register(makeTool('ping', 'pong'));
      const executor = bridge.createExecutor();
      const result = await executor('ping', {});
      expect(result.output).toBe('pong');
      expect(result.isError).toBe(false);
    });

    test('executor handles unknown tool', async () => {
      const executor = bridge.createExecutor();
      const result = await executor('missing', {});
      expect(result.isError).toBe(true);
    });
  });
});
