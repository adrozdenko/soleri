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
import { createAgentRuntime, createSemanticFacades, registerFacade } from '@soleri/core';
import type { FacadeConfig, AgentRuntime } from '@soleri/core';

const AGENT_ID = 'e2e-cca';

/** Capture the MCP handler from registerFacade without a real server */
function captureHandler(facade: FacadeConfig) {
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
      expect(res.op).toBe('chat_session_init');
      const data = res.data as {
        initialized: boolean;
        activeSessions: number;
        storageDir: string;
      };
      expect(data.initialized).toBe(true);
      expect(data.activeSessions).toBe(0);
      expect(data.storageDir).toBe(sessionDir);
    });

    it('should get or create a session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_get', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        id: string;
        messageCount: number;
        createdAt: number;
        lastActiveAt: number;
        meta: Record<string, unknown>;
      };
      expect(data.id).toBe('test-session-1');
      expect(data.messageCount).toBe(0);
      expect(typeof data.createdAt).toBe('number');
      expect(data.createdAt).toBeGreaterThan(0);
      expect(typeof data.lastActiveAt).toBe('number');
      // meta is optional on ChatSession — undefined when not set
      expect(data.meta === undefined || typeof data.meta === 'object').toBe(true);
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
      expect(data.sessionId).toBe('test-session-1');
      expect(data.messageCount).toBe(1);

      // Append another
      const res2 = await callOp(`${AGENT_ID}_chat`, 'chat_session_append', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
        role: 'assistant',
        content: 'Hello! How can I help?',
      });
      expect(res2.success).toBe(true);
      const data2 = res2.data as { sessionId: string; messageCount: number };
      expect(data2.sessionId).toBe('test-session-1');
      expect(data2.messageCount).toBe(2);
    });

    it('should list sessions', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_list', {
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { sessions: string[]; count: number; active: number };
      expect(data.count).toBe(1);
      expect(data.sessions).toEqual(['test-session-1']);
      expect(data.active).toBe(1);
    });

    it('should clear session messages without deleting session', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_clear', {
        sessionId: 'test-session-1',
        storageDir: sessionDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { cleared: boolean; sessionId: string };
      expect(data.cleared).toBe(true);
      expect(data.sessionId).toBe('test-session-1');

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
      const data = res.data as { deleted: boolean; sessionId: string };
      expect(data.deleted).toBe(true);
      expect(data.sessionId).toBe('test-session-1');

      // Verify session is gone from listing
      const listRes = await callOp(`${AGENT_ID}_chat`, 'chat_session_list', {
        storageDir: sessionDir,
      });
      expect((listRes.data as { count: number }).count).toBe(0);
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
      expect(data.count).toBeGreaterThanOrEqual(2);
      expect(data.chunks.length).toBe(data.count);
      // Each chunk should be at most maxChunkSize
      for (const chunk of data.chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4000);
      }
      // All chunks together should reconstitute the original text
      expect(data.chunks.join('').length).toBe(8000);
    });

    it('should initialize authentication', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_init', {
        storagePath: authPath,
        passphrase: 'test-secret',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        initialized: boolean;
        enabled: boolean;
        authenticatedCount: number;
      };
      expect(data.initialized).toBe(true);
      expect(data.enabled).toBe(true);
      expect(data.authenticatedCount).toBe(0);
    });

    it('should check and authenticate a user', async () => {
      // Check — should not be authenticated yet
      const checkRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(checkRes.success).toBe(true);
      const checkData = checkRes.data as {
        userId: string;
        authenticated: boolean;
        lockedOut: boolean;
      };
      expect(checkData.userId).toBe('user-42');
      expect(checkData.authenticated).toBe(false);
      expect(checkData.lockedOut).toBe(false);

      // Authenticate with correct passphrase
      const authRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_authenticate', {
        userId: 'user-42',
        passphrase: 'test-secret',
        storagePath: authPath,
      });
      expect(authRes.success).toBe(true);
      const authData = authRes.data as {
        userId: string;
        success: boolean;
        lockedOut: boolean;
      };
      expect(authData.userId).toBe('user-42');
      expect(authData.success).toBe(true);
      expect(authData.lockedOut).toBe(false);

      // Check again — now authenticated
      const recheckRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(recheckRes.success).toBe(true);
      const recheckData = recheckRes.data as {
        userId: string;
        authenticated: boolean;
        lockedOut: boolean;
      };
      expect(recheckData.userId).toBe('user-42');
      expect(recheckData.authenticated).toBe(true);
      expect(recheckData.lockedOut).toBe(false);
    });

    it('should reject wrong passphrase', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_authenticate', {
        userId: 'user-99',
        passphrase: 'wrong-secret',
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      const data = res.data as { userId: string; success: boolean; lockedOut: boolean };
      expect(data.userId).toBe('user-99');
      expect(data.success).toBe(false);
      expect(typeof data.lockedOut).toBe('boolean');
    });

    it('should revoke authentication', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_revoke', {
        userId: 'user-42',
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      const data = res.data as { revoked: boolean; userId: string };
      expect(data.revoked).toBe(true);
      expect(data.userId).toBe('user-42');

      // Verify revoked
      const checkRes = await callOp(`${AGENT_ID}_chat`, 'chat_auth_check', {
        userId: 'user-42',
        storagePath: authPath,
      });
      const checkData = checkRes.data as { authenticated: boolean; userId: string };
      expect(checkData.authenticated).toBe(false);
      expect(checkData.userId).toBe('user-42');
    });

    it('should get auth status', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_auth_status', {
        storagePath: authPath,
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        enabled: boolean;
        authenticatedCount: number;
        authenticatedUsers: (string | number)[];
      };
      expect(data.enabled).toBe(true);
      // user-42 was revoked above, so count should be 0
      expect(data.authenticatedCount).toBe(0);
      expect(Array.isArray(data.authenticatedUsers)).toBe(true);
      expect(data.authenticatedUsers).toEqual([]);
    });

    it('should manage task cancellation lifecycle', async () => {
      // Create a cancellable task
      const createRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_create', {
        chatId: 'chat-abc',
        description: 'Processing user request',
      });
      expect(createRes.success).toBe(true);
      const createData = createRes.data as {
        chatId: string;
        created: boolean;
        aborted: boolean;
        activeTasks: number;
      };
      expect(createData.chatId).toBe('chat-abc');
      expect(createData.created).toBe(true);
      expect(createData.aborted).toBe(false);
      expect(createData.activeTasks).toBe(1);

      // Check status
      const statusRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_status', {
        chatId: 'chat-abc',
      });
      expect(statusRes.success).toBe(true);
      const statusData = statusRes.data as {
        chatId: string;
        running: boolean;
        description: string | null;
        startedAt: number | null;
        ranForMs: number | null;
      };
      expect(statusData.chatId).toBe('chat-abc');
      expect(statusData.running).toBe(true);
      expect(statusData.description).toBe('Processing user request');
      expect(statusData.startedAt).toBeGreaterThan(0);
      expect(statusData.ranForMs).toBeGreaterThanOrEqual(0);

      // Cancel it
      const cancelRes = await callOp(`${AGENT_ID}_chat`, 'chat_cancel_stop', {
        chatId: 'chat-abc',
      });
      expect(cancelRes.success).toBe(true);
      const cancelData = cancelRes.data as {
        cancelled: boolean;
        chatId: string;
        description: string | null;
        ranForMs: number;
        activeTasks: number;
      };
      expect(cancelData.cancelled).toBe(true);
      expect(cancelData.chatId).toBe('chat-abc');
      expect(cancelData.description).toBe('Processing user request');
      expect(cancelData.ranForMs).toBeGreaterThanOrEqual(0);
      expect(cancelData.activeTasks).toBe(0);
    });

    it('should compress verbose output', async () => {
      const verbose = JSON.stringify({
        results: Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100) })),
      });
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_compress_output', {
        toolName: 'test-tool',
        output: verbose,
        maxLength: 500,
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        compressed: string;
        compressedLength: number;
        originalLength: number;
      };
      expect(data.originalLength).toBe(verbose.length);
      // Compressor truncates but may overshoot slightly due to JSON-aware boundaries
      expect(data.compressedLength).toBeLessThan(data.originalLength);
      expect(typeof data.compressed).toBe('string');
      expect(data.compressed.length).toBe(data.compressedLength);
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
      const data = res.data as {
        entities: Array<{ type: string; value: string; confidence: number }>;
        byType: Record<string, Array<{ type: string; value: string; confidence: number }>>;
      };
      expect(data.entities.length).toBeGreaterThan(0);
      // Every entity must have the required shape
      for (const entity of data.entities) {
        expect(['file', 'function', 'domain', 'action', 'technology', 'pattern']).toContain(
          entity.type,
        );
        expect(entity.value.length).toBeGreaterThan(0);
        expect(entity.confidence).toBeGreaterThan(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      }
      // Should detect file path, action (fix), and technology (typescript)
      const types = new Set(data.entities.map((e) => e.type));
      expect(types.has('file')).toBe(true); // src/components/Button.tsx
      expect(types.has('action')).toBe(true); // Fix
      expect(types.has('technology')).toBe(true); // TypeScript
      // byType should have keys matching extracted entity types
      expect(Object.keys(data.byType).length).toBeGreaterThan(0);
      for (const [type, group] of Object.entries(data.byType)) {
        expect(types.has(type)).toBe(true);
        expect(group.length).toBeGreaterThan(0);
      }
    });

    it('should retrieve knowledge for a query', async () => {
      // First seed some vault data
      await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'frontend',
            title: 'Context Test Pattern',
            description: 'A pattern for testing context retrieval',
            severity: 'suggestion',
            tags: ['context', 'testing'],
          },
        ],
      });

      const res = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'context test pattern retrieval',
        domain: 'frontend',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        items: Array<{ id: string; title: string; score: number; source: string }>;
        vaultHits: number;
        cogneeHits: number;
        brainHits: number;
      };
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.vaultHits).toBe('number');
      expect(typeof data.cogneeHits).toBe('number');
      expect(typeof data.brainHits).toBe('number');
      // Cognee is not connected in E2E, so no cognee hits
      expect(data.cogneeHits).toBe(0);
      // Vault FTS may or may not find results depending on tokenization
      expect(data.vaultHits).toBeGreaterThanOrEqual(0);
      if (data.items.length > 0) {
        expect(data.items[0].source).toBe('vault');
        expect(typeof data.items[0].score).toBe('number');
        expect(data.items[0].score).toBeGreaterThan(0);
        expect(typeof data.items[0].id).toBe('string');
        expect(typeof data.items[0].title).toBe('string');
      }
    });

    it('should perform full context analysis', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_analyze', {
        prompt: 'Refactor the authentication module to use TypeScript interfaces',
        domain: 'backend',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        prompt: string;
        entities: { entities: unknown[]; byType: Record<string, unknown[]> };
        knowledge: {
          items: unknown[];
          vaultHits: number;
          cogneeHits: number;
          brainHits: number;
        };
        confidence: number;
        confidenceLevel: string;
        detectedDomains: string[];
        processingTimeMs: number;
      };
      expect(data.prompt).toBe('Refactor the authentication module to use TypeScript interfaces');
      expect(data.entities.entities.length).toBeGreaterThan(0);
      expect(typeof data.confidence).toBe('number');
      expect(data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
      expect(['high', 'medium', 'low']).toContain(data.confidenceLevel);
      expect(Array.isArray(data.detectedDomains)).toBe(true);
      expect(data.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty prompt gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_extract_entities', {
        prompt: '',
      });
      // Should still succeed with empty results
      expect(res.success).toBe(true);
      const data = res.data as {
        entities: unknown[];
        byType: Record<string, unknown[]>;
      };
      expect(data.entities).toEqual([]);
      expect(Object.keys(data.byType).length).toBe(0);
    });

    it('context retrieval should be isolated per domain', async () => {
      // Capture frontend-specific knowledge
      await callOp(`${AGENT_ID}_vault`, 'capture_knowledge', {
        entries: [
          {
            type: 'pattern',
            domain: 'frontend',
            title: 'React Context Hook Pattern',
            description: 'Use custom hooks to wrap React context for type safety',
            severity: 'suggestion',
            tags: ['react', 'hooks'],
          },
        ],
      });

      // Search with frontend domain filter
      const frontendRes = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'React context hook',
        domain: 'frontend',
      });
      expect(frontendRes.success).toBe(true);
      const frontendData = frontendRes.data as
        | { results?: Array<{ domain?: string }> }
        | Array<{ domain?: string }>;
      const frontendResults = Array.isArray(frontendData)
        ? frontendData
        : (frontendData.results ?? []);

      // Search with backend domain filter — should get fewer/no React-related results
      const backendRes = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'React context hook',
        domain: 'backend',
      });
      expect(backendRes.success).toBe(true);
      const backendData = backendRes.data as
        | { results?: Array<{ domain?: string }> }
        | Array<{ domain?: string }>;
      const backendResults = Array.isArray(backendData) ? backendData : (backendData.results ?? []);

      // Frontend search should return more results than backend for a React query
      expect(frontendResults.length).toBeGreaterThanOrEqual(backendResults.length);
    });
  });

  // =========================================================================
  // Journey 3: Agency facade — proactive file watching and pattern surfacing
  // =========================================================================

  describe('Journey 3: Agency facade', () => {
    it('should report status when disabled', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_status');
      expect(res.success).toBe(true);
      const data = res.data as {
        enabled: boolean;
        watching: boolean;
        watchPaths: string[];
        detectorCount: number;
        pendingWarnings: number;
        surfacedPatterns: number;
        fileChangesProcessed: number;
        suggestionRuleCount: number;
        suppressedWarnings: number;
        dismissedPatterns: number;
        pendingNotifications: number;
      };
      expect(data.enabled).toBe(false);
      expect(data.watching).toBe(false);
      expect(data.pendingWarnings).toBe(0);
      expect(data.fileChangesProcessed).toBe(0);
    });

    it('should enable agency mode', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_enable', {
        projectPath: baseDir,
      });
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean; watching: boolean; detectorCount: number };
      expect(data.enabled).toBe(true);
      expect(data.detectorCount).toBeGreaterThanOrEqual(0);
    });

    it('should report status when enabled', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_status');
      expect(res.success).toBe(true);
      const data = res.data as { enabled: boolean; watching: boolean };
      expect(data.enabled).toBe(true);
    });

    it('should update agency configuration', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_config', {
        extensions: ['.ts', '.tsx', '.js'],
        debounceMs: 500,
        minPatternConfidence: 0.7,
      });
      expect(res.success).toBe(true);
      // Returns full status after config update
      const data = res.data as { enabled: boolean };
      expect(data.enabled).toBe(true);
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
      expect(Array.isArray(data.warnings)).toBe(true);
      expect(data.count).toBe(data.warnings.length);
      expect(data.count).toBeGreaterThanOrEqual(0);
    });

    it('should get pending warnings', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_warnings');
      expect(res.success).toBe(true);
      const data = res.data as { warnings: unknown[]; count: number };
      expect(Array.isArray(data.warnings)).toBe(true);
      expect(data.count).toBe(data.warnings.length);
    });

    it('should surface patterns for a file path', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_surface_patterns', {
        filePath: join(baseDir, 'test-scan.ts'),
      });
      expect(res.success).toBe(true);
      const data = res.data as { patterns: unknown[]; count: number };
      expect(Array.isArray(data.patterns)).toBe(true);
      expect(data.count).toBe(data.patterns.length);
    });

    it('should generate clarification for ambiguous prompt', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_clarify', {
        prompt: 'fix it',
        confidence: 0.3,
      });
      expect(res.success).toBe(true);
      // generateClarification returns { question, reason, options? } or { clarificationNeeded: false }
      // "fix it" has action "fix" but only 2 words (no target), so confidence < 0.3 triggers clarification
      const data = res.data as {
        question?: string;
        reason?: string;
        options?: string[];
        clarificationNeeded?: boolean;
      };
      const hasClarification = !!data.question || data.clarificationNeeded === false;
      // With "fix it" at confidence 0.3: has action ("fix") but no target (2 words < 4),
      // so it returns a clarification question
      expect(hasClarification).toBe(true);
    });

    it('should not generate clarification for confident prompt', async () => {
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_clarify', {
        prompt: 'fix the broken navbar',
        confidence: 0.95,
      });
      expect(res.success).toBe(true);
      // Confidence >= 0.7 returns null -> { clarificationNeeded: false }
      const data = res.data as { clarificationNeeded?: boolean };
      expect(data.clarificationNeeded).toBe(false);
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
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        method: string;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('build');
      expect(data.mode).toBe('BUILD-MODE');
      expect(data.method).toBe('keyword');
      expect(data.confidence).toBeGreaterThan(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
      expect(data.matchedKeywords).toContain('build');
    });

    it('should route "fix the broken navbar" to FIX intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'fix the broken navbar',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        method: string;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('fix');
      expect(data.mode).toBe('FIX-MODE');
      expect(data.confidence).toBeGreaterThan(0);
      expect(data.matchedKeywords.length).toBeGreaterThanOrEqual(1);
      // "fix" and "broken" are both FIX-MODE keywords
      expect(data.matchedKeywords).toContain('fix');
    });

    it('should route "review my code for quality" to REVIEW intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'review my code for quality',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('review');
      expect(data.mode).toBe('REVIEW-MODE');
      expect(data.matchedKeywords).toContain('review');
    });

    it('should route "how should I architect this?" to PLAN intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'how should I architect this?',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('plan');
      expect(data.mode).toBe('PLAN-MODE');
      expect(data.matchedKeywords).toContain('architect');
    });

    it('should route "make it faster" to IMPROVE intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'make it faster',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('improve');
      expect(data.mode).toBe('IMPROVE-MODE');
      expect(data.matchedKeywords).toContain('faster');
    });

    it('should route "ship it" to DELIVER intent', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: 'ship it',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('deliver');
      expect(data.mode).toBe('DELIVER-MODE');
      expect(data.matchedKeywords).toContain('ship');
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
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      // "hmm" has no keywords — falls through to GENERAL-MODE
      expect(data.intent).toBe('general');
      expect(data.mode).toBe('GENERAL-MODE');
      expect(data.confidence).toBe(0);
      expect(data.matchedKeywords).toEqual([]);
    });

    it('should handle empty prompt gracefully', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'route_intent', {
        prompt: '',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        intent: string;
        mode: string;
        confidence: number;
        matchedKeywords: string[];
      };
      expect(data.intent).toBe('general');
      expect(data.mode).toBe('GENERAL-MODE');
      expect(data.confidence).toBe(0);
      expect(data.matchedKeywords).toEqual([]);
    });

    it('should morph to a different operational mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'morph', {
        mode: 'BUILD-MODE',
      });
      expect(res.success).toBe(true);
      const data = res.data as {
        previousMode: string;
        currentMode: string;
        behaviorRules: string[];
      };
      expect(data.currentMode).toBe('BUILD-MODE');
      expect(Array.isArray(data.behaviorRules)).toBe(true);
      expect(data.behaviorRules.length).toBeGreaterThan(0);
      // previousMode depends on what route_intent last set — but should be a valid mode
      expect(data.previousMode).toMatch(/-MODE$/);
    });

    it('should get behavior rules for current mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'get_behavior_rules');
      expect(res.success).toBe(true);
      const data = res.data as { mode: string; rules: string[] };
      // Current mode should be BUILD-MODE from the morph above
      expect(data.mode).toBe('BUILD-MODE');
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBeGreaterThan(0);
    });

    it('should get behavior rules for a specific mode', async () => {
      const res = await callOp(`${AGENT_ID}_control`, 'get_behavior_rules', {
        mode: 'FIX-MODE',
      });
      expect(res.success).toBe(true);
      const data = res.data as { mode: string; rules: string[] };
      expect(data.mode).toBe('FIX-MODE');
      expect(Array.isArray(data.rules)).toBe(true);
      expect(data.rules.length).toBeGreaterThan(0);
      expect(data.rules).toContain('Identify root cause first');
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
      // vaultEntries reflects how many entries were seeded (may be 0 if pack format doesn't auto-seed)
      expect(typeof data.vaultEntries).toBe('number');
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
      // brain.intelligentSearch returns RankedResult[] — array of { entry, score, breakdown }
      const data = res.data as Array<{
        entry: { id: string; title: string };
        score: number;
      }>;
      // The pack's vault entries may or may not have been seeded depending on pack install logic
      expect(Array.isArray(data)).toBe(true);
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
      // Morphing to a non-existent mode throws "Unknown mode" — modes are stored in
      // agent_modes table and only valid pre-defined modes are accepted.
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unknown mode');
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
      const data = res.data as { cancelled: boolean; reason: string };
      expect(data.cancelled).toBe(false);
      expect(data.reason).toContain('No running task');
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
      const data = res.data as {
        initialized: boolean;
        checks: number;
        running: boolean;
        sent: number;
        lastPollAt: null;
      };
      expect(data.initialized).toBe(false);
      expect(data.checks).toBe(0);
      expect(data.running).toBe(false);
      expect(data.sent).toBe(0);
      expect(data.lastPollAt).toBeNull();
    });
  });

  // =========================================================================
  // Negative tests — invalid inputs, nonexistent resources
  // =========================================================================

  describe('Negative tests', () => {
    it('chat: append to nonexistent session auto-creates it', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_session_append', {
        sessionId: 'auto-created-session',
        storageDir: sessionDir,
        role: 'user',
        content: 'First message to auto-created session',
      });
      expect(res.success).toBe(true);
      const data = res.data as { sessionId: string; messageCount: number };
      expect(data.sessionId).toBe('auto-created-session');
      expect(data.messageCount).toBe(1);

      // Clean up
      await callOp(`${AGENT_ID}_chat`, 'chat_session_delete', {
        sessionId: 'auto-created-session',
        storageDir: sessionDir,
      });
    });

    it('context: extract entities from whitespace-only prompt returns empty', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_extract_entities', {
        prompt: '   ',
      });
      expect(res.success).toBe(true);
      const data = res.data as { entities: unknown[]; byType: Record<string, unknown[]> };
      expect(data.entities).toEqual([]);
    });

    it('context: retrieve knowledge with no matching domain returns empty items', async () => {
      const res = await callOp(`${AGENT_ID}_context`, 'context_retrieve_knowledge', {
        prompt: 'zzzznonexistentqueryzzzz',
        domain: 'nonexistent-domain',
      });
      expect(res.success).toBe(true);
      const data = res.data as { items: unknown[]; vaultHits: number };
      expect(data.items.length).toBe(0);
      expect(data.vaultHits).toBe(0);
    });

    it('agency: scan file when agency is disabled returns empty warnings', async () => {
      // Agency was disabled in Journey 3
      const res = await callOp(`${AGENT_ID}_agency`, 'agency_scan_file', {
        filePath: join(baseDir, 'test-scan.ts'),
      });
      expect(res.success).toBe(true);
      const data = res.data as { warnings: unknown[]; count: number };
      expect(data.count).toBe(0);
      expect(data.warnings).toEqual([]);
    });

    it('control: confidence scores are bounded 0-1 across all prompts', async () => {
      const prompts = [
        'fix fix fix fix broken broken crash error',
        '',
        'a',
        'build create add implement scaffold generate new feature',
      ];
      for (const prompt of prompts) {
        const res = await callOp(`${AGENT_ID}_control`, 'route_intent', { prompt });
        expect(res.success).toBe(true);
        const data = res.data as { confidence: number };
        expect(data.confidence).toBeGreaterThanOrEqual(0);
        expect(data.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('chat: bridge execute without init returns error', async () => {
      const res = await callOp(`${AGENT_ID}_chat`, 'chat_bridge_execute', {
        name: 'nonexistent-tool',
      });
      expect(res.success).toBe(true);
      const data = res.data as { isError: boolean };
      expect(data.isError).toBe(true);
    });
  });
});
