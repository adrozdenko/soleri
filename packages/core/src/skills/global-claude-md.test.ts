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

// We patch the module by temporarily pointing HOME (and USERPROFILE on Windows) at a temp dir
beforeEach(() => {
  tmpHome = join(tmpdir(), `soleri-claude-md-test-${Date.now()}`);
  claudeDir = join(tmpHome, '.claude');
  claudeMdPath = join(claudeDir, 'CLAUDE.md');
  mkdirSync(claudeDir, { recursive: true });
  process.env['HOME'] = tmpHome;
  process.env['USERPROFILE'] = tmpHome; // Windows: homedir() reads USERPROFILE, not HOME
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env['HOME'];
  delete process.env['USERPROFILE'];
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
  });

  it('emits compact block with activation, session start, facade table, and pointers', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    // Activation + deactivation pair
    expect(content).toContain('**Activate:**');
    expect(content).toContain('"Hello, Ernesto!"');
    expect(content).toContain('ernesto_core op:activate');
    expect(content).toContain('**Deactivate:**');
    // Session start
    expect(content).toContain('ernesto_orchestrate op:session_start');
    // Facade table — all six facades present
    expect(content).toContain('### Facades (essential ops)');
    expect(content).toContain('`ernesto_vault`');
    expect(content).toContain('`ernesto_plan`');
    expect(content).toContain('`ernesto_brain`');
    expect(content).toContain('`ernesto_orchestrate`');
    expect(content).toContain('`ernesto_admin`');
    expect(content).toContain('`ernesto_memory`');
    // Three deep-dive pointers
    expect(content).toContain('admin_tool_list');
    expect(content).toContain('ernesto-agent-mode');
    expect(content).toContain('project-level');
  });

  it('keeps the per-agent block under 40 lines (compact, not bloated)', () => {
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    const startIdx = content.indexOf('<!-- soleri:agent:ernesto start -->');
    const endIdx = content.indexOf('<!-- soleri:agent:ernesto end -->');
    const block = content.slice(startIdx, endIdx);
    const lineCount = block.split('\n').length;
    // Anti-bloat guardrail. Current compact block is ~24 lines;
    // 40 leaves room for reasonable future additions (new facade row,
    // a pointer) but blocks slipping back into fat-block territory.
    expect(lineCount).toBeLessThan(40);
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

  it('migrates legacy-only marker format (no new marker present)', () => {
    // Simulate: agent previously installed with old format only.
    // Legacy block should be rewritten as the new compact block.
    const legacyFile = [
      '# Soleri Engine',
      '',
      '<!-- agent:ernesto:mode -->',
      '## Ernesto Mode',
      '',
      'legacy fat content here',
      '<!-- /agent:ernesto:mode -->',
      '',
    ].join('\n');
    require('node:fs').writeFileSync(claudeMdPath, legacyFile);

    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');

    const content = readFileSync(claudeMdPath, 'utf-8');
    // Legacy markers gone
    expect(content).not.toContain('<!-- agent:ernesto:mode -->');
    expect(content).not.toContain('<!-- /agent:ernesto:mode -->');
    expect(content).not.toContain('legacy fat content here');
    // New marker + content present
    expect(content).toContain('<!-- soleri:agent:ernesto start -->');
    expect(content).toContain('ernesto_core op:activate');
  });

  it('strips dangling legacy markers even when new marker is already present (the Salvador bug)', () => {
    // Simulate the exact production state: new thin stub already present,
    // but legacy fat block also coexists. Previous implementation skipped
    // the legacy strip because the new marker was found first.
    const corruptedFile = [
      '# Soleri Engine',
      '',
      '<!-- soleri:agent:salvador start -->',
      '## Salvador',
      'Skills for **Salvador** are installed globally.',
      '**Routing:** When you see `salvador_*` MCP tools, follow project CLAUDE.md.',
      '<!-- soleri:agent:salvador end -->',
      '',
      '<!-- agent:salvador:mode -->',
      '## Salvador Mode',
      '',
      '### Activation',
      '- "Hola, Salvador!" → legacy activation',
      '',
      '## Integration',
      'Legacy fat integration block — this should be stripped.',
      '<!-- /agent:salvador:mode -->',
      '',
    ].join('\n');
    require('node:fs').writeFileSync(claudeMdPath, corruptedFile);

    scaffoldGlobalClaudeMd('salvador', 'Salvador');

    const content = readFileSync(claudeMdPath, 'utf-8');
    // Legacy block fully removed
    expect(content).not.toContain('<!-- agent:salvador:mode -->');
    expect(content).not.toContain('<!-- /agent:salvador:mode -->');
    expect(content).not.toContain('Legacy fat integration block');
    expect(content).not.toContain('legacy activation');
    // New marker present exactly once
    const startCount = (content.match(/<!-- soleri:agent:salvador start -->/g) ?? []).length;
    expect(startCount).toBe(1);
  });

  it('is idempotent across runs once legacy markers exist', () => {
    // First run cleans up legacy, second run should produce identical output
    const withLegacy = [
      '<!-- agent:ernesto:mode -->',
      'stale content',
      '<!-- /agent:ernesto:mode -->',
      '',
    ].join('\n');
    require('node:fs').writeFileSync(claudeMdPath, withLegacy);

    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    const afterFirst = readFileSync(claudeMdPath, 'utf-8');
    scaffoldGlobalClaudeMd('ernesto', 'Ernesto');
    const afterSecond = readFileSync(claudeMdPath, 'utf-8');

    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond).not.toContain('<!-- agent:ernesto:mode -->');
    expect(afterSecond).not.toContain('stale content');
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
