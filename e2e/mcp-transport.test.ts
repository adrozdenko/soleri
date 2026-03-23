/**
 * E2E Test: MCP Transport
 *
 * The true end-to-end test. Scaffolds an agent, builds it,
 * spawns it as a subprocess, connects via MCP stdio protocol,
 * calls real tools, and verifies responses.
 *
 * This is what Claude Code actually does when talking to an agent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { scaffold } from '@soleri/forge/lib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const AGENT_ID = 'e2e-mcp-agent';

describe('E2E: mcp-transport', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-mcp-${Date.now()}`);
  let agentDir: string;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    mkdirSync(tempDir, { recursive: true });

    // 1. Scaffold
    const result = scaffold({
      id: AGENT_ID,
      name: 'E2E MCP Agent',
      role: 'Testing Advisor',
      description: 'Agent for MCP transport E2E tests.',
      domains: ['testing'],
      principles: ['Verify everything'],
      greeting: 'MCP transport test agent ready.',
      outputDir: tempDir,
    });
    agentDir = result.agentDir;

    // 2. Point @soleri/core to local workspace
    const monorepoRoot = join(import.meta.dirname, '..');
    const corePkg = join(monorepoRoot, 'packages/core');
    const pkgPath = join(agentDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies['@soleri/core'] = `file:${corePkg}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    // 3. Install
    execFileSync('npm', ['install', '--ignore-scripts'], {
      cwd: agentDir,
      stdio: 'pipe',
      timeout: 60_000,
    });

    // 4. Spawn agent via tsx and connect MCP client
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/index.ts'],
      cwd: agentDir,
      env: {
        ...process.env,
        // Use in-memory vault to avoid polluting home dir
        NODE_OPTIONS: '--no-warnings',
      },
    });

    client = new Client({ name: 'e2e-test-client', version: '1.0.0' });
    await client.connect(transport);
  }, 90_000); // Allow time for scaffold + install + startup

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      // Ignore close errors
    }
    try {
      await transport?.close();
    } catch {
      // Ignore close errors
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list available tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(10);

    const toolNames = tools.tools.map((t) => t.name);
    expect(toolNames).toContain(`${AGENT_ID}_vault`);
    expect(toolNames).toContain(`${AGENT_ID}_plan`);
    expect(toolNames).toContain(`${AGENT_ID}_brain`);
    expect(toolNames).toContain(`${AGENT_ID}_admin`);
    expect(toolNames).toContain(`${AGENT_ID}_testing`);
  });

  it('should call vault search and get a valid response', async () => {
    const result = await client.callTool({
      name: `${AGENT_ID}_vault`,
      arguments: { op: 'search', params: { query: 'test' } },
    });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.facade).toBe(`${AGENT_ID}_vault`);
    expect(parsed.op).toBe('search');
  });

  it('should call admin health_check over MCP', async () => {
    const result = await client.callTool({
      name: `${AGENT_ID}_admin`,
      arguments: { op: 'admin_health', params: {} },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.data.status).toBeDefined();
  });

  it('should capture and retrieve knowledge over MCP', async () => {
    // Capture
    const captureResult = await client.callTool({
      name: `${AGENT_ID}_vault`,
      arguments: {
        op: 'capture_knowledge',
        params: {
          entries: [
            {
              type: 'pattern',
              domain: 'testing',
              title: 'MCP Transport Verified',
              description: 'E2E test confirmed MCP stdio transport works end-to-end',
              severity: 'warning',
              tags: ['e2e', 'mcp', 'transport'],
            },
          ],
        },
      },
    });

    const captureText = (captureResult.content as Array<{ type: string; text: string }>)[0].text;
    const captureParsed = JSON.parse(captureText);
    expect(captureParsed.success).toBe(true);

    // Search
    const searchResult = await client.callTool({
      name: `${AGENT_ID}_vault`,
      arguments: { op: 'search', params: { query: 'MCP Transport' } },
    });

    const searchText = (searchResult.content as Array<{ type: string; text: string }>)[0].text;
    const searchParsed = JSON.parse(searchText);
    expect(searchParsed.success).toBe(true);
    const results = searchParsed.data as Array<{ entry: { title: string }; score: number }>;
    expect(results.some((r) => r.entry.title === 'MCP Transport Verified')).toBe(true);
  });

  it('should handle errors gracefully over MCP', async () => {
    const result = await client.callTool({
      name: `${AGENT_ID}_vault`,
      arguments: { op: 'nonexistent_operation', params: {} },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unknown operation');
  });

  it('should call plan create over MCP', async () => {
    const result = await client.callTool({
      name: `${AGENT_ID}_plan`,
      arguments: {
        op: 'create_plan',
        params: {
          title: 'MCP Test Plan',
          objective: 'Test planning over MCP transport',
          scope: 'E2E MCP transport testing',
          tasks: [{ title: 'Verify', description: 'Verify it works' }],
        },
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.data.plan.id).toBeDefined();
  });

  it('should call control route_intent over MCP', async () => {
    const result = await client.callTool({
      name: `${AGENT_ID}_control`,
      arguments: {
        op: 'route_intent',
        params: { prompt: 'Fix the authentication bug' },
      },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.data.intent).toBeDefined();
  });
});
