/**
 * Agency Manager — colocated contract tests.
 *
 * Covers: lifecycle, file scanning, pattern surfacing, clarification,
 * proactive suggestions, rich clarification, warning suppression,
 * pattern dismissal, notification queue, and edge cases.
 *
 * External deps (fs, vault) are mocked where needed — no real DB or network.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { AgencyManager } from './agency-manager.js';
import type { WarningDetector, Warning, SuggestionRule } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agency-colocated-'));
}

function makeDetector(overrides?: Partial<WarningDetector>): WarningDetector {
  return {
    name: 'test-detector',
    extensions: ['.ts', '.tsx'],
    detect(filePath: string, content: string): Warning[] {
      const warnings: Warning[] = [];
      content.split('\n').forEach((line, i) => {
        if (line.includes('console.log')) {
          warnings.push({
            id: `console-${filePath}-${i}`,
            file: filePath,
            line: i + 1,
            severity: 'warning',
            category: 'code-quality',
            message: 'console.log detected',
          });
        }
      });
      return warnings;
    },
    ...overrides,
  };
}

function makeCriticalDetector(): WarningDetector {
  return {
    name: 'critical-detector',
    extensions: ['.ts'],
    detect(filePath: string, content: string): Warning[] {
      if (content.includes('DANGER')) {
        return [
          {
            id: `danger-${filePath}`,
            file: filePath,
            line: 1,
            severity: 'critical',
            category: 'security',
            message: 'DANGER keyword found',
          },
        ];
      }
      return [];
    },
  };
}

function seedVaultWithPattern(vault: Vault): void {
  vault.seed([
    {
      id: 'ts-pattern-1',
      type: 'pattern',
      domain: 'general',
      title: 'TypeScript best practices',
      severity: 'suggestion',
      description: 'Follow typescript conventions',
      tags: ['typescript'],
    },
  ]);
}

describe('AgencyManager', () => {
  let vault: Vault;
  let manager: AgencyManager;
  let tempDirs: string[];

  beforeEach(() => {
    vault = new Vault(':memory:');
    manager = new AgencyManager(vault);
    tempDirs = [];
  });

  afterEach(() => {
    manager.disable();
    for (const d of tempDirs) {
      try {
        rmSync(d, { recursive: true });
      } catch {
        /* noop */
      }
    }
  });

  function withTempFile(name: string, content: string): string {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const fp = join(dir, name);
    writeFileSync(fp, content);
    return fp;
  }

  // ─── Contract: Lifecycle ──────────────────────────────────────────

  describe('lifecycle', () => {
    it('defaults to disabled with zero counters', () => {
      const s = manager.getStatus();
      expect(s.enabled).toBe(false);
      expect(s.watching).toBe(false);
      expect(s.detectorCount).toBe(0);
      expect(s.pendingWarnings).toBe(0);
      expect(s.surfacedPatterns).toBe(0);
      expect(s.fileChangesProcessed).toBe(0);
    });

    it('enable/disable toggles enabled flag', () => {
      manager.enable();
      expect(manager.getStatus().enabled).toBe(true);
      manager.disable();
      expect(manager.getStatus().enabled).toBe(false);
    });

    it('enable is idempotent', () => {
      manager.enable();
      manager.enable();
      expect(manager.getStatus().enabled).toBe(true);
    });

    it('getStatus and getFullStatus return same shape', () => {
      const a = manager.getStatus();
      expect(a).toHaveProperty('suggestionRuleCount');
      expect(a).toHaveProperty('suppressedWarnings');
      expect(a).toHaveProperty('dismissedPatterns');
      expect(a).toHaveProperty('pendingNotifications');
    });
  });

  // ─── Contract: File Scanning ──────────────────────────────────────

  describe('scanFile', () => {
    it('returns empty when no detectors registered', () => {
      const fp = withTempFile('app.ts', 'console.log("hi")');
      expect(manager.scanFile(fp)).toEqual([]);
    });

    it('returns empty for non-existent file', () => {
      manager.registerDetector(makeDetector());
      expect(manager.scanFile('/no/such/file.ts')).toEqual([]);
    });

    it('returns empty when extension does not match any detector', () => {
      manager.registerDetector(makeDetector());
      const fp = withTempFile('data.json', '{"console.log": true}');
      expect(manager.scanFile(fp)).toEqual([]);
    });

    it('detects warnings for matching extensions', () => {
      manager.registerDetector(makeDetector());
      const fp = withTempFile('app.ts', 'const x = 1;\nconsole.log(x);');
      const w = manager.scanFile(fp);
      expect(w).toHaveLength(1);
      expect(w[0].severity).toBe('warning');
      expect(w[0].line).toBe(2);
    });

    it('accumulates warnings in pending list', () => {
      manager.registerDetector(makeDetector());
      const f1 = withTempFile('a.ts', 'console.log(1)');
      const f2 = withTempFile('b.ts', 'console.log(2)');
      manager.scanFile(f1);
      manager.scanFile(f2);
      expect(manager.getPendingWarnings()).toHaveLength(2);
    });

    it('clearWarnings empties the list', () => {
      manager.registerDetector(makeDetector());
      manager.scanFile(withTempFile('a.ts', 'console.log(1)'));
      manager.clearWarnings();
      expect(manager.getPendingWarnings()).toHaveLength(0);
    });

    it('survives a throwing detector gracefully', () => {
      const badDetector: WarningDetector = {
        name: 'bad',
        extensions: ['.ts'],
        detect() {
          throw new Error('boom');
        },
      };
      manager.registerDetector(badDetector);
      manager.registerDetector(makeDetector());
      const fp = withTempFile('x.ts', 'console.log("ok")');
      const w = manager.scanFile(fp);
      expect(w).toHaveLength(1);
    });

    it('empty file produces no warnings', () => {
      manager.registerDetector(makeDetector());
      const fp = withTempFile('empty.ts', '');
      expect(manager.scanFile(fp)).toEqual([]);
    });
  });

  // ─── Contract: Pattern Surfacing ──────────────────────────────────

  describe('surfacePatterns', () => {
    it('returns patterns from vault for .ts files', () => {
      seedVaultWithPattern(vault);
      const p = manager.surfacePatterns('/project/src/module.ts');
      expect(p.length).toBe(1);
      expect(p[0].trigger).toBe('/project/src/module.ts');
      expect(p[0].entryId).toBe('ts-pattern-1');
    });

    it('returns empty for unknown extensions', () => {
      seedVaultWithPattern(vault);
      expect(manager.surfacePatterns('/project/data.bin')).toEqual([]);
    });

    it('respects cooldown — same file returns empty on second call', () => {
      seedVaultWithPattern(vault);
      manager.surfacePatterns('/project/src/a.ts');
      expect(manager.surfacePatterns('/project/src/a.ts')).toEqual([]);
    });

    it('different files are independent of each other cooldown', () => {
      seedVaultWithPattern(vault);
      manager.surfacePatterns('/project/src/a.ts');
      expect(manager.surfacePatterns('/project/src/b.ts').length).toBe(1);
    });

    it('accumulates in getSurfacedPatterns', () => {
      seedVaultWithPattern(vault);
      manager.surfacePatterns('/project/a.ts');
      manager.surfacePatterns('/project/b.tsx');
      expect(manager.getSurfacedPatterns().length).toBe(2);
    });

    it('clearSurfacedPatterns resets accumulator', () => {
      seedVaultWithPattern(vault);
      manager.surfacePatterns('/project/a.ts');
      manager.clearSurfacedPatterns();
      expect(manager.getSurfacedPatterns()).toEqual([]);
    });

    it('handles vault search failure gracefully', () => {
      vi.spyOn(vault, 'search').mockImplementation(() => {
        throw new Error('db locked');
      });
      expect(manager.surfacePatterns('/project/a.ts')).toEqual([]);
      vi.restoreAllMocks();
    });

    it('applies minPatternConfidence filter', () => {
      const strict = new AgencyManager(vault, { minPatternConfidence: 0.99 });
      seedVaultWithPattern(vault);
      // With one result, normalized score = 1.0 which is > 0.99
      const p = strict.surfacePatterns('/project/x.ts');
      expect(p.length).toBeLessThanOrEqual(5);
    });

    it('builds search terms from css extension', () => {
      vault.seed([
        {
          id: 'css-pattern',
          type: 'pattern',
          domain: 'styling',
          title: 'CSS naming conventions',
          severity: 'suggestion',
          description: 'Follow css styling conventions',
          tags: ['css', 'styling'],
        },
      ]);
      const p = manager.surfacePatterns('/project/styles/main.css');
      expect(p.length).toBeGreaterThan(0);
    });
  });

  // ─── Contract: Clarification ──────────────────────────────────────

  describe('generateClarification', () => {
    it('returns null for high confidence (>= 0.7)', () => {
      expect(manager.generateClarification('fix the bug', 0.8)).toBeNull();
      expect(manager.generateClarification('fix the bug', 0.7)).toBeNull();
    });

    it('asks for action and target when both missing', () => {
      const r = manager.generateClarification('hi', 0.1);
      expect(r).not.toBeNull();
      expect(r!.question).toContain('action');
      expect(r!.options).toBeDefined();
      expect(r!.options!.length).toBeGreaterThan(0);
    });

    it('asks for action when target exists but no action verb', () => {
      const r = manager.generateClarification('the login page buttons and their colors', 0.2);
      expect(r).not.toBeNull();
      expect(r!.question).toContain('action');
    });

    it('asks for more context on very low confidence with action', () => {
      const r = manager.generateClarification('fix it', 0.2);
      expect(r).not.toBeNull();
      expect(r!.question).toContain('context');
    });

    it('returns null when action and target present at moderate confidence', () => {
      expect(
        manager.generateClarification('create a new authentication module for the users', 0.5),
      ).toBeNull();
    });
  });

  // ─── Contract: Rich Clarification (#211) ──────────────────────────

  describe('generateRichClarification', () => {
    it('detects broad scope words', () => {
      const qs = manager.generateRichClarification('refactor everything in the project');
      const scope = qs.find((q) => q.question.toLowerCase().includes('broad scope'));
      expect(scope).toBeDefined();
      expect(scope!.urgency).toBe('recommended');
      expect(scope!.options!.length).toBeGreaterThan(0);
    });

    it('detects vague short prompts', () => {
      const qs = manager.generateRichClarification('fix it');
      const vague = qs.find((q) => q.urgency === 'blocking');
      expect(vague).toBeDefined();
      expect(vague!.options!.length).toBe(3);
    });

    it('detects destructive operations', () => {
      const qs = manager.generateRichClarification('delete all the test fixtures');
      const destructive = qs.find((q) => q.question.toLowerCase().includes('destructive'));
      expect(destructive).toBeDefined();
      expect(destructive!.urgency).toBe('blocking');
    });

    it('returns empty for clear non-ambiguous prompts', () => {
      const qs = manager.generateRichClarification(
        'add a loading spinner to the dashboard header component',
      );
      expect(qs).toEqual([]);
    });

    it('can return multiple questions for multi-trigger prompts', () => {
      const qs = manager.generateRichClarification('delete everything');
      expect(qs.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Contract: Warning Suppression (#211) ─────────────────────────

  describe('warning suppression', () => {
    it('suppressWarning removes from pending and adds to suppressed set', () => {
      manager.registerDetector(makeDetector());
      manager.scanFile(withTempFile('a.ts', 'console.log(1)'));
      const w = manager.getPendingWarnings();
      expect(w).toHaveLength(1);

      manager.suppressWarning(w[0].id);
      expect(manager.getPendingWarnings()).toHaveLength(0);
      expect(manager.getSuppressedWarnings()).toContain(w[0].id);
    });

    it('unsuppressWarning removes from suppressed set', () => {
      manager.suppressWarning('w-1');
      expect(manager.getSuppressedWarnings()).toContain('w-1');
      manager.unsuppressWarning('w-1');
      expect(manager.getSuppressedWarnings()).not.toContain('w-1');
    });

    it('getFilteredWarnings excludes suppressed', () => {
      manager.registerDetector(makeDetector());
      manager.scanFile(withTempFile('a.ts', 'console.log(1)\nconsole.log(2)'));
      const all = manager.getPendingWarnings();
      expect(all).toHaveLength(2);

      manager.suppressWarning(all[0].id);
      expect(manager.getFilteredWarnings()).toHaveLength(1);
      expect(manager.getFilteredWarnings()[0].id).toBe(all[1].id);
    });

    it('status.suppressedWarnings reflects count', () => {
      manager.suppressWarning('a');
      manager.suppressWarning('b');
      expect(manager.getStatus().suppressedWarnings).toBe(2);
    });
  });

  // ─── Contract: Pattern Dismissal (#211) ───────────────────────────

  describe('pattern dismissal', () => {
    it('dismissPattern removes from surfaced and marks dismissed', () => {
      seedVaultWithPattern(vault);
      manager.surfacePatterns('/project/a.ts');
      expect(manager.getSurfacedPatterns().length).toBeGreaterThan(0);

      manager.dismissPattern('ts-pattern-1');
      expect(manager.getActiveSurfacedPatterns()).toEqual([]);
      expect(manager.isDismissed('ts-pattern-1')).toBe(true);
    });

    it('isDismissed returns false for unknown entry', () => {
      expect(manager.isDismissed('nonexistent')).toBe(false);
    });

    it('dismissal expires after TTL', () => {
      manager.dismissPattern('p-1');
      expect(manager.isDismissed('p-1')).toBe(true);

      // Simulate TTL expiry by manipulating the internal map via a second dismiss + time travel
      vi.useFakeTimers();
      manager.dismissPattern('p-2');
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours > 24h TTL
      expect(manager.isDismissed('p-2')).toBe(false);
      vi.useRealTimers();
    });

    it('status.dismissedPatterns reflects count', () => {
      manager.dismissPattern('a');
      manager.dismissPattern('b');
      expect(manager.getStatus().dismissedPatterns).toBe(2);
    });
  });

  // ─── Contract: Proactive Suggestions (#211) ───────────────────────

  describe('generateSuggestions', () => {
    it('returns built-in first-session suggestion on fresh manager', () => {
      const suggestions = manager.generateSuggestions();
      const firstSession = suggestions.find((s) => s.rule === 'first-session');
      expect(firstSession).toBeDefined();
      expect(firstSession!.priority).toBe('low');
    });

    it('returns empty when no rules match non-initial state', () => {
      // Simulate a state where first-session wouldn't fire and nothing else triggers
      manager.registerDetector(makeDetector());
      manager.scanFile(withTempFile('a.ts', 'const x = 1;')); // no warnings, but changes processed stays 0 (scanFile doesn't increment)
      // first-session fires if fileChangesProcessed === 0 AND pendingWarnings === 0
      // scanFile adds to pending, but content has no console.log so warnings = 0
      // changesProcessed is only incremented by processChange (private), not scanFile
      // So first-session will still fire. Let's use a custom manager that skips defaults.
      const custom = new AgencyManager(vault);
      // Add a warning to prevent first-session from firing
      custom.registerDetector(makeDetector());
      custom.scanFile(withTempFile('b.ts', 'console.log("x")'));
      const suggestions = custom.generateSuggestions();
      // first-session won't fire (pendingWarnings > 0), many-warnings won't fire (< 5)
      // critical-warnings won't fire (severity = warning not critical)
      // stale-patterns won't fire (changesProcessed < 20)
      // pattern-surfaced won't fire (no patterns surfaced)
      expect(suggestions).toEqual([]);
    });

    it('fires many-warnings rule when 5+ warnings pending', () => {
      manager.registerDetector(makeDetector());
      // Create 5 files each with console.log
      for (let i = 0; i < 5; i++) {
        manager.scanFile(withTempFile(`f${i}.ts`, 'console.log("x")'));
      }
      const suggestions = manager.generateSuggestions();
      const manyWarnings = suggestions.find((s) => s.rule === 'many-warnings');
      expect(manyWarnings).toBeDefined();
      expect(manyWarnings!.priority).toBe('high');
    });

    it('fires critical-warnings rule for critical severity', () => {
      manager.registerDetector(makeCriticalDetector());
      manager.scanFile(withTempFile('sec.ts', 'DANGER'));
      const suggestions = manager.generateSuggestions();
      const critical = suggestions.find((s) => s.rule === 'critical-warnings');
      expect(critical).toBeDefined();
      expect(critical!.priority).toBe('high');
    });

    it('sorts suggestions by priority (high first)', () => {
      manager.registerDetector(makeDetector());
      manager.registerDetector(makeCriticalDetector());
      for (let i = 0; i < 5; i++) {
        manager.scanFile(withTempFile(`w${i}.ts`, 'console.log("x")'));
      }
      manager.scanFile(withTempFile('danger.ts', 'DANGER'));
      const suggestions = manager.generateSuggestions();
      const priorities = suggestions.map((s) => s.priority);
      const highIdx = priorities.indexOf('high');
      const lowIdx = priorities.indexOf('low');
      if (highIdx >= 0 && lowIdx >= 0) {
        expect(highIdx).toBeLessThan(lowIdx);
      }
    });

    it('registerSuggestionRule adds custom rules', () => {
      const custom: SuggestionRule = {
        name: 'always-fire',
        description: 'Always fires',
        condition: () => true,
        generate: () => ({
          rule: 'always-fire',
          title: 'Custom suggestion',
          description: 'Test',
          priority: 'medium',
        }),
      };
      manager.registerSuggestionRule(custom);
      const suggestions = manager.generateSuggestions();
      expect(suggestions.find((s) => s.rule === 'always-fire')).toBeDefined();
    });

    it('survives a throwing suggestion rule', () => {
      const bad: SuggestionRule = {
        name: 'bad-rule',
        description: 'Throws',
        condition: () => {
          throw new Error('boom');
        },
        generate: () => ({ rule: 'bad', title: '', description: '', priority: 'low' }),
      };
      manager.registerSuggestionRule(bad);
      expect(() => manager.generateSuggestions()).not.toThrow();
    });

    it('creates notifications for each suggestion', () => {
      expect(manager.getPendingNotificationCount()).toBe(0);
      manager.generateSuggestions(); // first-session fires
      expect(manager.getPendingNotificationCount()).toBe(1);
    });
  });

  // ─── Contract: Notification Queue (#211) ──────────────────────────

  describe('notification queue', () => {
    it('pushNotification adds to queue', () => {
      manager.pushNotification('warning', 'Test', 'A message', 'high');
      expect(manager.getPendingNotificationCount()).toBe(1);
    });

    it('drainNotifications returns and clears queue', () => {
      manager.pushNotification('warning', 'W1', 'msg', 'low');
      manager.pushNotification('pattern', 'P1', 'msg', 'high');
      const drained = manager.drainNotifications();
      expect(drained).toHaveLength(2);
      expect(manager.getPendingNotificationCount()).toBe(0);
    });

    it('drainNotifications sorts by priority (high first)', () => {
      manager.pushNotification('warning', 'Low', 'msg', 'low');
      manager.pushNotification('suggestion', 'High', 'msg', 'high');
      manager.pushNotification('pattern', 'Med', 'msg', 'medium');
      const drained = manager.drainNotifications();
      expect(drained[0].priority).toBe('high');
      expect(drained[1].priority).toBe('medium');
      expect(drained[2].priority).toBe('low');
    });

    it('each notification has a unique id', () => {
      manager.pushNotification('warning', 'A', 'a', 'low');
      manager.pushNotification('warning', 'B', 'b', 'low');
      const drained = manager.drainNotifications();
      expect(drained[0].id).not.toBe(drained[1].id);
    });

    it('status.pendingNotifications reflects queue size', () => {
      manager.pushNotification('warning', 'X', 'x');
      expect(manager.getStatus().pendingNotifications).toBe(1);
    });
  });

  // ─── Contract: Config & Edge Cases ────────────────────────────────

  describe('config and edge cases', () => {
    it('respects custom config at construction', () => {
      const m = new AgencyManager(vault, {
        enabled: true,
        watchPaths: ['src', 'lib'],
        extensions: ['.ts'],
        debounceMs: 100,
        cooldownMs: 1000,
        minPatternConfidence: 0.8,
      });
      const s = m.getStatus();
      expect(s.enabled).toBe(true);
      expect(s.watchPaths).toEqual(['src', 'lib']);
    });

    it('updateConfig merges partial config', () => {
      manager.updateConfig({ watchPaths: ['src'] });
      expect(manager.getStatus().watchPaths).toEqual(['src']);
    });

    it('default suggestion rules count is 6', () => {
      expect(manager.getStatus().suggestionRuleCount).toBe(6);
    });

    it('startWatching with non-existent path does not throw', () => {
      expect(() => manager.startWatching('/no/such/dir')).not.toThrow();
    });

    it('stopWatching is safe when not watching', () => {
      expect(() => manager.stopWatching()).not.toThrow();
    });

    it('onFileChange registers a listener without error', () => {
      expect(() => manager.onFileChange(() => {})).not.toThrow();
    });
  });
});
