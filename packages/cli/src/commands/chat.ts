/**
 * `soleri chat` — interactive terminal chat with your agent.
 *
 * Spawns the agent's MCP server, connects via stdio JSON-RPC,
 * and runs an interactive REPL using the agent loop.
 *
 * No external dependencies — MCP client is a minimal JSON-RPC/stdio
 * implementation, Anthropic API is called via the core agent loop.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';
import { runAgentLoop, SOLERI_HOME } from '@soleri/core';
import type { AgentTool, ChatMessage } from '@soleri/core';

// ─── MCP Types ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
}

// ─── Minimal MCP Stdio Client ───────────────────────────────────────────

class StdioMcpClient {
  private proc: ChildProcess;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;
  private buffer = '';

  constructor(command: string, args: string[], env?: Record<string, string>) {
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as JsonRpcResponse;
          if ('id' in msg && msg.id !== null && msg.id !== undefined) {
            const handler = this.pending.get(msg.id);
            if (handler) {
              this.pending.delete(msg.id);
              if (msg.error) {
                handler.reject(new Error(msg.error.message));
              } else {
                handler.resolve(msg.result);
              }
            }
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    this.proc.on('exit', () => {
      for (const handler of this.pending.values()) {
        handler.reject(new Error('MCP server exited'));
      }
      this.pending.clear();
    });
  }

  private send(msg: JsonRpcRequest | JsonRpcNotification): void {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  private request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params: params ?? {} });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'soleri-chat', version: '0.0.1' },
    });
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  async listTools(): Promise<McpToolSchema[]> {
    const result = (await this.request('tools/list', {})) as { tools?: McpToolSchema[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request('tools/call', {
      name,
      arguments: args,
    })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };

    if (!result?.content) return '';
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
  }

  kill(): void {
    try {
      this.proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

// ─── Helper: Find Agent MCP Command ─────────────────────────────────────

interface McpCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

function findMcpCommand(agentId: string): McpCommand | null {
  const claudeConfigPath = join(homedir(), '.claude.json');
  if (!existsSync(claudeConfigPath)) return null;

  try {
    const config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8')) as {
      mcpServers?: Record<
        string,
        { command?: string; args?: string[]; env?: Record<string, string> }
      >;
    };
    const servers = config.mcpServers ?? {};
    for (const [key, srv] of Object.entries(servers)) {
      if (key === agentId || key.includes(agentId)) {
        if (srv.command) {
          return { command: srv.command, args: srv.args ?? [], env: srv.env };
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Fallback: try local dist/agent.js
  return null;
}

// ─── Main Command ────────────────────────────────────────────────────────

export function registerChat(program: Command): void {
  program
    .command('chat')
    .option('--model <model>', 'Claude model to use', 'claude-sonnet-4-20250514')
    .option('--no-tools', 'Disable MCP tools (plain conversation)')
    .description('Start an interactive chat session with your agent')
    .action(async (opts: { model: string; tools: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
      }

      // ─── API Key ─────────────────────────────────────────────────
      const apiKey =
        process.env.ANTHROPIC_API_KEY ??
        (() => {
          try {
            const keysPath = join(SOLERI_HOME, ctx.agentId, 'keys.json');
            if (existsSync(keysPath)) {
              const data = JSON.parse(readFileSync(keysPath, 'utf-8')) as {
                anthropic?: string[];
              };
              return data.anthropic?.[0] ?? null;
            }
          } catch {
            /* ignore */
          }
          return null;
        })();

      if (!apiKey) {
        p.log.error(
          'ANTHROPIC_API_KEY is not set. Export it or add it to ' +
            join(SOLERI_HOME, ctx.agentId, 'keys.json'),
        );
        process.exit(1);
      }

      // ─── System Prompt ────────────────────────────────────────────
      const claudeMdPath = join(ctx.agentPath, 'CLAUDE.md');
      const systemPrompt = existsSync(claudeMdPath)
        ? readFileSync(claudeMdPath, 'utf-8')
        : `You are ${ctx.agentId}, a helpful AI assistant powered by the Soleri engine.`;

      // ─── MCP Tools ────────────────────────────────────────────────
      let mcpClient: StdioMcpClient | null = null;
      let tools: AgentTool[] = [];

      if (opts.tools) {
        const mcpCmd = findMcpCommand(ctx.agentId);

        if (!mcpCmd) {
          // Try local dist/agent.js
          const localAgent = join(ctx.agentPath, 'dist', 'agent.js');
          if (existsSync(localAgent)) {
            mcpClient = new StdioMcpClient('node', [localAgent]);
          }
        } else {
          mcpClient = new StdioMcpClient(mcpCmd.command, mcpCmd.args, mcpCmd.env);
        }

        if (mcpClient) {
          const s = p.spinner();
          s.start('Connecting to agent MCP server...');
          try {
            await mcpClient.initialize();
            const mcpTools = await mcpClient.listTools();
            tools = mcpTools.map((t) => ({
              name: t.name,
              description: t.description ?? '',
              inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
            }));
            s.stop(`Connected — ${tools.length} tools available`);
          } catch (_err) {
            s.stop('Could not connect to MCP server — running without tools');
            mcpClient.kill();
            mcpClient = null;
          }
        } else {
          p.log.warn(
            `No MCP server found for "${ctx.agentId}". ` +
              'Run `soleri dev` first, then re-run `soleri chat`. Running without tools.',
          );
        }
      }

      // ─── REPL ─────────────────────────────────────────────────────
      console.log('');
      p.intro(`Chat with ${ctx.agentId} (${opts.model})`);
      console.log('  Type your message and press Enter. Ctrl+C or "exit" to quit.');
      if (tools.length > 0) {
        console.log(`  Tools: ${tools.map((t) => t.name).join(', ')}`);
      }
      console.log('');

      const history: ChatMessage[] = [];

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      const prompt = (): Promise<string> =>
        new Promise((resolve) => {
          rl.question('\x1b[36mYou:\x1b[0m ', resolve);
        });

      const cleanup = () => {
        rl.close();
        if (mcpClient) mcpClient.kill();
        console.log('\n  Goodbye!');
        process.exit(0);
      };

      rl.on('close', () => cleanup());
      process.on('SIGINT', () => cleanup());

      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Sequential await is intentional — this is a REPL loop
        // eslint-disable-next-line no-await-in-loop
        const input = await prompt().catch(() => 'exit');
        const trimmed = input.trim();

        if (!trimmed || trimmed === 'exit' || trimmed === 'quit') {
          cleanup();
          return;
        }

        history.push({ role: 'user', content: trimmed, timestamp: Date.now() });

        const thinking = p.spinner();
        thinking.start('Thinking...');

        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await runAgentLoop(history, {
            apiKey,
            model: opts.model,
            systemPrompt,
            tools,
            executor: async (toolName, toolInput) => {
              if (!mcpClient) return { output: 'No MCP server connected', isError: true };
              try {
                const output = await mcpClient.callTool(toolName, toolInput);
                return { output, isError: false };
              } catch (err) {
                return {
                  output: err instanceof Error ? err.message : String(err),
                  isError: true,
                };
              }
            },
            maxIterations: 20,
          });

          thinking.stop('');

          const response = result.text;
          if (response) {
            console.log(`\n\x1b[32m${ctx.agentId}:\x1b[0m ${response}\n`);
            history.push({
              role: 'assistant',
              content: response,
              timestamp: Date.now(),
            });
          }

          if (result.newMessages.length > 0) {
            history.push(...result.newMessages);
          }
        } catch (err) {
          thinking.stop('Error');
          p.log.error(err instanceof Error ? err.message : String(err));
          history.pop(); // remove the failed user message
        }
      }
    });
}
