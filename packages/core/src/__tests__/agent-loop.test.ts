/**
 * Agent Loop Tests — MCP bridge, output compressor, message sanitization.
 *
 * Note: The actual agent loop (runAgentLoop) requires a live Anthropic API key,
 * so we test the surrounding infrastructure in isolation.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { McpToolBridge } from '../chat/mcp-bridge.js';
import {
  createOutputCompressor,
  registerCompressor,
  clearCompressors,
} from '../chat/output-compressor.js';
import type { McpToolRegistration } from '../chat/agent-loop-types.js';

// ─── MCP Tool Bridge ────────────────────────────────────────────────

describe('McpToolBridge', () => {
  let bridge: McpToolBridge;

  beforeEach(() => {
    bridge = new McpToolBridge();
  });

  describe('registration', () => {
    test('registers a tool', () => {
      bridge.register(makeTool('test_tool'));
      expect(bridge.has('test_tool')).toBe(true);
      expect(bridge.size).toBe(1);
    });

    test('registerAll registers multiple tools', () => {
      bridge.registerAll([makeTool('tool_a'), makeTool('tool_b'), makeTool('tool_c')]);
      expect(bridge.size).toBe(3);
    });

    test('listTools returns names', () => {
      bridge.registerAll([makeTool('alpha'), makeTool('beta')]);
      const names = bridge.listTools();
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
    });

    test('getTools returns AgentTool format', () => {
      bridge.register(makeTool('my_tool'));
      const tools = bridge.getTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('my_tool');
      expect(tools[0].description).toBeDefined();
      expect(tools[0].inputSchema).toBeDefined();
    });

    test('clear removes all tools', () => {
      bridge.registerAll([makeTool('a'), makeTool('b')]);
      bridge.clear();
      expect(bridge.size).toBe(0);
    });
  });

  describe('allowlist', () => {
    test('filters tools by allowlist', () => {
      const filtered = new McpToolBridge({ allowlist: ['allowed_tool'] });
      filtered.register(makeTool('allowed_tool'));
      filtered.register(makeTool('blocked_tool'));
      expect(filtered.size).toBe(1);
      expect(filtered.has('allowed_tool')).toBe(true);
      expect(filtered.has('blocked_tool')).toBe(false);
    });

    test('no allowlist allows all', () => {
      bridge.register(makeTool('any_tool'));
      expect(bridge.has('any_tool')).toBe(true);
    });
  });

  describe('execution', () => {
    test('executes a registered tool', async () => {
      bridge.register({
        name: 'greet',
        description: 'Greet someone',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
        handler: async (input) => ({ message: `Hello, ${input.name}!` }),
      });

      const result = await bridge.execute('greet', { name: 'World' });
      expect(result.isError).toBe(false);
      expect(result.output).toContain('Hello, World!');
    });

    test('returns error for unknown tool', async () => {
      const result = await bridge.execute('nonexistent', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Unknown tool');
    });

    test('handles tool execution errors', async () => {
      bridge.register({
        name: 'failing',
        description: 'Always fails',
        inputSchema: { type: 'object' },
        handler: async () => {
          throw new Error('Intentional failure');
        },
      });

      const result = await bridge.execute('failing', {});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Intentional failure');
    });

    test('truncates long output', async () => {
      const longBridge = new McpToolBridge({ maxOutput: 100 });
      longBridge.register({
        name: 'verbose',
        description: 'Returns long output',
        inputSchema: { type: 'object' },
        handler: async () => 'x'.repeat(500),
      });

      const result = await longBridge.execute('verbose', {});
      expect(result.output.length).toBeLessThanOrEqual(150); // 100 + truncation message
    });

    test('createExecutor returns function', async () => {
      bridge.register({
        name: 'echo',
        description: 'Echo input',
        inputSchema: { type: 'object' },
        handler: async (input) => input,
      });

      const executor = bridge.createExecutor();
      const result = await executor('echo', { msg: 'hi' });
      expect(result.isError).toBe(false);
      expect(result.output).toContain('hi');
    });
  });

  describe('with compressor', () => {
    test('applies compressor to output', async () => {
      const compressor = createOutputCompressor({ maxLength: 50 });
      const compBridge = new McpToolBridge({ compressor });
      compBridge.register({
        name: 'big_json',
        description: 'Returns big JSON',
        inputSchema: { type: 'object' },
        handler: async () => ({ data: Array.from({ length: 20 }, (_, i) => `item-${i}`) }),
      });

      const result = await compBridge.execute('big_json', {});
      // Compressor truncates arrays and strings; output should be shorter than raw JSON
      expect(result.output.length).toBeLessThanOrEqual(200);
    });
  });
});

// ─── Output Compressor ──────────────────────────────────────────────

describe('Output Compressor', () => {
  beforeEach(() => {
    clearCompressors();
  });

  test('short output passes through', () => {
    const compressor = createOutputCompressor();
    const result = compressor('tool', 'short text');
    expect(result).toBe('short text');
  });

  test('long text gets truncated', () => {
    const compressor = createOutputCompressor({ maxLength: 50 });
    const result = compressor('tool', 'x'.repeat(200));
    expect(result.length).toBeLessThanOrEqual(70); // 50 + truncation message
    expect(result).toContain('truncated');
  });

  test('JSON arrays get compressed', () => {
    const compressor = createOutputCompressor({ maxLength: 200, maxArrayItems: 3 });
    const bigJson = JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => `item-${i}`) });
    const result = compressor('tool', bigJson);
    expect(result).toContain('item-0');
    expect(result).toContain('+17 more');
  });

  test('JSON strings get truncated when output exceeds max', () => {
    // maxLength must be less than the input so compression kicks in
    const compressor = createOutputCompressor({ maxStringLength: 20, maxLength: 50 });
    const json = JSON.stringify({ content: 'x'.repeat(100) });
    const result = compressor('tool', json);
    // The compressed output should be shorter than the original
    expect(result.length).toBeLessThan(json.length);
  });

  test('registered compressor takes priority', () => {
    registerCompressor('special_tool', (output) => `COMPRESSED: ${output.length} chars`);
    const compressor = createOutputCompressor();
    const result = compressor('special_tool', 'x'.repeat(5000));
    expect(result).toBe('COMPRESSED: 5000 chars');
  });

  test('prefix matching works', () => {
    registerCompressor('vault_', (_output) => 'vault compressed');
    const compressor = createOutputCompressor();
    expect(compressor('vault_search', 'data')).toBe('vault compressed');
    expect(compressor('vault_list', 'data')).toBe('vault compressed');
  });

  test('clearCompressors removes all', () => {
    registerCompressor('test', () => 'custom');
    clearCompressors();
    const compressor = createOutputCompressor();
    const result = compressor('test', 'short');
    expect(result).toBe('short'); // Falls through to default
  });

  test('handles non-JSON gracefully', () => {
    const compressor = createOutputCompressor({ maxLength: 20 });
    const result = compressor('tool', 'not { valid json }'.repeat(10));
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toContain('truncated');
  });

  test('preserves numbers and booleans', () => {
    const compressor = createOutputCompressor();
    const json = JSON.stringify({ count: 42, active: true, name: 'test' });
    const result = compressor('tool', json);
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(42);
    expect(parsed.active).toBe(true);
  });

  test('handles nested objects when compression triggers', () => {
    // maxLength must be small enough to trigger JSON compression
    const compressor = createOutputCompressor({ maxArrayItems: 2, maxLength: 30 });
    const json = JSON.stringify({
      outer: {
        inner: { items: [1, 2, 3, 4, 5] },
      },
    });
    const result = compressor('tool', json);
    // Output should be truncated/compressed
    expect(result.length).toBeLessThanOrEqual(60); // 30 + truncation message
  });
});

// ─── Helpers ────────────────────────────────────────────────────────

function makeTool(name: string): McpToolRegistration {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    handler: async (input) => ({ name, input }),
  };
}
