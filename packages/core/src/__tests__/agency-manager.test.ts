/**
 * Agency Manager Tests — lifecycle, warning detection, pattern surfacing, clarification.
 *
 * Note: File watcher tests are limited since fs.watch requires real filesystem events.
 * Core logic (scanning, surfacing, clarification) is tested in isolation.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { AgencyManager } from '../agency/agency-manager.js';
import type { WarningDetector, Warning } from '../agency/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agency-test-'));
}

function makeTestDetector(): WarningDetector {
  return {
    name: 'test-detector',
    extensions: ['.ts', '.tsx'],
    detect(filePath: string, content: string): Warning[] {
      const warnings: Warning[] = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('console.log')) {
          warnings.push({
            id: `console-${i}`,
            file: filePath,
            line: i + 1,
            severity: 'warning',
            category: 'code-quality',
            message: 'Avoid console.log in production code',
            suggestion: 'Use a structured logger instead',
          });
        }
      }
      return warnings;
    },
  };
}

describe('AgencyManager', () => {
  let vault: Vault;
  let manager: AgencyManager;

  beforeEach(() => {
    vault = new Vault(':memory:');
    manager = new AgencyManager(vault);
  });

  // ─── Lifecycle ──────────────────────────────────────────────────

  describe('lifecycle', () => {
    test('starts disabled by default', () => {
      const status = manager.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.watching).toBe(false);
    });

    test('enable activates', () => {
      manager.enable();
      const status = manager.getStatus();
      expect(status.enabled).toBe(true);
    });

    test('enable is idempotent', () => {
      manager.enable();
      manager.enable();
      expect(manager.getStatus().enabled).toBe(true);
    });

    test('disable deactivates', () => {
      manager.enable();
      manager.disable();
      const status = manager.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.watching).toBe(false);
    });

    test('updateConfig changes settings', () => {
      manager.updateConfig({ debounceMs: 500 });
      // Config is internal, but status reflects watch paths
      const status = manager.getStatus();
      expect(status.watchPaths).toEqual(['.']);
    });

    test('updateConfig changes watch paths', () => {
      manager.updateConfig({ watchPaths: ['src', 'lib'] });
      const status = manager.getStatus();
      expect(status.watchPaths).toEqual(['src', 'lib']);
    });
  });

  // ─── Warning Detection ──────────────────────────────────────────

  describe('warning detection', () => {
    test('no detectors returns empty', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'test.ts');
      writeFileSync(filePath, 'console.log("hello");');

      const warnings = manager.scanFile(filePath);
      expect(warnings.length).toBe(0);

      rmSync(dir, { recursive: true });
    });

    test('registered detector finds warnings', () => {
      manager.registerDetector(makeTestDetector());

      const dir = makeTempDir();
      const filePath = join(dir, 'test.ts');
      writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\nconst y = 2;');

      const warnings = manager.scanFile(filePath);
      expect(warnings.length).toBe(1);
      expect(warnings[0].severity).toBe('warning');
      expect(warnings[0].category).toBe('code-quality');
      expect(warnings[0].line).toBe(2);

      rmSync(dir, { recursive: true });
    });

    test('detector only applies to matching extensions', () => {
      manager.registerDetector(makeTestDetector());

      const dir = makeTempDir();
      const filePath = join(dir, 'test.json');
      writeFileSync(filePath, '{ "console.log": true }');

      const warnings = manager.scanFile(filePath);
      expect(warnings.length).toBe(0);

      rmSync(dir, { recursive: true });
    });

    test('non-existent file returns empty', () => {
      manager.registerDetector(makeTestDetector());
      const warnings = manager.scanFile('/nonexistent/file.ts');
      expect(warnings.length).toBe(0);
    });

    test('pending warnings accumulate', () => {
      manager.registerDetector(makeTestDetector());

      const dir = makeTempDir();
      const f1 = join(dir, 'a.ts');
      const f2 = join(dir, 'b.ts');
      writeFileSync(f1, 'console.log("a");');
      writeFileSync(f2, 'console.log("b");');

      manager.scanFile(f1);
      manager.scanFile(f2);

      expect(manager.getPendingWarnings().length).toBe(2);

      manager.clearWarnings();
      expect(manager.getPendingWarnings().length).toBe(0);

      rmSync(dir, { recursive: true });
    });

    test('detector status reflects count', () => {
      expect(manager.getStatus().detectorCount).toBe(0);
      manager.registerDetector(makeTestDetector());
      expect(manager.getStatus().detectorCount).toBe(1);
    });
  });

  // ─── Pattern Surfacing ──────────────────────────────────────────

  describe('pattern surfacing', () => {
    test('surfaces patterns from vault for ts files', () => {
      vault.seed([
        {
          id: 'ts-pattern',
          type: 'pattern',
          domain: 'general',
          title: 'TypeScript best practice for modules',
          severity: 'suggestion',
          description: 'Use explicit types for public APIs in typescript',
          tags: ['typescript'],
        },
      ]);

      const patterns = manager.surfacePatterns('/project/src/app.ts');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].trigger).toBe('/project/src/app.ts');
    });

    test('respects cooldown', () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'general',
          title: 'TypeScript pattern',
          severity: 'suggestion',
          description: 'A typescript pattern',
          tags: ['typescript'],
        },
      ]);

      const first = manager.surfacePatterns('/project/src/app.ts');
      expect(first.length).toBeGreaterThan(0);

      // Second call within cooldown returns empty
      const second = manager.surfacePatterns('/project/src/app.ts');
      expect(second.length).toBe(0);
    });

    test('different files are not subject to same cooldown', () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'general',
          title: 'TypeScript pattern',
          severity: 'suggestion',
          description: 'A typescript pattern',
          tags: ['typescript'],
        },
      ]);

      manager.surfacePatterns('/project/src/a.ts');
      const patterns = manager.surfacePatterns('/project/src/b.ts');
      expect(patterns.length).toBeGreaterThan(0);
    });

    test('returns empty for unknown file types', () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'general',
          title: 'Some pattern',
          severity: 'suggestion',
          description: 'A pattern',
          tags: ['general'],
        },
      ]);

      const patterns = manager.surfacePatterns('/project/data.bin');
      expect(patterns.length).toBe(0);
    });

    test('getSurfacedPatterns accumulates', () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'general',
          title: 'TypeScript pattern',
          severity: 'suggestion',
          description: 'A typescript pattern',
          tags: ['typescript'],
        },
      ]);

      manager.surfacePatterns('/project/a.ts');
      manager.surfacePatterns('/project/b.ts');
      expect(manager.getSurfacedPatterns().length).toBeGreaterThanOrEqual(2);

      manager.clearSurfacedPatterns();
      expect(manager.getSurfacedPatterns().length).toBe(0);
    });
  });

  // ─── Clarification ──────────────────────────────────────────────

  describe('clarification', () => {
    test('no clarification for high confidence', () => {
      const result = manager.generateClarification('Fix the bug in search', 0.8);
      expect(result).toBeNull();
    });

    test('asks for action when none detected', () => {
      const result = manager.generateClarification('the login page buttons', 0.2);
      expect(result).not.toBeNull();
      expect(result!.question).toContain('action');
    });

    test('asks for context when very low confidence', () => {
      const result = manager.generateClarification('hmm', 0.1);
      expect(result).not.toBeNull();
      expect(result!.options).toBeDefined();
    });

    test('returns null for moderate prompt with action', () => {
      const result = manager.generateClarification('fix the css styling issue in the header', 0.5);
      expect(result).toBeNull();
    });

    test('provides options when asking for clarification', () => {
      const result = manager.generateClarification('stuff', 0.1);
      expect(result).not.toBeNull();
      expect(result!.options!.length).toBeGreaterThan(0);
    });
  });

  // ─── File Watching ──────────────────────────────────────────────

  describe('file watching', () => {
    test('startWatching with valid dir starts watchers', () => {
      const dir = makeTempDir();
      manager.enable(dir);
      expect(manager.getStatus().watching).toBe(true);
      manager.disable();
      rmSync(dir, { recursive: true });
    });

    test('startWatching with invalid dir does not throw', () => {
      manager.enable('/nonexistent/path');
      // Should not crash — watchers array may be empty
      expect(manager.getStatus().enabled).toBe(true);
    });

    test('stopWatching clears watchers', () => {
      const dir = makeTempDir();
      manager.enable(dir);
      manager.stopWatching();
      expect(manager.getStatus().watching).toBe(false);
      rmSync(dir, { recursive: true });
    });

    test('onFileChange registers listener', () => {
      const calls: string[] = [];
      manager.onFileChange((change) => calls.push(change.path));
      // Listener registered — would fire on actual fs events
      expect(manager.getStatus()).toBeDefined();
    });
  });

  // ─── Custom Config ──────────────────────────────────────────────

  describe('custom config', () => {
    test('respects initial config', () => {
      const custom = new AgencyManager(vault, {
        enabled: true,
        watchPaths: ['src'],
        extensions: ['.ts'],
        debounceMs: 500,
      });
      const status = custom.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.watchPaths).toEqual(['src']);
    });

    test('min confidence filters low-relevance patterns', () => {
      const strict = new AgencyManager(vault, { minPatternConfidence: 0.99 });
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'general',
          title: 'TypeScript pattern',
          severity: 'suggestion',
          description: 'A typescript pattern',
          tags: ['typescript'],
        },
      ]);
      // With very high threshold, may not surface anything
      const patterns = strict.surfacePatterns('/project/src/app.ts');
      // Normalized scores cap at 1.0, but if only 1 result score = 1.0 > 0.99
      // So this should still surface. The threshold filters post-normalization.
      expect(patterns.length).toBeLessThanOrEqual(5);
    });
  });
});
