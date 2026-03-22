/**
 * Colocated tests for domain-packs/inject-rules.ts
 *
 * Tests: inject into new file, inject into existing, idempotent replace,
 * remove, no-op on empty content.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { injectDomainRules, removeDomainRules } from './inject-rules.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'inject-rules-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('injectDomainRules', () => {
  it('creates file if it does not exist', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    injectDomainRules(filePath, 'design', '## Design Rules\nUse semantic tokens.');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('<!-- domain:design -->');
    expect(content).toContain('## Design Rules');
    expect(content).toContain('<!-- /domain:design -->');
  });

  it('appends to existing file', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Agent Rules\n\nExisting content.\n');
    injectDomainRules(filePath, 'security', 'Security rules here.');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Agent Rules');
    expect(content).toContain('<!-- domain:security -->');
    expect(content).toContain('Security rules here.');
  });

  it('is idempotent — replaces existing block', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Header\n');
    injectDomainRules(filePath, 'design', 'Version 1');
    injectDomainRules(filePath, 'design', 'Version 2');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('Version 1');
    expect(content).toContain('Version 2');
    // Only one pair of markers
    const openCount = content.split('<!-- domain:design -->').length - 1;
    expect(openCount).toBe(1);
  });

  it('does nothing when content is empty', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, 'Original');
    injectDomainRules(filePath, 'design', '');
    expect(readFileSync(filePath, 'utf-8')).toBe('Original');
  });

  it('does nothing when content is whitespace-only', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, 'Original');
    injectDomainRules(filePath, 'design', '   \n  \n  ');
    expect(readFileSync(filePath, 'utf-8')).toBe('Original');
  });

  it('handles multiple pack injections independently', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Agent\n');
    injectDomainRules(filePath, 'design', 'Design rules');
    injectDomainRules(filePath, 'security', 'Security rules');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('<!-- domain:design -->');
    expect(content).toContain('<!-- domain:security -->');
    expect(content).toContain('Design rules');
    expect(content).toContain('Security rules');
  });
});

describe('removeDomainRules', () => {
  it('removes injected block', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Header\n');
    injectDomainRules(filePath, 'design', 'Rules to remove');
    removeDomainRules(filePath, 'design');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('<!-- domain:design -->');
    expect(content).not.toContain('Rules to remove');
  });

  it('does nothing if file does not exist', () => {
    // Should not throw
    removeDomainRules(join(tempDir, 'nonexistent.md'), 'design');
  });

  it('does nothing if markers are not found', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Header\nNo markers here.\n');
    removeDomainRules(filePath, 'design');
    expect(readFileSync(filePath, 'utf-8')).toBe('# Header\nNo markers here.\n');
  });

  it('only removes the targeted pack block', () => {
    const filePath = join(tempDir, 'CLAUDE.md');
    writeFileSync(filePath, '# Header\n');
    injectDomainRules(filePath, 'design', 'Design rules');
    injectDomainRules(filePath, 'security', 'Security rules');
    removeDomainRules(filePath, 'design');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).not.toContain('Design rules');
    expect(content).toContain('Security rules');
  });
});
