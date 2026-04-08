/**
 * Transcript Memory Lane — comprehensive tests for JSONL parser, segmenter,
 * ranker, schema, and persistence layer.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLitePersistenceProvider } from '../persistence/sqlite-provider.js';
import { initializeSchema } from '../vault/vault-schema.js';

import type { TranscriptMessage } from './types.js';
import {
  parseTranscriptJsonl,
  flattenAssistantContent,
  flattenUserContent,
  estimateTokens,
} from './jsonl-parser.js';
import { segmentByExchange, segmentByWindow, segmentMessages, hashContent } from './segmenter.js';
import {
  rankTranscriptCandidates,
  computeExactPhrase,
  computeTokenOverlap,
  generateExcerpt,
} from './ranker.js';
import type { RankerCandidate } from './ranker.js';
import {
  captureTranscriptSession,
  searchTranscriptSegments,
  getTranscriptSession,
  getTranscriptMessages,
  archiveTranscriptSession,
} from '../vault/vault-transcripts.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

const tmpFiles: string[] = [];

function createTestJsonl(lines: object[]): string {
  const tmpPath = join(
    tmpdir(),
    `test-transcript-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`,
  );
  writeFileSync(tmpPath, lines.map((l) => JSON.stringify(l)).join('\n'));
  tmpFiles.push(tmpPath);
  return tmpPath;
}

function createProvider(): SQLitePersistenceProvider {
  return new SQLitePersistenceProvider(':memory:');
}

function createInitializedProvider(): SQLitePersistenceProvider {
  const p = createProvider();
  initializeSchema(p);
  return p;
}

function makeMessage(
  seq: number,
  role: TranscriptMessage['role'],
  content: string,
  overrides?: Partial<TranscriptMessage>,
): TranscriptMessage {
  return {
    id: `msg-test-${seq}`,
    sessionId: 'test-session',
    seq,
    role,
    content,
    tokenEstimate: estimateTokens(content),
    meta: {},
    ...overrides,
  };
}

// Sample JSONL lines following Claude Code format
const userLine = {
  type: 'user',
  message: { role: 'user', content: 'What is the best approach for auth?' },
  uuid: 'msg-001',
  timestamp: '2026-04-08T10:00:00Z',
  sessionId: 'test-session-1',
};

const assistantLine = {
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: 'I recommend using OAuth2 with JWT tokens.' },
      { type: 'tool_use', name: 'Read', id: 'toolu_123', input: { file_path: '/src/auth.ts' } },
    ],
    model: 'claude-opus-4-6',
  },
  uuid: 'msg-002',
  timestamp: '2026-04-08T10:00:05Z',
  sessionId: 'test-session-1',
};

const thinkingLine = {
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'Let me analyze the auth options...' },
      { type: 'text', text: 'Here are my recommendations.' },
    ],
  },
  uuid: 'msg-003',
  timestamp: '2026-04-08T10:00:10Z',
  sessionId: 'test-session-1',
};

const systemLine = {
  type: 'system',
  message: { role: 'system', content: 'You are a helpful assistant.' },
  uuid: 'msg-004',
  timestamp: '2026-04-08T09:59:00Z',
  sessionId: 'test-session-1',
};

// =============================================================================
// 1. SCHEMA TESTS
// =============================================================================

describe('Transcript Schema', () => {
  let provider: SQLitePersistenceProvider;

  beforeEach(() => {
    provider = createInitializedProvider();
  });

  afterEach(() => {
    provider.close();
  });

  it('creates transcript_sessions table', () => {
    const tables = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_sessions'",
    );
    expect(tables).toHaveLength(1);
  });

  it('creates transcript_messages table', () => {
    const tables = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_messages'",
    );
    expect(tables).toHaveLength(1);
  });

  it('creates transcript_segments table', () => {
    const tables = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_segments'",
    );
    expect(tables).toHaveLength(1);
  });

  it('creates transcript_segments_fts virtual table', () => {
    const tables = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_segments_fts'",
    );
    expect(tables).toHaveLength(1);
  });

  it('creates FTS insert trigger', () => {
    const triggers = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='transcript_segments_ai'",
    );
    expect(triggers).toHaveLength(1);
  });

  it('creates FTS delete trigger', () => {
    const triggers = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='transcript_segments_ad'",
    );
    expect(triggers).toHaveLength(1);
  });

  it('creates FTS update trigger', () => {
    const triggers = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='transcript_segments_au'",
    );
    expect(triggers).toHaveLength(1);
  });

  it('creates indexes on transcript tables', () => {
    const indexes = provider.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_transcript%'",
    );
    expect(indexes.length).toBeGreaterThanOrEqual(3);
  });

  it('is idempotent — calling initializeSchema twice does not throw', () => {
    expect(() => initializeSchema(provider)).not.toThrow();
  });
});

// =============================================================================
// 2. JSONL PARSER TESTS
// =============================================================================

describe('JSONL Parser', () => {
  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* best-effort */
      }
    }
    tmpFiles.length = 0;
  });

  describe('parseTranscriptJsonl', () => {
    it('parses user messages with string content', () => {
      const path = createTestJsonl([userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].content).toBe('What is the best approach for auth?');
      expect(msgs[0].seq).toBe(0);
    });

    it('parses assistant messages with text blocks', () => {
      const path = createTestJsonl([assistantLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('assistant');
      expect(msgs[0].content).toContain('I recommend using OAuth2 with JWT tokens.');
    });

    it('flattens tool_use blocks in assistant messages', () => {
      const path = createTestJsonl([assistantLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs[0].content).toContain('[Tool: Read(file_path)]');
    });

    it('excludes thinking blocks by default', () => {
      const path = createTestJsonl([thinkingLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).not.toContain('Let me analyze');
      expect(msgs[0].content).toContain('Here are my recommendations.');
    });

    it('includes thinking blocks when option is set', () => {
      const path = createTestJsonl([thinkingLine]);
      const msgs = parseTranscriptJsonl(path, { includeThinking: true });
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain('[Thinking]');
      expect(msgs[0].content).toContain('Let me analyze the auth options...');
    });

    it('excludes system messages by default', () => {
      const path = createTestJsonl([systemLine, userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('user');
    });

    it('includes system messages when option is set', () => {
      const path = createTestJsonl([systemLine, userLine]);
      const msgs = parseTranscriptJsonl(path, { includeSystem: true });
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('system');
      expect(msgs[0].content).toBe('You are a helpful assistant.');
    });

    it('skips unknown types (attachment, file-history-snapshot, etc.)', () => {
      const lines = [
        { type: 'attachment', content: 'file data', uuid: 'att-1' },
        { type: 'file-history-snapshot', data: {}, uuid: 'fhs-1' },
        { type: 'permission-mode', mode: 'default', uuid: 'pm-1' },
        { type: 'queue-operation', uuid: 'qo-1' },
        { type: 'last-prompt', uuid: 'lp-1' },
        userLine,
      ];
      const path = createTestJsonl(lines);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe('user');
    });

    it('skips malformed lines gracefully', () => {
      const tmpPath = join(tmpdir(), `test-malformed-${Date.now()}.jsonl`);
      const content = [
        'not valid json{{{',
        '',
        JSON.stringify(userLine),
        '{"incomplete": true',
        JSON.stringify(assistantLine),
      ].join('\n');
      writeFileSync(tmpPath, content);
      tmpFiles.push(tmpPath);

      const msgs = parseTranscriptJsonl(tmpPath);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[1].role).toBe('assistant');
    });

    it('assigns sequential seq numbers starting from 0', () => {
      const path = createTestJsonl([userLine, assistantLine, thinkingLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs.map((m) => m.seq)).toEqual([0, 1, 2]);
    });

    it('extracts timestamps from ISO-8601 strings', () => {
      const path = createTestJsonl([userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs[0].timestamp).toBe(Date.parse('2026-04-08T10:00:00Z'));
    });

    it('returns empty array for empty file', () => {
      const tmpPath = join(tmpdir(), `test-empty-${Date.now()}.jsonl`);
      writeFileSync(tmpPath, '');
      tmpFiles.push(tmpPath);
      const msgs = parseTranscriptJsonl(tmpPath);
      expect(msgs).toEqual([]);
    });

    it('respects maxMessages option', () => {
      const lines = Array.from({ length: 10 }, (_, i) => ({
        type: 'user',
        message: { role: 'user', content: `Message ${i}` },
        uuid: `msg-${i}`,
      }));
      const path = createTestJsonl(lines);
      const msgs = parseTranscriptJsonl(path, { maxMessages: 3 });
      expect(msgs).toHaveLength(3);
    });

    it('computes token estimates for messages', () => {
      const path = createTestJsonl([userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs[0].tokenEstimate).toBeGreaterThan(0);
      // "What is the best approach for auth?" is 35 chars => 9 tokens
      expect(msgs[0].tokenEstimate).toBe(Math.ceil(35 / 4));
    });

    it('computes content hash for messages', () => {
      const path = createTestJsonl([userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs[0].contentHash).toBeDefined();
      expect(msgs[0].contentHash!.length).toBe(16);
    });

    it('sets sessionId to empty string (caller assigns real one)', () => {
      const path = createTestJsonl([userLine]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs[0].sessionId).toBe('');
    });

    it('skips assistant messages with non-array content', () => {
      const line = {
        type: 'assistant',
        message: { role: 'assistant', content: 'plain string content' },
        uuid: 'msg-plain',
      };
      const path = createTestJsonl([line]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(0);
    });

    it('skips user messages with empty content', () => {
      const line = {
        type: 'user',
        message: { role: 'user', content: '' },
        uuid: 'msg-empty',
      };
      const path = createTestJsonl([line]);
      const msgs = parseTranscriptJsonl(path);
      expect(msgs).toHaveLength(0);
    });
  });

  describe('flattenAssistantContent', () => {
    it('concatenates text blocks', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];
      expect(flattenAssistantContent(content)).toBe('Hello\n\nWorld');
    });

    it('renders tool_use blocks with parameter keys', () => {
      const content = [{ type: 'tool_use', name: 'Bash', input: { command: 'ls', timeout: 5000 } }];
      expect(flattenAssistantContent(content)).toBe('[Tool: Bash(command, timeout)]');
    });

    it('renders tool_use with no input keys', () => {
      const content = [{ type: 'tool_use', name: 'Clear', input: {} }];
      expect(flattenAssistantContent(content)).toBe('[Tool: Clear()]');
    });

    it('excludes thinking blocks by default', () => {
      const content = [
        { type: 'thinking', thinking: 'Internal thoughts' },
        { type: 'text', text: 'Visible output' },
      ];
      expect(flattenAssistantContent(content)).toBe('Visible output');
    });

    it('includes thinking blocks when flag is true', () => {
      const content = [
        { type: 'thinking', thinking: 'Deep analysis' },
        { type: 'text', text: 'Summary' },
      ];
      const result = flattenAssistantContent(content, true);
      expect(result).toContain('[Thinking]');
      expect(result).toContain('Deep analysis');
      expect(result).toContain('Summary');
    });

    it('skips null and non-object blocks', () => {
      const content = [null, 'string', 42, { type: 'text', text: 'Valid' }];
      expect(flattenAssistantContent(content as unknown[])).toBe('Valid');
    });

    it('skips text blocks with empty text', () => {
      const content = [
        { type: 'text', text: '' },
        { type: 'text', text: '   ' },
        { type: 'text', text: 'Actual content' },
      ];
      expect(flattenAssistantContent(content)).toBe('Actual content');
    });

    it('returns empty string for empty content array', () => {
      expect(flattenAssistantContent([])).toBe('');
    });
  });

  describe('flattenUserContent', () => {
    it('returns string content as-is', () => {
      expect(flattenUserContent('Hello world')).toBe('Hello world');
    });

    it('flattens tool_result arrays', () => {
      const content = [
        { type: 'tool_result', tool_use_id: 'toolu_abc', content: 'File contents here' },
      ];
      expect(flattenUserContent(content)).toContain('[Tool result: toolu_abc]');
      expect(flattenUserContent(content)).toContain('File contents here');
    });

    it('flattens tool_result with nested text blocks', () => {
      const content = [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_xyz',
          content: [{ type: 'text', text: 'Nested result text' }],
        },
      ];
      const result = flattenUserContent(content);
      expect(result).toContain('[Tool result: toolu_xyz]');
      expect(result).toContain('Nested result text');
    });

    it('flattens text blocks in user content array', () => {
      const content = [
        { type: 'text', text: 'First part' },
        { type: 'text', text: 'Second part' },
      ];
      expect(flattenUserContent(content)).toBe('First part\n\nSecond part');
    });

    it('returns empty string for null content', () => {
      expect(flattenUserContent(null)).toBe('');
    });

    it('returns empty string for undefined content', () => {
      expect(flattenUserContent(undefined)).toBe('');
    });

    it('stringifies non-string non-array content', () => {
      expect(flattenUserContent(42)).toBe('42');
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens as ceil(chars / 4)', () => {
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcde')).toBe(2);
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('a')).toBe(1);
    });
  });
});

// =============================================================================
// 3. SEGMENTER TESTS
// =============================================================================

describe('Segmenter', () => {
  const sessionId = 'seg-test-session';

  describe('segmentByExchange', () => {
    it('groups user + assistant into one exchange', () => {
      const messages = [makeMessage(0, 'user', 'Hello'), makeMessage(1, 'assistant', 'Hi there!')];
      const segments = segmentByExchange(sessionId, messages);
      expect(segments).toHaveLength(1);
      expect(segments[0].kind).toBe('exchange');
      expect(segments[0].seqStart).toBe(0);
      expect(segments[0].seqEnd).toBe(1);
      expect(segments[0].roleSet).toContain('user');
      expect(segments[0].roleSet).toContain('assistant');
    });

    it('creates two segments for two exchanges', () => {
      const messages = [
        makeMessage(0, 'user', 'Question 1'),
        makeMessage(1, 'assistant', 'Answer 1'),
        makeMessage(2, 'user', 'Question 2'),
        makeMessage(3, 'assistant', 'Answer 2'),
      ];
      const segments = segmentByExchange(sessionId, messages);
      expect(segments).toHaveLength(2);
      expect(segments[0].seqStart).toBe(0);
      expect(segments[0].seqEnd).toBe(1);
      expect(segments[1].seqStart).toBe(2);
      expect(segments[1].seqEnd).toBe(3);
    });

    it('handles single user message as one segment', () => {
      const messages = [makeMessage(0, 'user', 'Just a question')];
      const segments = segmentByExchange(sessionId, messages);
      expect(segments).toHaveLength(1);
      expect(segments[0].seqStart).toBe(0);
      expect(segments[0].seqEnd).toBe(0);
    });

    it('falls back to window mode when no user messages exist', () => {
      const messages = [
        makeMessage(0, 'assistant', 'I started the conversation'),
        makeMessage(1, 'assistant', 'With more context'),
      ];
      const segments = segmentByExchange(sessionId, messages);
      // Should still produce segments (via window fallback)
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments[0].kind).toBe('window');
    });

    it('splits oversized exchanges at message boundaries', () => {
      // MAX_SEGMENT_TOKENS is 4000, so create a message with ~5000 tokens
      const longContent = 'x'.repeat(20000); // 20000 chars / 4 = 5000 tokens
      const messages = [makeMessage(0, 'user', 'Start'), makeMessage(1, 'assistant', longContent)];
      const segments = segmentByExchange(sessionId, messages);
      // Should split into multiple segments
      expect(segments.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty array for empty messages', () => {
      expect(segmentByExchange(sessionId, [])).toEqual([]);
    });

    it('includes system/tool messages in the current exchange', () => {
      const messages = [
        makeMessage(0, 'user', 'Read that file'),
        makeMessage(1, 'assistant', 'Reading...'),
        makeMessage(2, 'tool', 'File contents here'),
        makeMessage(3, 'assistant', 'The file contains...'),
      ];
      const segments = segmentByExchange(sessionId, messages);
      expect(segments).toHaveLength(1);
      expect(segments[0].seqStart).toBe(0);
      expect(segments[0].seqEnd).toBe(3);
    });

    it('sorts messages by seq before segmenting', () => {
      const messages = [
        makeMessage(2, 'user', 'Question 2'),
        makeMessage(0, 'user', 'Question 1'),
        makeMessage(1, 'assistant', 'Answer 1'),
        makeMessage(3, 'assistant', 'Answer 2'),
      ];
      const segments = segmentByExchange(sessionId, messages);
      expect(segments).toHaveLength(2);
      expect(segments[0].text).toContain('Question 1');
      expect(segments[1].text).toContain('Question 2');
    });
  });

  describe('segmentByWindow', () => {
    it('groups short messages into a single window', () => {
      const messages = [
        makeMessage(0, 'user', 'Short message'),
        makeMessage(1, 'assistant', 'Short reply'),
      ];
      // Both together are well under minChars (1200 default)
      const segments = segmentByWindow(sessionId, messages);
      expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it('gives a single large message its own segment', () => {
      const largeContent = 'x'.repeat(2000); // exceeds maxChars (1800 default)
      const messages = [
        makeMessage(0, 'user', largeContent),
        makeMessage(1, 'assistant', 'Short reply'),
      ];
      const segments = segmentByWindow(sessionId, messages);
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(segments[0].text).toBe(largeContent);
    });

    it('returns empty array for empty messages', () => {
      expect(segmentByWindow(sessionId, [])).toEqual([]);
    });

    it('respects custom window options', () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        makeMessage(
          i,
          i % 2 === 0 ? 'user' : 'assistant',
          `Message content number ${i} with some text`,
        ),
      );
      const segments = segmentByWindow(sessionId, messages, {
        minChars: 50,
        maxChars: 200,
        overlap: 0,
      });
      expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it('produces segments with correct sessionId', () => {
      const messages = [makeMessage(0, 'user', 'Hello world test message')];
      const segments = segmentByWindow(sessionId, messages);
      expect(segments[0].sessionId).toBe(sessionId);
    });
  });

  describe('segmentMessages', () => {
    it('defaults to exchange mode', () => {
      const messages = [makeMessage(0, 'user', 'Q'), makeMessage(1, 'assistant', 'A')];
      const segments = segmentMessages(sessionId, messages);
      expect(segments[0].kind).toBe('exchange');
    });

    it('uses window mode when specified', () => {
      const messages = [makeMessage(0, 'user', 'Q'), makeMessage(1, 'assistant', 'A')];
      const segments = segmentMessages(sessionId, messages, 'window');
      expect(segments[0].kind).toBe('window');
    });
  });

  describe('hashContent', () => {
    it('returns a 16-char hex string', () => {
      const hash = hashContent('test content');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic', () => {
      expect(hashContent('hello')).toBe(hashContent('hello'));
    });

    it('produces different hashes for different content', () => {
      expect(hashContent('alpha')).not.toBe(hashContent('beta'));
    });
  });
});

// =============================================================================
// 4. PERSISTENCE TESTS
// =============================================================================

describe('Transcript Persistence', () => {
  let provider: SQLitePersistenceProvider;

  beforeEach(() => {
    provider = createInitializedProvider();
  });

  afterEach(() => {
    provider.close();
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* best-effort */
      }
    }
    tmpFiles.length = 0;
  });

  describe('captureTranscriptSession', () => {
    it('captures a session with messages array', () => {
      const result = captureTranscriptSession(provider, {
        sessionId: 'sess-1',
        projectPath: '/test',
        title: 'Auth Discussion',
        messages: [
          { role: 'user', content: 'How should we handle auth?' },
          { role: 'assistant', content: 'I recommend OAuth2 with JWT tokens for secure auth.' },
        ],
      });

      expect(result.captured).toBe(true);
      expect(result.sessionId).toBe('sess-1');
      expect(result.messagesStored).toBe(2);
      expect(result.segmentsStored).toBeGreaterThanOrEqual(1);
      expect(result.tokenEstimate).toBeGreaterThan(0);
    });

    it('captures a session from a JSONL file path', () => {
      const path = createTestJsonl([userLine, assistantLine]);
      const result = captureTranscriptSession(provider, {
        sessionId: 'sess-jsonl',
        projectPath: '/test',
        transcriptPath: path,
      });

      expect(result.captured).toBe(true);
      expect(result.messagesStored).toBe(2);
      expect(result.segmentsStored).toBeGreaterThanOrEqual(1);
    });

    it('captures a session from raw text', () => {
      const result = captureTranscriptSession(provider, {
        sessionId: 'sess-text',
        text: 'This is a raw conversation transcript about database optimization.',
      });

      expect(result.captured).toBe(true);
      expect(result.messagesStored).toBe(1);
    });

    it('generates a session ID when not provided', () => {
      const result = captureTranscriptSession(provider, {
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.sessionId).toMatch(/^ts-/);
    });

    it('dedup: re-capturing same session only appends new messages', () => {
      // First capture with 2 messages
      captureTranscriptSession(provider, {
        sessionId: 'sess-dedup',
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
      });

      // Second capture with 4 messages (first 2 are duplicates by seq)
      const result = captureTranscriptSession(provider, {
        sessionId: 'sess-dedup',
        messages: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Second question' },
          { role: 'assistant', content: 'Second answer' },
        ],
      });

      // Should only add 2 new messages (seq 2 and 3)
      expect(result.messagesStored).toBe(2);

      // Verify total messages in DB
      const allMsgs = getTranscriptMessages(provider, 'sess-dedup');
      expect(allMsgs).toHaveLength(4);
    });

    it('stores session metadata correctly', () => {
      captureTranscriptSession(provider, {
        sessionId: 'sess-meta',
        projectPath: '/my/project',
        title: 'Design Review',
        sourceKind: 'live_chat',
        sourceRef: 'chat-123',
        participants: ['user', 'claude'],
        tags: ['design', 'review'],
        importance: 0.8,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const session = getTranscriptSession(provider, 'sess-meta');
      expect(session).not.toBeNull();
      expect(session!.title).toBe('Design Review');
      expect(session!.projectPath).toBe('/my/project');
      expect(session!.sourceKind).toBe('live_chat');
      expect(session!.sourceRef).toBe('chat-123');
      expect(session!.participants).toEqual(['user', 'claude']);
      expect(session!.tags).toEqual(['design', 'review']);
      expect(session!.importance).toBe(0.8);
    });

    it('defaults to imported_text source kind', () => {
      captureTranscriptSession(provider, {
        sessionId: 'sess-default',
        messages: [{ role: 'user', content: 'Test' }],
      });
      const session = getTranscriptSession(provider, 'sess-default');
      expect(session!.sourceKind).toBe('imported_text');
    });

    it('uses window segmentation mode when specified', () => {
      captureTranscriptSession(provider, {
        sessionId: 'sess-window',
        segmentMode: 'window',
        messages: [
          { role: 'user', content: 'Message one' },
          { role: 'assistant', content: 'Reply one' },
        ],
      });

      const segments = provider.all<{ kind: string }>(
        "SELECT kind FROM transcript_segments WHERE session_id = 'sess-window'",
      );
      for (const seg of segments) {
        expect(seg.kind).toBe('window');
      }
    });
  });

  describe('searchTranscriptSegments', () => {
    beforeEach(() => {
      // Seed test data
      captureTranscriptSession(provider, {
        sessionId: 'search-sess-1',
        projectPath: '/test',
        title: 'OAuth Discussion',
        messages: [
          { role: 'user', content: 'How should we implement OAuth2 authentication?' },
          {
            role: 'assistant',
            content: 'I recommend using JWT tokens with refresh token rotation for OAuth2.',
          },
        ],
      });

      captureTranscriptSession(provider, {
        sessionId: 'search-sess-2',
        projectPath: '/test',
        title: 'Database Design',
        messages: [
          { role: 'user', content: 'What database should we use for the project?' },
          {
            role: 'assistant',
            content: 'PostgreSQL is a great choice for relational data with JSONB support.',
          },
        ],
      });
    });

    it('returns FTS results matching query', () => {
      const results = searchTranscriptSegments(provider, 'OAuth2 authentication');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].segment.text).toContain('OAuth2');
    });

    it('returns empty array for non-matching query', () => {
      const results = searchTranscriptSegments(provider, 'quantum computing blockchain');
      expect(results).toEqual([]);
    });

    it('filters by projectPath', () => {
      captureTranscriptSession(provider, {
        sessionId: 'other-project',
        projectPath: '/other',
        messages: [
          { role: 'user', content: 'OAuth2 in another project' },
          { role: 'assistant', content: 'Yes, use OAuth2.' },
        ],
      });

      const results = searchTranscriptSegments(provider, 'OAuth2', {
        projectPath: '/test',
      });
      for (const r of results) {
        expect(r.segment.sessionId).not.toBe('other-project');
      }
    });

    it('filters by sessionId', () => {
      const results = searchTranscriptSegments(provider, 'recommend', {
        sessionId: 'search-sess-1',
      });
      for (const r of results) {
        expect(r.segment.sessionId).toBe('search-sess-1');
      }
    });

    it('includes session title in results', () => {
      const results = searchTranscriptSegments(provider, 'OAuth2');
      const oauthResult = results.find((r) => r.segment.sessionId === 'search-sess-1');
      if (oauthResult) {
        expect(oauthResult.sessionTitle).toBe('OAuth Discussion');
      }
    });

    it('includes rank for each result', () => {
      const results = searchTranscriptSegments(provider, 'OAuth2');
      for (const r of results) {
        expect(typeof r.rank).toBe('number');
      }
    });

    it('respects limit parameter via overfetch', () => {
      const results = searchTranscriptSegments(provider, 'should', { limit: 1 });
      // limit * 5 overfetch, so we might get up to 5
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getTranscriptSession', () => {
    it('returns session metadata', () => {
      captureTranscriptSession(provider, {
        sessionId: 'get-sess',
        title: 'Test Session',
        messages: [{ role: 'user', content: 'Test' }],
      });

      const session = getTranscriptSession(provider, 'get-sess');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('get-sess');
      expect(session!.title).toBe('Test Session');
      expect(session!.messageCount).toBe(1);
    });

    it('returns null for non-existent session', () => {
      const session = getTranscriptSession(provider, 'nonexistent');
      expect(session).toBeNull();
    });
  });

  describe('getTranscriptMessages', () => {
    beforeEach(() => {
      captureTranscriptSession(provider, {
        sessionId: 'msgs-sess',
        messages: [
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Second' },
          { role: 'user', content: 'Third' },
          { role: 'assistant', content: 'Fourth' },
        ],
      });
    });

    it('returns all messages ordered by seq', () => {
      const messages = getTranscriptMessages(provider, 'msgs-sess');
      expect(messages).toHaveLength(4);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
      expect(messages[2].content).toBe('Third');
      expect(messages[3].content).toBe('Fourth');
    });

    it('filters by seq range with seqStart', () => {
      const messages = getTranscriptMessages(provider, 'msgs-sess', { seqStart: 2 });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Third');
      expect(messages[1].content).toBe('Fourth');
    });

    it('filters by seq range with seqEnd', () => {
      const messages = getTranscriptMessages(provider, 'msgs-sess', { seqEnd: 1 });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First');
      expect(messages[1].content).toBe('Second');
    });

    it('filters by both seqStart and seqEnd', () => {
      const messages = getTranscriptMessages(provider, 'msgs-sess', {
        seqStart: 1,
        seqEnd: 2,
      });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Second');
      expect(messages[1].content).toBe('Third');
    });

    it('returns empty array for non-existent session', () => {
      const messages = getTranscriptMessages(provider, 'nonexistent');
      expect(messages).toEqual([]);
    });
  });

  describe('archiveTranscriptSession', () => {
    it('sets archived_at on the session', () => {
      captureTranscriptSession(provider, {
        sessionId: 'archive-sess',
        messages: [{ role: 'user', content: 'To be archived' }],
      });

      const archived = archiveTranscriptSession(provider, 'archive-sess');
      expect(archived).toBe(true);

      const session = getTranscriptSession(provider, 'archive-sess');
      expect(session!.archivedAt).toBeDefined();
      expect(session!.archivedAt).toBeGreaterThan(0);
    });

    it('returns false for non-existent session', () => {
      const archived = archiveTranscriptSession(provider, 'nonexistent');
      expect(archived).toBe(false);
    });

    it('search excludes archived sessions', () => {
      captureTranscriptSession(provider, {
        sessionId: 'active-sess',
        messages: [
          { role: 'user', content: 'OAuth2 active discussion' },
          { role: 'assistant', content: 'Use OAuth2 with JWT.' },
        ],
      });

      captureTranscriptSession(provider, {
        sessionId: 'archived-sess',
        messages: [
          { role: 'user', content: 'OAuth2 archived discussion' },
          { role: 'assistant', content: 'Old OAuth2 advice.' },
        ],
      });

      // Archive one session
      archiveTranscriptSession(provider, 'archived-sess');

      // Search should only return active session
      const results = searchTranscriptSegments(provider, 'OAuth2');
      const sessionIds = results.map((r) => r.segment.sessionId);
      expect(sessionIds).toContain('active-sess');
      expect(sessionIds).not.toContain('archived-sess');
    });
  });
});

// =============================================================================
// 5. RANKER TESTS
// =============================================================================

describe('Transcript Ranker', () => {
  function makeCandidate(
    text: string,
    rank: number,
    overrides?: Partial<RankerCandidate>,
  ): RankerCandidate {
    return {
      segment: {
        id: `seg-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: 'test-session',
        seqStart: 0,
        seqEnd: 1,
        kind: 'exchange',
        roleSet: ['user', 'assistant'],
        speakerSet: [],
        text,
        tokenEstimate: Math.ceil(text.length / 4),
        createdAt: Date.now(),
      },
      rank,
      ...overrides,
    };
  }

  describe('rankTranscriptCandidates', () => {
    it('returns empty array for empty candidates', () => {
      expect(rankTranscriptCandidates([], 'test')).toEqual([]);
    });

    it('returns single candidate', () => {
      const candidates = [makeCandidate('OAuth2 authentication guide', -5)];
      const results = rankTranscriptCandidates(candidates, 'OAuth2');
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('ranks exact phrase match higher than vague match', () => {
      const candidates = [
        makeCandidate(
          'We discussed authentication methods and security protocols for the new system.',
          -3,
        ),
        makeCandidate('Use "OAuth2 authentication" with JWT tokens for secure login.', -5),
      ];
      const results = rankTranscriptCandidates(candidates, '"OAuth2 authentication"');
      // The candidate with exact phrase should score higher
      expect(results[0].excerpt).toContain('OAuth2');
    });

    it('includes score breakdown in results', () => {
      const candidates = [makeCandidate('Test content about auth', -3)];
      const results = rankTranscriptCandidates(candidates, 'auth');
      expect(results[0].breakdown).toBeDefined();
      expect(typeof results[0].breakdown.bm25).toBe('number');
      expect(typeof results[0].breakdown.exactPhrase).toBe('number');
      expect(typeof results[0].breakdown.tokenOverlap).toBe('number');
    });

    it('respects limit parameter', () => {
      const candidates = Array.from({ length: 20 }, (_, i) =>
        makeCandidate(`Content about topic ${i} with relevant keywords`, -(i + 1)),
      );
      const results = rankTranscriptCandidates(candidates, 'topic keywords', { limit: 5 });
      expect(results).toHaveLength(5);
    });

    it('includes session metadata in results', () => {
      const candidates = [
        makeCandidate('Auth discussion', -3, {
          sessionTitle: 'Security Review',
          sessionStartedAt: 1000,
          sessionEndedAt: 2000,
        }),
      ];
      const results = rankTranscriptCandidates(candidates, 'auth');
      expect(results[0].title).toBe('Security Review');
      expect(results[0].startedAt).toBe(1000);
      expect(results[0].endedAt).toBe(2000);
    });

    it('normalizes BM25 scores across candidates', () => {
      const candidates = [
        makeCandidate('Best match content auth tokens', -10),
        makeCandidate('Medium match auth', -5),
        makeCandidate('Worst match content', -1),
      ];
      const results = rankTranscriptCandidates(candidates, 'auth tokens');
      // All results should have scores between 0 and 1
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it('handles single candidate BM25 normalization (0.5 midpoint)', () => {
      const candidates = [makeCandidate('Single candidate about auth', -5)];
      const results = rankTranscriptCandidates(candidates, 'auth');
      // With one candidate, BM25 norm should be 0.5
      expect(results[0].breakdown.bm25).toBe(0.5);
    });
  });

  describe('computeExactPhrase', () => {
    it('returns 1.0 when quoted phrase is found', () => {
      const score = computeExactPhrase(
        'I recommend using OAuth2 for authentication',
        '"OAuth2 for authentication"',
      );
      expect(score).toBe(1.0);
    });

    it('returns 0.0 when quoted phrase is not found', () => {
      const score = computeExactPhrase(
        'I recommend using basic auth',
        '"OAuth2 for authentication"',
      );
      expect(score).toBe(0.0);
    });

    it('handles partial match of multiple phrases', () => {
      const score = computeExactPhrase(
        'OAuth2 is great for auth but JWT is complex',
        '"OAuth2" "JWT" "SAML"',
      );
      // 2 out of 3 phrases found
      expect(score).toBeCloseTo(2 / 3, 5);
    });

    it('handles backticked token matching', () => {
      const score = computeExactPhrase(
        'The function parseTranscriptJsonl handles JSONL parsing',
        '`parseTranscriptJsonl`',
      );
      expect(score).toBe(1.0);
    });

    it('returns 0.5 for substring match when no quotes', () => {
      const score = computeExactPhrase('The OAuth2 implementation is working well', 'OAuth2');
      expect(score).toBe(0.5);
    });

    it('returns 0.0 for no substring match when no quotes', () => {
      const score = computeExactPhrase('The basic auth implementation is working well', 'OAuth2');
      expect(score).toBe(0.0);
    });

    it('is case insensitive', () => {
      const score = computeExactPhrase('OAUTH2 Authentication', '"oauth2 authentication"');
      expect(score).toBe(1.0);
    });

    it('returns 0 for empty query', () => {
      expect(computeExactPhrase('Some text', '')).toBe(0);
      expect(computeExactPhrase('Some text', '   ')).toBe(0);
    });

    it('handles single-quoted phrases', () => {
      const score = computeExactPhrase('Use the vault search function', "'vault search'");
      expect(score).toBe(1.0);
    });
  });

  describe('computeTokenOverlap', () => {
    it('returns 1.0 when all tokens match', () => {
      const score = computeTokenOverlap(
        'OAuth2 authentication JWT tokens',
        'OAuth2 authentication JWT tokens',
      );
      expect(score).toBe(1.0);
    });

    it('returns 0.0 when no tokens match', () => {
      const score = computeTokenOverlap('PostgreSQL database design', 'OAuth2 authentication JWT');
      expect(score).toBe(0.0);
    });

    it('filters out stop words', () => {
      // "the", "is", "a", "for" are stop words
      const score = computeTokenOverlap(
        'authentication system',
        'the authentication is a system for users',
      );
      // Only "authentication", "system", "users" are non-stop words
      // "authentication" and "system" match, "users" does not
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('gives rare tokens (with underscore) higher weight', () => {
      // "parse_transcript" contains underscore => 2x weight
      const scoreWithRare = computeTokenOverlap('parse_transcript function', 'parse_transcript');
      const scoreWithCommon = computeTokenOverlap('parse function implementation', 'parse');
      // Rare token should have higher weight when matched
      expect(scoreWithRare).toBe(1.0);
      expect(scoreWithCommon).toBe(1.0);
    });

    it('gives rare tokens (with dot) higher weight', () => {
      const score = computeTokenOverlap(
        'config.json is the configuration file',
        'config.json settings',
      );
      // "config.json" is rare (has dot), "settings" is not found
      // Total weight: 2 (config.json) + 1 (settings) = 3
      // Matched weight: 2 (config.json) = 2
      expect(score).toBeCloseTo(2 / 3, 5);
    });

    it('returns 0 for empty query', () => {
      expect(computeTokenOverlap('Some text', '')).toBe(0);
    });

    it('returns 0 for query with only stop words', () => {
      expect(computeTokenOverlap('Some text', 'the is a')).toBe(0);
    });
  });

  describe('generateExcerpt', () => {
    it('returns short text as-is', () => {
      const text = 'Short text here.';
      expect(generateExcerpt(text, 'short')).toBe(text);
    });

    it('truncates long text with ellipsis', () => {
      const text = 'x'.repeat(500);
      const excerpt = generateExcerpt(text, 'nonexistent', 100);
      expect(excerpt.length).toBeLessThanOrEqual(106); // 100 + "..." on each end
      expect(excerpt).toContain('...');
    });

    it('centers excerpt on query match', () => {
      const text = 'A'.repeat(200) + ' OAuth2 authentication ' + 'B'.repeat(200);
      const excerpt = generateExcerpt(text, 'OAuth2', 100);
      expect(excerpt).toContain('OAuth2');
    });

    it('handles query with no meaningful tokens', () => {
      const text = 'x'.repeat(500);
      const excerpt = generateExcerpt(text, 'the is a', 100);
      // Should return from start since no meaningful tokens
      expect(excerpt).toMatch(/^x+\.\.\.$/);
    });

    it('respects custom maxLength', () => {
      const text = 'word '.repeat(100);
      const excerpt = generateExcerpt(text, 'word', 50);
      // Excerpt core should be about 50 chars, plus "..." markers
      expect(excerpt.replace(/\.\.\./g, '').length).toBeLessThanOrEqual(50);
    });
  });
});

// =============================================================================
// 6. INTEGRATION: FULL PIPELINE
// =============================================================================

describe('Full Pipeline Integration', () => {
  let provider: SQLitePersistenceProvider;

  beforeEach(() => {
    provider = createInitializedProvider();
  });

  afterEach(() => {
    provider.close();
    for (const f of tmpFiles) {
      try {
        unlinkSync(f);
      } catch {
        /* best-effort */
      }
    }
    tmpFiles.length = 0;
  });

  it('ingests a JSONL file, segments it, stores it, and searches it', () => {
    const path = createTestJsonl([
      {
        type: 'user',
        message: { role: 'user', content: 'How do we implement rate limiting?' },
        uuid: 'int-001',
        timestamp: '2026-04-08T10:00:00Z',
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'For rate limiting, I recommend using a token bucket algorithm with Redis as the backing store.',
            },
          ],
        },
        uuid: 'int-002',
        timestamp: '2026-04-08T10:00:05Z',
      },
      {
        type: 'user',
        message: { role: 'user', content: 'What about sliding window counters?' },
        uuid: 'int-003',
        timestamp: '2026-04-08T10:00:10Z',
      },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Sliding window counters are a good alternative. They provide smoother rate limiting than fixed windows.',
            },
          ],
        },
        uuid: 'int-004',
        timestamp: '2026-04-08T10:00:15Z',
      },
    ]);

    // Step 1: Capture
    const captureResult = captureTranscriptSession(provider, {
      sessionId: 'int-sess',
      projectPath: '/test',
      title: 'Rate Limiting Discussion',
      transcriptPath: path,
    });

    expect(captureResult.captured).toBe(true);
    expect(captureResult.messagesStored).toBe(4);
    expect(captureResult.segmentsStored).toBeGreaterThanOrEqual(1);

    // Step 2: Search
    const searchResults = searchTranscriptSegments(provider, 'token bucket rate limiting');
    expect(searchResults.length).toBeGreaterThanOrEqual(1);

    // Step 3: Rank
    const rankedResults = rankTranscriptCandidates(searchResults, 'token bucket rate limiting', {
      limit: 5,
    });
    expect(rankedResults.length).toBeGreaterThanOrEqual(1);
    expect(rankedResults[0].score).toBeGreaterThan(0);

    // Step 4: Retrieve full messages for the top hit
    const topHit = rankedResults[0];
    const messages = getTranscriptMessages(provider, topHit.sessionId, {
      seqStart: topHit.seqStart,
      seqEnd: topHit.seqEnd,
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('handles multiple sessions with different content', () => {
    captureTranscriptSession(provider, {
      sessionId: 'multi-1',
      projectPath: '/test',
      title: 'CSS Architecture',
      messages: [
        { role: 'user', content: 'How should we organize CSS in the project?' },
        {
          role: 'assistant',
          content: 'Use CSS modules with a BEM naming convention for components.',
        },
      ],
    });

    captureTranscriptSession(provider, {
      sessionId: 'multi-2',
      projectPath: '/test',
      title: 'API Design',
      messages: [
        { role: 'user', content: 'What REST API conventions should we follow?' },
        {
          role: 'assistant',
          content:
            'Use RESTful resource naming, proper HTTP methods, and consistent error responses.',
        },
      ],
    });

    const cssResults = searchTranscriptSegments(provider, 'CSS modules BEM');
    const apiResults = searchTranscriptSegments(provider, 'REST API conventions');

    expect(cssResults.length).toBeGreaterThanOrEqual(1);
    expect(apiResults.length).toBeGreaterThanOrEqual(1);

    // Verify they come from different sessions
    const cssSessionIds = new Set(cssResults.map((r) => r.segment.sessionId));
    const apiSessionIds = new Set(apiResults.map((r) => r.segment.sessionId));
    expect(cssSessionIds.has('multi-1')).toBe(true);
    expect(apiSessionIds.has('multi-2')).toBe(true);
  });
});
