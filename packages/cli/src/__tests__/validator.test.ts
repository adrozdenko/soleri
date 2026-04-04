import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { generateFixtures, validateHookScript } from '../hook-packs/validator.js';
import type { TestFixture } from '../hook-packs/validator.js';

// Mock execSync to avoid needing actual shell scripts in tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

const mockedExecSync = vi.mocked(execSync);

describe('validator', () => {
  describe('generateFixtures', () => {
    it('should return 15 fixtures for PreToolUse (5 matching + 10 non-matching)', () => {
      const fixtures = generateFixtures('PreToolUse', 'Write');
      expect(fixtures).toHaveLength(15);

      const matching = fixtures.filter((f) => f.shouldMatch);
      const nonMatching = fixtures.filter((f) => !f.shouldMatch);
      expect(matching).toHaveLength(5);
      expect(nonMatching).toHaveLength(10);
    });

    it('should return 15 fixtures for PostToolUse', () => {
      const fixtures = generateFixtures('PostToolUse', 'Edit|Write');
      expect(fixtures).toHaveLength(15);

      const matching = fixtures.filter((f) => f.shouldMatch);
      const nonMatching = fixtures.filter((f) => !f.shouldMatch);
      expect(matching).toHaveLength(5);
      expect(nonMatching).toHaveLength(10);
    });

    it('should return 15 fixtures for PreCompact', () => {
      const fixtures = generateFixtures('PreCompact');
      expect(fixtures).toHaveLength(15);

      const matching = fixtures.filter((f) => f.shouldMatch);
      const nonMatching = fixtures.filter((f) => !f.shouldMatch);
      expect(matching).toHaveLength(5);
      expect(nonMatching).toHaveLength(10);
    });

    it('should return 15 fixtures for Notification', () => {
      const fixtures = generateFixtures('Notification');
      expect(fixtures).toHaveLength(15);
    });

    it('should return 15 fixtures for Stop', () => {
      const fixtures = generateFixtures('Stop');
      expect(fixtures).toHaveLength(15);
    });

    it('PreToolUse matching fixtures should contain tool_name and tool_input', () => {
      const fixtures = generateFixtures('PreToolUse', 'Write|Edit');
      const matching = fixtures.filter((f) => f.shouldMatch);
      for (const f of matching) {
        expect(f.payload).toHaveProperty('tool_name');
        expect(f.payload).toHaveProperty('tool_input');
        const toolInput = f.payload.tool_input as Record<string, unknown>;
        expect(toolInput).toHaveProperty('file_path');
        expect(toolInput).toHaveProperty('command');
      }
    });

    it('PreToolUse non-matching fixtures should contain tool_name and tool_input', () => {
      const fixtures = generateFixtures('PreToolUse', 'Write');
      const nonMatching = fixtures.filter((f) => !f.shouldMatch);
      for (const f of nonMatching) {
        expect(f.payload).toHaveProperty('tool_name');
        expect(f.payload).toHaveProperty('tool_input');
      }
    });

    it('should use provided toolMatcher tools in matching fixtures', () => {
      const fixtures = generateFixtures('PreToolUse', 'Edit|Write');
      const matching = fixtures.filter((f) => f.shouldMatch);
      const toolNames = matching.map((f) => f.payload.tool_name);
      for (const name of toolNames) {
        expect(['Edit', 'Write']).toContain(name);
      }
    });

    it('should default to Write when no toolMatcher provided for PreToolUse', () => {
      const fixtures = generateFixtures('PreToolUse');
      const matching = fixtures.filter((f) => f.shouldMatch);
      for (const f of matching) {
        expect(f.payload.tool_name).toBe('Write');
      }
    });

    it('PreCompact matching fixtures should have session_id', () => {
      const fixtures = generateFixtures('PreCompact');
      const matching = fixtures.filter((f) => f.shouldMatch);
      for (const f of matching) {
        expect(f.payload).toHaveProperty('session_id');
        expect(f.payload).toHaveProperty('context');
      }
    });

    it('PreCompact non-matching fixtures should have empty payloads', () => {
      const fixtures = generateFixtures('PreCompact');
      const nonMatching = fixtures.filter((f) => !f.shouldMatch);
      for (const f of nonMatching) {
        expect(Object.keys(f.payload)).toHaveLength(0);
      }
    });

    it('all fixtures should have event matching the requested event', () => {
      for (const event of [
        'PreToolUse',
        'PostToolUse',
        'PreCompact',
        'Notification',
        'Stop',
      ] as const) {
        const fixtures = generateFixtures(event);
        for (const f of fixtures) {
          expect(f.event).toBe(event);
        }
      }
    });

    it('all fixtures should have unique names', () => {
      const fixtures = generateFixtures('PreToolUse', 'Write|Edit');
      const names = fixtures.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('validateHookScript', () => {
    it('should report correctly with a script that produces no output (exit 0)', () => {
      // execSync mock returns '' (empty string) — no match detected
      mockedExecSync.mockReturnValue('');

      const fixtures: TestFixture[] = [
        {
          name: 'should-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Write', tool_input: { file_path: 'test.ts' } },
          shouldMatch: true,
        },
        {
          name: 'should-not-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Read', tool_input: { file_path: 'test.ts' } },
          shouldMatch: false,
        },
      ];

      const report = validateHookScript('/fake/script.sh', fixtures);

      expect(report.total).toBe(2);
      // Script produces no output, so matched = false for all
      // should-match expected match but got none -> false negative
      // should-not-match expected no match and got none -> correct
      expect(report.falseNegatives).toHaveLength(1);
      expect(report.falseNegatives[0].fixture.name).toBe('should-match');
      expect(report.falsePositives).toHaveLength(0);
      expect(report.passed).toBe(1);
    });

    it('should detect false positives when script always matches', () => {
      mockedExecSync.mockReturnValue('{"continue": true, "message": "always matches"}');

      const fixtures: TestFixture[] = [
        {
          name: 'should-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Write', tool_input: {} },
          shouldMatch: true,
        },
        {
          name: 'should-not-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Read', tool_input: {} },
          shouldMatch: false,
        },
      ];

      const report = validateHookScript('/fake/script.sh', fixtures);

      expect(report.total).toBe(2);
      // Script always outputs "continue", so matched = true for all
      // should-not-match expected no match but got one -> false positive
      expect(report.falsePositives).toHaveLength(1);
      expect(report.falsePositives[0].fixture.name).toBe('should-not-match');
      expect(report.falseNegatives).toHaveLength(0);
      expect(report.passed).toBe(1);
    });

    it('should report all passed when script matches correctly', () => {
      mockedExecSync.mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('Write')) {
          return '{"continue": true, "message": "matched"}';
        }
        return '';
      });

      const fixtures: TestFixture[] = [
        {
          name: 'should-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Write', tool_input: {} },
          shouldMatch: true,
        },
        {
          name: 'should-not-match',
          event: 'PreToolUse',
          payload: { tool_name: 'Read', tool_input: {} },
          shouldMatch: false,
        },
      ];

      const report = validateHookScript('/fake/script.sh', fixtures);

      expect(report.total).toBe(2);
      expect(report.passed).toBe(2);
      expect(report.falsePositives).toHaveLength(0);
      expect(report.falseNegatives).toHaveLength(0);
    });

    it('should handle script errors gracefully (exit code != 0)', () => {
      mockedExecSync.mockImplementation(() => {
        const err = new Error('script failed') as Error & { status: number; stdout: string };
        err.status = 1;
        err.stdout = '';
        throw err;
      });

      const fixtures: TestFixture[] = [
        {
          name: 'error-fixture',
          event: 'PreToolUse',
          payload: { tool_name: 'Write', tool_input: {} },
          shouldMatch: true,
        },
      ];

      const report = validateHookScript('/fake/script.sh', fixtures);

      expect(report.total).toBe(1);
      // Error means matched = false, but shouldMatch = true -> false negative
      expect(report.falseNegatives).toHaveLength(1);
      expect(report.passed).toBe(0);
    });
  });
});
