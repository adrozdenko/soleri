/**
 * E2E: File-Tree Agent — Full Pipeline
 *
 * Tests the complete flow:
 *   scaffoldFileTree() → start engine binary → connect MCP → call ops → verify
 *
 * This is the definitive test that the v7 file-tree architecture works end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { scaffoldFileTree } from '../packages/forge/src/scaffold-filetree.js';

// ─── Setup ────────────────────────────────────────────────────────────

let tempDir: string;
let agentDir: string;
let client: Client;
let serverProcess: ChildProcess;

const AGENT_CONFIG = {
  id: 'e2e-filetree',
  name: 'E2E FileTree Agent',
  role: 'Test Agent for E2E Validation',
  description: 'An agent scaffolded as a file tree to validate the v7 architecture end-to-end.',
  domains: ['testing', 'validation'],
  principles: ['Test everything', 'Verify assumptions'],
  tone: 'pragmatic' as const,
};

const ENGINE_BINARY = join(
  import.meta.dirname,
  '..',
  'packages',
  'core',
  'dist',
  'engine',
  'bin',
  'soleri-engine.js',
);

beforeAll(async () => {
  tempDir = join(tmpdir(), `soleri-e2e-filetree-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  // 1. Scaffold file-tree agent
  const result = scaffoldFileTree(AGENT_CONFIG, tempDir);
  expect(result.success).toBe(true);
  agentDir = result.agentDir;

  // Verify scaffold output
  expect(existsSync(join(agentDir, 'agent.yaml'))).toBe(true);
  expect(existsSync(join(agentDir, 'CLAUDE.md'))).toBe(true);
  expect(existsSync(join(agentDir, '.mcp.json'))).toBe(true);

  // 2. Start engine binary
  serverProcess = spawn('node', [ENGINE_BINARY, '--agent', join(agentDir, 'agent.yaml')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  // Collect stderr for debugging
  let stderr = '';
  serverProcess.stderr?.on('data', (d) => {
    stderr += d.toString();
  });

  // Wait for "Engine ready" message
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Engine failed to start. stderr:\n${stderr}`)), 15_000);
    serverProcess.stderr?.on('data', (chunk) => {
      if (chunk.toString().includes('Engine ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Engine exited with code ${code}. stderr:\n${stderr}`));
      }
    });
  });

  // 3. Connect MCP client
  const transport = new StdioClientTransport({
    command: 'node',
    args: [ENGINE_BINARY, '--agent', join(agentDir, 'agent.yaml')],
  });

  client = new Client({ name: 'e2e-test', version: '1.0.0' }, {});
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  try {
    await client?.close();
  } catch {
    // ignore
  }
  serverProcess?.kill();
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('E2E: file-tree agent', () => {
  it('should list tools including core, vault, brain, and domain facades', async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    // Core facade
    expect(toolNames).toContain('e2e-filetree_core');

    // Semantic facades
    expect(toolNames).toContain('e2e-filetree_vault');
    expect(toolNames).toContain('e2e-filetree_brain');
    expect(toolNames).toContain('e2e-filetree_plan');
    expect(toolNames).toContain('e2e-filetree_memory');
    expect(toolNames).toContain('e2e-filetree_curator');
    expect(toolNames).toContain('e2e-filetree_loop');
    expect(toolNames).toContain('e2e-filetree_orchestrate');
    expect(toolNames).toContain('e2e-filetree_admin');

    // Domain facades
    expect(toolNames).toContain('e2e-filetree_testing');
    expect(toolNames).toContain('e2e-filetree_validation');

    // Hot ops
    expect(toolNames).toContain('e2e-filetree_search_intelligent');
    expect(toolNames).toContain('e2e-filetree_capture_knowledge');
  });

  it('should call core health op and get agent info', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_core',
      arguments: { op: 'health', params: {} },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
    expect(data.data.agent.name).toBe('E2E FileTree Agent');
    expect(data.data.agent.format).toBe('filetree');
  });

  it('should call core identity op', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_core',
      arguments: { op: 'identity', params: {} },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe('E2E FileTree Agent');
    expect(data.data.role).toBe('Test Agent for E2E Validation');
  });

  it('should call core activate op', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_core',
      arguments: { op: 'activate', params: { projectPath: '.' } },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.data.activated).toBe(true);
    expect(data.data.agent.format).toBe('filetree');
    expect(data.data.domains).toEqual(['testing', 'validation']);
  });

  it('should capture and search knowledge via vault', async () => {
    // Capture a pattern
    const captureResult = await client.callTool({
      name: 'e2e-filetree_vault',
      arguments: {
        op: 'capture_enriched',
        params: {
          projectPath: '.',
          title: 'File-tree agents are faster',
          description: 'File-tree agents skip the build step and are ready immediately after scaffolding.',
          type: 'pattern',
          category: 'architecture',
          severity: 'suggestion',
          tags: ['filetree', 'performance'],
        },
      },
    });

    const captured = JSON.parse((captureResult.content as Array<{ text: string }>)[0].text);
    expect(captured.success).toBe(true);

    // Search for it
    const searchResult = await client.callTool({
      name: 'e2e-filetree_vault',
      arguments: {
        op: 'search',
        params: { query: 'file-tree faster build' },
      },
    });

    const searched = JSON.parse((searchResult.content as Array<{ text: string }>)[0].text);
    expect(searched.success).toBe(true);
  });

  it('should call brain stats', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_brain',
      arguments: { op: 'brain_stats', params: {} },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it('should create a plan', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_plan',
      arguments: {
        op: 'create_plan',
        params: {
          objective: 'Validate file-tree agent works end-to-end',
          scope: 'E2E test',
        },
      },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it('should call curator status', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_curator',
      arguments: { op: 'curator_status', params: {} },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(true);
  });

  it('should return error for unknown ops', async () => {
    const result = await client.callTool({
      name: 'e2e-filetree_vault',
      arguments: { op: 'nonexistent_operation', params: {} },
    });

    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unknown operation');
  });

  it('should have CLAUDE.md with correct agent identity', () => {
    const claudeMd = readFileSync(join(agentDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('# E2E FileTree Agent Mode');
    expect(claudeMd).toContain('e2e-filetree_core op:activate');
    expect(claudeMd).toContain('e2e-filetree_vault');
    expect(claudeMd).toContain('Available Workflows');
  });
});
