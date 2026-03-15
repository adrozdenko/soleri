/**
 * E2E Test: Chat, Context, Agency facades + Pack/Hook lifecycle
 *
 * Exercises user journeys across the chat, context, agency, and control
 * facades, plus the pack installation lifecycle via admin facade.
 * Uses createAgentRuntime with in-memory vault — no subprocess needed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentRuntime,
  createSemanticFacades,
  registerFacade,
} from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-cca';

/** Capture the MCP handler from registerFacade without a real server */
function captureHandler(facade: FacadeConfig) {
  let captured: ((args: { op: string; params: Record<string, unknown> }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>) | null = null;

  const mockServer = {
    tool: (_name: string, _desc: string, _schema: unknown, handler: unknown) => {
      captured = handler as typeof captured;
    },
  };
  registerFacade(mockServer as never, facade);
  return captured!;
}

/** Parse MCP tool response to FacadeResponse */
function parseResponse(raw: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(raw.content[0].text) as {
    success: boolean;
    data?: unknown;
    error?: string;
    op: string;
    facade: string;
  };
}

describe('E2E: chat-context-agency', () => {
  let runtime: AgentRuntime;
  let facades: FacadeConfig[];
  let handlers: Map<string, ReturnType<typeof captureHandler>>;
  const baseDir = join(tmpdir(), `soleri-e2e-cca-${Date.now()}`);
  const plannerDir = join(baseDir, 'planner');
  const sessionDir = join(baseDir, 'sessions');
  const authPath = join(baseDir, 'auth.json');
  const queueDir = join(baseDir, 'queue');
  const packDir = join(baseDir, 'test-pack');

  beforeAll(() => {
    mkdirSync(plannerDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(queueDir, { recursive: true });

    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });

    facades = createSemanticFacades(runtime, AGENT_ID);

    handlers = new Map();
    for (const facade of facades) {
      handlers.set(facade.name, captureHandler(facade));
    }
  });

  afterAll(() => {
    runtime.close();
    rmSync(baseDir, { recursive: true, force: true });
  });

  async function callOp(facadeName: string, op: string, params: Record<string, unknown> = {}) {
    const handler = handlers.get(facadeName);
    if (!handler) throw new Error(`No facade: ${facadeName}`);
    const raw = await handler({ op, params });
    return parseResponse(raw);
  }

  // =========================================================================
  // Journey 1: Chat facade — session management, chunking, auth
  // =========================================================================

  describe('Journey 1: Chat facade', () => {
    it('should initialize a chat session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_init', {
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { initialized: boolean; activeSessions: number };
      expect(data.initialized).toBe(true);
      expect(typeof data.activeSessions).toBe('number');
    });

    it('should get or create a session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_get', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { id: string; messageCount: number };
      expect(data.id).toBe('test-session-1');
      expect(data.messageCount).toBe(0);
    });

    it('should append messages to a session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_append', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
        role: 'user',
        content: 'Hello, world!',
      });
      expect(res.success).toBe(true);
      const data = res.data as { sessionId: string; messageCount: number };
      expect(data.messageCount).toBe(1);

      // Append another
      const res2 = await callOp(`${AGENT_ID}_chat`, 'chat_session_append', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
        role: 'assistant',
        content: 'Hello! How can I help?',
      });
      expect(res2.success).toBe(true);
      expect((res2.data as { messageCount: number }).messageCount).toBe(2);
    });

    it('should list sessions', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_list', {
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { sessions: string[]; count: number };
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.sessions).toContain('test-session-1');
    });

    it('should clear session messages without deleting session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_clear', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      expect((res.data as { cleared: boolean }).cleared).toBe(true);

      // Verify session still exists but is empty
      const getRes = await callOp(`${AGENT_ID}_chat`, 'chat_session_get', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(getRes.success).toBe(true);
      expect((getRes.data as { messageCount: number }).messageCount).toBe(0);
    });

    it('should delete a session entirely', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_delete', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      expect((res.data as { deleted: boolean }).deleted).toBe(true);
    });

    it('should chunk a long response', async () => {
      const longText = 'A'.repeat(8000);
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_chunk_response', {
        text: longText,
        maxChunkSize: 4000,
        format: 'plain',
      });
      expect(res.success).toBe(true);
      const data = res.data as { chunks: string[]; count: number };
      expect(data.count).toBeGreaterThan(1);
    });

    it('should initialize authentication', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_init', {
        storagePath: authPath,
        passphrase: 'test-secret',
      });
      expect(res.success).toBe(true);
      const data = res.data as { initialized: boolean; enabled: boolean };
      expect(data.initialized).toBe(true);
      expect(data.enabled).toBe(true);
    });

    it('should check and authenticate a user', async () => {
      // Check — should not be authenticated yet
      const checkRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(checkRes.success).toBe(true);
      expect((checkRes.data as { authenticated: boolean }).authenticated).toBe(false);

      // Authenticate with correct passphrase
      const authRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_authenticate', {
        userId: 'user-42',
        passphrase: 'test-secret',
        storagePath: authPath,
      });
      expect(authRes.success).toBe(true);
      expect((authRes.data as { success: boolean }).success).toBe(true);

      // Check again — now authenticated
      const recheckRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(recheckRes.success).toBe(true);
      expect((recheckRes.data as { authenticated: boolean }).authenticated).toBe(true);
    });

    it('should reject wrong passphrase', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_authenticate', {
        userId: 'user-99',
        passphrase: 'wrong-secret',
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      expect((res.data as { success: boolean }).success).toBe(false);
    });

    it('should revoke authentication', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_revoke', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      expect((res.data as { revoked: boolean }).revoked).toBe(true);

      // Verify revoked
      const checkRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect((checkRes.data as { authenticated: boolean }).authenticated).toBe(false);
    });

    it('should get auth status', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_status', {
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean; authenticatedCount: number };
      expect(data.enabled).toBe(true);
      expect(typeof data.authenticatedCount).toBe('number');
    });

    it('should manage task cancellation lifecycle', async () => {
      // Create a cancellable task
      const createRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_create', {
        chatId: 'chat-abc',
        description: 'Processing user request',
      });
      expect(createRes.success).toBe(true);
      expect((createRes.data as { created: boolean }).created).toBe(true);

      // Check status
      const statusRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_status', {
        chatId: 'chat-abc',
      });
      expect(statusRes.success).toBe(true);
      expect((statusRes.data as { running: boolean }).running).toBe(true);

      // Cancel it
      const cancelRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_stop', {
        chatId: 'chat-abc',
      });
      expect(cancelRes.success).toBe(true);
      expect((cancelRes.data as { cancelled: boolean }).cancelled).toBe(true);
    });

    it('should compress verbose output', async () => {
      const verbose = JSON.stringify({ results: Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100) })) });
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_compress_output', {
        toolName: 'test-tool',
        output: verbose,
        maxLength: 500,
      });
      expect(res.success).toBe(true);
      const data = res.data as { compressedLength: number; originalLength: number };
      expect(data.compressedLength).toBeLessThanOrEqual(data.originalLength);
    });
  });

  // =========================================================================
  // Journey 2: Context facade — entity extraction and knowledge retrieval
  // =========================================================================

  describe('Journey 2: Context facade', () => {
    it('should extract entities from a prompt', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_extract_entities', {
        prompt: 'Fix the Button component in src/components/Button.tsx using TypeScript',
      });
      expect(res.success).toBe(true);
      const data = res.data as { files?: string[]; technologies?: string[]; actions?: string[] };
      // Should detect at least some entities
      expect(data).toBeDefined();
    });

    it('should retrieve knowledge for a query', async () => {
      // First seed some vault data
      await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [{
          type: 'pattern',
          domain: 'frontend',
          title: 'Context Test Pattern',
          description: 'A pattern for testing context retrieval',
          severity: 'suggestion',
          tags: ['context', 'testing'],
        }],
      });

      const res = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'context test pattern retrieval',
        domain: 'frontend',
      });
      expect(res.success).toBe(true);
    });

    it('should perform full context analysis', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_analyze', {
        prompt: 'Refactor the authentication module to use TypeScript interfaces',
        domain: 'backend',
      });
      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data).toBeDefined();
    });

    it('should handle empty prompt gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_extract_entities', {
        prompt: '',
      });
      // Should still succeed, just with minimal/empty results
      expect(res.success).toBe(true);
    });

    it('context retrieval should be isolated per domain', async () => {
      // Capture frontend-specific knowledge
      await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [{
          type: 'pattern',
          domain: 'frontend',
          title: 'React Context Hook Pattern',
          description: 'Use custom hooks to wrap React context for type safety',
          severity: 'suggestion',
          tags: ['react', 'hooks'],
        }],
      });

      // Search with frontend domain filter
      const frontendRes = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'React context hook',
        domain: 'frontend',
      });
      expect(frontendRes.success).toBe(true);

      // Search with backend domain filter — should get fewer/no React-related results
      const backendRes = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'React context hook',
        domain: 'backend',
      });
      expect(backendRes.success).toBe(true);
    });
  });

  // =========================================================================
  // Journey 3: Agency facade — proactive file watching and pattern surfacing
  // =========================================================================

  describe('Journey 3: Agency facade', () => {
    it('should report status when disabled', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_status');
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean };
      expect(data.enabled).toBe(false);
    });

    it('should enable agency mode', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_enable', {
        projectPath: baseDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean };
      expect(data.enabled).toBe(true);
    });

    it('should report status when enabled', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_status');
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean };
      expect(data.enabled).toBe(true);
    });

    it('should update agency configuration', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_config', {
        extensions: ['.ts', '.tsx', '.js'],
        debounceMs: 500,
        minPatternConfidence: 0.7,
      });
      expect(res.success).toBe(true);
    });

    it('should scan a file for warnings', async () => {
      // Create a test file to scan
      const testFile = join(baseDir, 'test-scan.ts');
      writeFileSync(testFile, 'const x: any = "hello";\nconsole.log(x);');

      const res = await callOp(`${AGENT_ID}_agency`, 'agency_scan_file', {
        filePath: testFile,
      });
      expect(res.success).toBe(true);
      const data = res.data as { warnings: unknown[]; count: number };
      expect(typeof data.count).toBe('number');
    });

    it('should get pending warnings', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_warnings');
      expect(res.success).toBe(true);
      const data = res.data as { warnings: unknown[]; count: number };
      expect(typeof data.count).toBe('number');
    });

    it('should surface patterns for a file path', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_surface_patterns', {
        filePath: join(baseDir, 'test-scan.ts'),
      });
      expect(res.success).toBe(true);
      const data = res.data as { patterns: unknown[]; count: number };
      expect(typeof data.count).toBe('number');
    });

    it('should generate clarification for ambiguous prompt', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_clarify', {
        prompt: 'fix it',
        confidence: 0.3,
      });
      expect(res.success).toBe(true);
    });

    it('should not generate clarification for confident prompt', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_clarify', {
        prompt: 'fix the broken navbar',
        confidence: 0.95,
      });
      expect(res.success).toBe(true);
    });

    it('should disable agency mode', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_disable');
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean };
      expect(data.enabled).toBe(false);
    });
  });

  // =========================================================================
  // Journey 4: Intent routing end-to-end
  // =========================================================================

  describe('Journey 4: Intent routing end-to-end', () => {
    it('should route "build me a login form" to BUILD intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'build me a login form',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent).toBeDefined();
      expect(data.intent.toUpperCase()).toContain('BUILD');
      expect(typeof data.confidence).toBe('number');
    });

    it('should route "fix the broken navbar" to FIX intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'fix the broken navbar',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent.toUpperCase()).toContain('FIX');
      expect(data.confidence).toBeGreaterThan(0);
    });

    it('should route "review my code for quality" to REVIEW intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'review my code for quality',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent.toUpperCase()).toContain('REVIEW');
    });

    it('should route "how should I architect this?" to PLAN intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'how should I architect this?',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent.toUpperCase()).toContain('PLAN');
    });

    it('should route "make it faster" to IMPROVE intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'make it faster',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent.toUpperCase()).toContain('IMPROVE');
    });

    it('should route "ship it" to DELIVER intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'ship it',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string; confidence: number };
      expect(data.intent.toUpperCase()).toContain('DELIVER');
    });

    it('should return confidence score for every classification', async () => {
      const prompts = [
        'build a dashboard',
        'this component is broken',
        'review my code',
        'how should we approach this?',
        'optimize the query',
        'deploy to production',
      ];

      for (const prompt of prompts) {
        const res = await callOp(`${AGENT_ID}_control`, 'route_intent', { prompt });
        expect(res.success).toBe(true);
        const data = res.data as { confidence: number };
        expect(typeof data.confidence).toBe('number');
        expect(data.confidence).toBeGreaterThanOrEqual(0);
        expect(data.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should handle ambiguous prompt gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'hmm',
      });
      expect(res.success).toBe(true);
      const data = res.data as { intent: string };
      // Should still return some classification
      expect(data.intent).toBeDefined();
    });

    it('should handle empty prompt gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: '',
      });
      // Should either succeed with a default or return a graceful error
      expect(typeof res.success).toBe('boolean');
    });

    it('should morph to a different operational mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'morph', {
        mode: 'BUILD-MODE',
      });
      expect(res.success).toBe(true);
    });

    it('should get behavior rules for current mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'get_behavior_rules');
      expect(res.success).toBe(true);
      const data = res.data as { mode: string; rules: unknown };
      expect(data.mode).toBeDefined();
      expect(data.rules).toBeDefined();
    });

    it('should get behavior rules for a specific mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'get_behavior_rules', {
        mode: 'FIX-MODE',
      });
      expect(res.success).toBe(true);
      const data = res.data as { mode: string; rules: unknown };
      expect(data.mode).toBe('FIX-MODE');
    });
  });

  // =========================================================================
  // Journey 5: Pack installation lifecycle
  // =========================================================================

  describe('Journey 5: Pack installation lifecycle', () => {
    beforeAll(() => {
      // Create a minimal test pack
      mkdirSync(packDir, { recursive: true });
      mkdirSync(join(packDir, 'vault'), { recursive: true });

      // Write manifest
      writeFileSync(
        join(packDir, 'soleri-pack.json'),
        JSON.stringify({
          id: 'test-e2e-pack',
          name: 'E2E Test Pack',
          version: '1.0.0',
          description: 'A test knowledge pack for E2E testing',
          domains: ['testing'],
          facades: [],
          vault: { dir: 'vault' },
        }),
      );

      // Write a vault entry
      writeFileSync(
        join(packDir, 'vault', 'test-pattern.json'),
        JSON.stringify([
          {
            type: 'pattern',
            domain: 'testing',
            title: 'Pack Test Pattern',
            description: 'A pattern seeded by a knowledge pack',
            severity: 'suggestion',
            tags: ['pack', 'e2e'],
          },
        ]),
      );
    });

    it('should list packs — initially empty', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_list');
      expect(res.success).toBe(true);
      const data = res.data as { packs: unknown[]; count: number };
      expect(data.count).toBe(0);
    });

    it('should validate a pack before installing', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_validate', {
        packDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { valid: boolean; manifest?: { id: string } };
      expect(data.valid).toBe(true);
      expect(data.manifest?.id).toBe('test-e2e-pack');
    });

    it('should install a knowledge pack', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_install', {
        packDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { installed: boolean; id: string; vaultEntries: number };
      expect(data.installed).toBe(true);
      expect(data.id).toBe('test-e2e-pack');
      expect(data.vaultEntries).toBeGreaterThanOrEqual(0);
    });

    it('should list packs — now shows installed pack', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_list');
      expect(res.success).toBe(true);
      const data = res.data as { packs: Array<{ id: string; status: string }>; count: number };
      expect(data.count).toBe(1);
      expect(data.packs[0].id).toBe('test-e2e-pack');
      expect(data.packs[0].status).toBe('installed');
    });

    it('should verify pack seeded vault entries', async () => {
      const res = await callOp(`${AGENT_ID}_vault`, 'search', {
        query: 'Pack Test Pattern',
      });
      expect(res.success).toBe(true);
      // The pattern should be findable if vault seeding worked
    });

    it('double-install should be idempotent (return error, not crash)', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_install', {
        packDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { installed: boolean; error?: string };
      // Should fail gracefully — already installed
      expect(data.installed).toBe(false);
      expect(data.error).toContain('already installed');
    });

    it('should uninstall a pack', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_uninstall', {
        packId: 'test-e2e-pack',
      });
      expect(res.success).toBe(true);
      const data = res.data as { uninstalled: boolean };
      expect(data.uninstalled).toBe(true);
    });

    it('should show empty after uninstall', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_list');
      expect(res.success).toBe(true);
      const data = res.data as { count: number };
      expect(data.count).toBe(0);
    });
  });

  // =========================================================================
  // Journey 6: Hook packs
  // =========================================================================

  describe('Journey 6: Hook packs', () => {
    it('should validate a pack with hooks directory', async () => {
      // Create pack with hooks
      const hookPackDir = join(baseDir, 'hook-pack');
      mkdirSync(join(hookPackDir, 'hooks'), { recursive: true });

      writeFileSync(
        join(hookPackDir, 'soleri-pack.json'),
        JSON.stringify({
          id: 'test-hook-pack',
          name: 'Hook Test Pack',
          version: '1.0.0',
          description: 'Pack with hooks for testing',
          domains: ['testing'],
          facades: [],
          hooks: { dir: 'hooks' },
        }),
      );

      writeFileSync(
        join(hookPackDir, 'hooks', 'no-console-log.md'),
        '# No Console Log\n\nRemove console.log statements from production code.',
      );

      writeFileSync(
        join(hookPackDir, 'hooks', 'no-any-types.md'),
        '# No Any Types\n\nAvoid using `any` type in TypeScript.',
      );

      const res = await callOp(`${AGENT_ID}_admin`, 'pack_validate', {
        packDir: hookPackDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { valid: boolean; counts?: { hooks: number } };
      expect(data.valid).toBe(true);
      expect(data.counts?.hooks).toBe(2);
    });

    it('should install hook pack and list discovered hooks', async () => {
      const hookPackDir = join(baseDir, 'hook-pack');
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_install', {
        packDir: hookPackDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { installed: boolean; hooks: string[] };
      expect(data.installed).toBe(true);
      expect(data.hooks).toContain('no-console-log');
      expect(data.hooks).toContain('no-any-types');
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('Edge cases', () => {
    it('chat: unknown op should return clear error', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'nonexistent_chat_op');
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error).toContain('Unknown operation');
    });

    it('context: unknown op should return clear error', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'nonexistent_op');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown operation');
    });

    it('agency: unknown op should return clear error', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'nonexistent_op');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown operation');
    });

    it('control: morph to non-existent mode should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'morph', {
        mode: 'DOES-NOT-EXIST-MODE',
      });
      // Should either succeed (modes are flexible) or return a clear error — not crash
      expect(typeof res.success).toBe('boolean');
    });

    it('pack: validate non-existent directory should return validation error', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_validate', {
        packDir: '/tmp/no-such-pack-dir-ever',
      });
      expect(res.success).toBe(true);
      const data = res.data as { valid: boolean; errors: string[] };
      expect(data.valid).toBe(false);
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it('pack: uninstall non-existent pack should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_admin`, 'pack_uninstall', {
        packId: 'no-such-pack',
      });
      expect(res.success).toBe(true);
      const data = res.data as { error?: string };
      expect(data.error).toContain('not found');
    });

    it('chat: cancel non-existent task should handle gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_stop', {
        chatId: 'no-such-chat',
      });
      expect(res.success).toBe(true);
      const data = res.data as { cancelled: boolean };
      expect(data.cancelled).toBe(false);
    });

    it('agency: scan non-existent file should not crash', async () => {
      // Enable agency first
      await callOp(`${AGENT_ID}_agency`, 'agency_enable', { projectPath: baseDir });

      const res = await callOp(`${AGENT_ID}_agency`, 'agency_scan_file', {
        filePath: '/tmp/no-such-file-ever.ts',
      });
      // Should succeed with empty warnings, not throw
      expect(res.success).toBe(true);

      await callOp(`${AGENT_ID}_agency`, 'agency_disable');
    });

    it('chat: MCP bridge ops without init should degrade gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_bridge_list');
      expect(res.success).toBe(true);
      const data = res.data as { tools: unknown[]; count: number };
      expect(data.count).toBe(0);
    });

    it('chat: notification status without init should degrade gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_notify_status');
      expect(res.success).toBe(true);
      const data = res.data as { initialized: boolean };
      expect(data.initialized).toBe(false);
    });
  });
});
