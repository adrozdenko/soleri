/**
 * Unit tests for global ~/.claude/CLAUDE.md scaffolding functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldGlobalClaudeMd, removeAgentFromGlobalClaudeMd } from './sync-skills.js';

// ---------------------------------------------------------------------------
// Test harness — redirect homedir() to a temp dir via env override
// ---------------------------------------------------------------------------

let tmpHome: string;
let claudeDir: string;
let claudeMdPath: string;

// We patch the module by temporarily pointing HOME at a temp dir
beforeEach(() => {
  tmpHome = join(tmpdir(), `soleri-claude-md-test-${Date.now()}`);
  claudeDir = join(tmpHome, '.claude');
  claudeMdPath = join(claudeDir, 'CLAUDE.md');
  mkdirSync(claudeDir, { recursive: true });
  process.env['HOME'] = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env['HOME'];
});

describe('scaffoldGlobalClaudeMd', () => {
  it('creates CLAUDE.md with header and agent section when file does not exist', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');

    expect(existsSync(claudeMdPath)).toBe(true);
    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('# Soleri Engine');
    expect(content).toContain('<!-- soleri:agent:ernesto start -->');
    expect(content).toContain('<!-- soleri:agent:ernesto end -->');
    expect(content).toContain('## Ernesto');
    expect(content).toContain('ernesto_*');
  });

  it('replaces existing agent section on second call (idempotent)', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    const startCount = (content.match(/<!-- soleri:agent:ernesto start -->/g) ?? []).length;
    expect(startCount).toBe(1);
  });

  it('appends a second agent section without disturbing the first', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    scaffoldGlobalClaudeMd('salvador', 'Salvador');

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('<!-- soleri:agent:ernesto start -->');
    expect(content).toContain('<!-- soleri:agent:ernesto end -->');
    expect(content).toContain('<!-- soleri:agent:salvador start -->');
    expect(content).toContain('<!-- soleri:agent:salvador end -->');
  });

  it('updating one agent does not affect another agent section', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    scaffoldGlobalClaudeMd('salvador', 'Salvador');
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto Updated');

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('Ernesto Updated');
    expect(content).toContain('<!-- soleri:agent:salvador start -->');
    // Only one ernesto section
    const count = (content.match(/<!-- soleri:agent:ernesto start -->/g) ?? []).length;
    expect(count).toBe(1);
  });
});

describe('removeAgentFromGlobalClaudeMd', () => {
  it('is a no-op when CLAUDE.md does not exist', () => {
    expect(() => removeAgentFromGlobalClaudeMd('ernesto')).not.toThrow();
  });

  it('removes the agent section', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    removeAgentFromGlobalClaudeMd('ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).not.toContain('<!-- soleri:agent:ernesto start -->');
    expect(content).not.toContain('<!-- soleri:agent:ernesto end -->');
  });

  it('only removes the target agent, leaving others intact', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    scaffoldGlobalClaudeMd('salvador', 'Salvador');
    removeAgentFromGlobalClaudeMd('ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    expect(content).not.toContain('<!-- soleri:agent:ernesto start -->');
    expect(content).toContain('<!-- soleri:agent:salvador start -->');
  });

  it('is a no-op when the agent section is not in the file', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    const before = readFileSync(claudeMdPath, 'utf-8');
    removeAgentFromGlobalClaudeMd('nonexistent');
    const after = readFileSync(claudeMdPath, 'utf-8');
    expect(after).toBe(before);
  });
});
