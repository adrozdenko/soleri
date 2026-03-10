/**
 * MCP Tool Bridge — intercepts MCP tool registrations and executes locally.
 *
 * Ported from Salvador's mcp-bridge.ts with improvements:
 * - Simpler API (no Zod dependency — accepts JSON Schema directly)
 * - Optional allowlist for tool filtering
 * - Generic output compression hook
 *
 * Used by Telegram (and other chat transports) to bridge the agent's MCP tools
 * into the agent loop without network round-trips.
 */

import type {
  AgentTool,
  ToolResult,
  McpToolRegistration,
  OutputCompressor,
} from './agent-loop-types.js';

const DEFAULT_MAX_OUTPUT = 10_000; // 10KB

export class McpToolBridge {
  private tools = new Map<string, McpToolRegistration>();
  private allowlist: Set<string> | null;
  private compressor: OutputCompressor | null;
  private maxOutput: number;

  constructor(options?: {
    allowlist?: string[];
    compressor?: OutputCompressor;
    maxOutput?: number;
  }) {
    this.allowlist = options?.allowlist ? new Set(options.allowlist) : null;
    this.compressor = options?.compressor ?? null;
    this.maxOutput = options?.maxOutput ?? DEFAULT_MAX_OUTPUT;
  }

  /**
   * Register a tool. If an allowlist is set, only allowed tools are registered.
   */
  register(tool: McpToolRegistration): void {
    if (this.allowlist && !this.allowlist.has(tool.name)) return;
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: McpToolRegistration[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get registered tools as AgentTool array (for the agent loop).
   */
  getTools(): AgentTool[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Execute a tool by name.
   */
  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        output: `Unknown tool: ${name}`,
        isError: true,
      };
    }

    try {
      const rawResult = await tool.handler(input);
      let output = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);

      // Apply compression if available
      if (this.compressor) {
        output = this.compressor(name, output, this.maxOutput);
      }

      // Truncate if still too long
      if (output.length > this.maxOutput) {
        output = output.slice(0, this.maxOutput) + `\n... (truncated at ${this.maxOutput} chars)`;
      }

      return { output, isError: false };
    } catch (error) {
      return {
        output: `Tool error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  /**
   * Create a ToolExecutor function for use with the agent loop.
   */
  createExecutor(): (name: string, input: Record<string, unknown>) => Promise<ToolResult> {
    return (name, input) => this.execute(name, input);
  }

  /**
   * Number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * List registered tool names.
   */
  listTools(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Clear all registered tools.
   */
  clear(): void {
    this.tools.clear();
  }
}
