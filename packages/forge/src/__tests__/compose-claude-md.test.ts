/**
 * Tests for compose-claude-md.ts — user custom zone helpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractUserCustomZone,
  injectUserCustomZone,
  composeClaudeMd,
} from '../compose-claude-md.js';

const OPEN = '<!-- user:custom -->';
const CLOSE = '<!-- /user:custom -->';

describe('extractUserCustomZone', () => {
  it('extracts full block between user:custom markers', () => {
    const content = ['# Agent', OPEN, 'My custom rules here', CLOSE, '## Footer'].join('\n');
    const result = extractUserCustomZone(content);
    expect(result).toContain(OPEN);
    expect(result).toContain('My custom rules here');
    expect(result).toContain(CLOSE);
  });

  it('returns null when no markers present', () => {
    expect(extractUserCustomZone('# Just a normal file\nNo markers.')).toBeNull();
  });

  it('returns null for malformed markers (start without end)', () => {
    const content = `# Agent\n${OPEN}\nOrphan content`;
    expect(extractUserCustomZone(content)).toBeNull();
  });

  it('handles multi-line custom content', () => {
    const content = [
      OPEN,
      'Rule 1: Do this',
      'Rule 2: Do that',
      '',
      'Rule 3: Also this',
      CLOSE,
    ].join('\n');
    const result = extractUserCustomZone(content);
    expect(result).toContain('Rule 1: Do this');
    expect(result).toContain('Rule 3: Also this');
  });

  it('uses first pair of markers (ignores nested)', () => {
    const content = [OPEN, 'First zone', CLOSE, OPEN, 'Second zone', CLOSE].join('\n');
    const result = extractUserCustomZone(content);
    expect(result).toContain('First zone');
    expect(result).not.toContain('Second zone');
  });
});

describe('injectUserCustomZone', () => {
  it('replaces content between markers', () => {
    const content = ['# Agent', OPEN, 'Old content', CLOSE, '## Footer'].join('\n');
    const newZone = [OPEN, 'New content', CLOSE].join('\n');
    const result = injectUserCustomZone(content, newZone);
    expect(result).toContain('New content');
    expect(result).not.toContain('Old content');
    expect(result).toContain(OPEN);
    expect(result).toContain(CLOSE);
    expect(result).toContain('## Footer');
  });

  it('returns content unchanged when no markers present', () => {
    const content = '# Agent\nNo markers here.';
    const newZone = [OPEN, 'Injected', CLOSE].join('\n');
    // No existing block to replace — inserts before engine-rules-ref or appends
    const result = injectUserCustomZone(content, newZone);
    expect(result).toContain('Injected');
  });

  it('round-trips with extractUserCustomZone', () => {
    const original = ['# Agent', OPEN, 'Original rules', CLOSE, '## Footer'].join('\n');

    // Extract
    const extracted = extractUserCustomZone(original);
    expect(extracted).not.toBeNull();
    expect(extracted).toContain('Original rules');

    // Regenerate (simulating soleri agent refresh)
    const regenerated = ['# Agent v2', OPEN, 'Placeholder', CLOSE, '## New Footer'].join('\n');

    // Inject back
    const result = injectUserCustomZone(regenerated, extracted!);
    expect(result).toContain('Original rules');
    expect(result).not.toContain('Placeholder');
    expect(result).toContain('# Agent v2');
    expect(result).toContain('## New Footer');
  });
});

describe('composeClaudeMd', () => {
  let tempDir: string;

  const minimalAgentYaml = `
id: test-agent
name: Test Agent
role: A test agent
description: A minimal agent for testing compose-claude-md
domains: []
principles: []
`;

  beforeEach(() => {
    tempDir = join(tmpdir(), `compose-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, 'agent.yaml'), minimalAgentYaml);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('excludes getting-started.md from composed output', () => {
    const instructionsDir = join(tempDir, 'instructions');
    mkdirSync(instructionsDir, { recursive: true });
    writeFileSync(
      join(instructionsDir, 'getting-started.md'),
      '# Getting Started\nInstall steps here',
    );
    writeFileSync(join(instructionsDir, 'usage.md'), '# Usage\nHow to use the agent');

    const result = composeClaudeMd(tempDir);
    expect(result.content).toContain('How to use the agent');
    expect(result.content).not.toContain('Install steps here');
    expect(result.content).not.toContain('# Getting Started');
  });
});
