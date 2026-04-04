/**
 * Unit tests for validate-skills — the user-installed SKILL.md validator.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSkillDocs } from './validate-skills.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createSkillsDir(): string {
  return mkdtempSync(join(tmpdir(), 'soleri-validate-skills-test-'));
}

function addSkill(skillsDir: string, skillName: string, content: string): void {
  const skillDir = join(skillsDir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8');
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('validateSkillDocs', () => {
  let skillsDir: string;

  beforeEach(() => {
    skillsDir = createSkillsDir();
  });

  afterEach(() => {
    rmSync(skillsDir, { recursive: true, force: true });
  });

  it('returns valid=true and no errors when the skills directory is empty', () => {
    const result = validateSkillDocs(skillsDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalFiles).toBe(0);
    expect(result.totalExamples).toBe(0);
  });

  it('returns valid=true for a SKILL.md with no op-call examples', () => {
    addSkill(
      skillsDir,
      'my-skill',
      `# My Skill

This skill does something useful.

## Usage

Just invoke it.
`,
    );

    const result = validateSkillDocs(skillsDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalFiles).toBe(1);
    expect(result.totalExamples).toBe(0);
  });

  it('returns valid=true when op-call params match the schema', () => {
    addSkill(
      skillsDir,
      'capture-skill',
      `# Capture Skill

Captures knowledge to the vault.

\`\`\`
YOUR_AGENT_core op:capture_knowledge params: { projectPath: ".", entries: [{ type: "pattern", domain: "testing", title: "Use vitest", description: "Prefer vitest for unit tests", severity: "info" }] }
\`\`\`
`,
    );

    const result = validateSkillDocs(skillsDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports an error when severity has an invalid enum value', () => {
    // "suggestion" is not in the capture_knowledge severity enum (valid: critical, warning, info)
    addSkill(
      skillsDir,
      'bad-severity-skill',
      `# Bad Skill

Example with wrong severity enum:

\`\`\`
YOUR_AGENT_core op:capture_knowledge params: { entries: [{ type: "pattern", domain: "testing", title: "Test", description: "A test", severity: "suggestion" }] }
\`\`\`
`,
    );

    const result = validateSkillDocs(skillsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const severityError = result.errors.find(
      (e) => e.op === 'capture_knowledge' && e.message.toLowerCase().includes('invalid'),
    );
    expect(severityError).toBeDefined();
    expect(severityError!.file).toContain('bad-severity-skill');
  });

  it('reports an error when scope receives an object instead of a string', () => {
    // create_plan scope expects z.string() but we pass an object
    addSkill(
      skillsDir,
      'bad-scope-skill',
      `# Bad Scope Skill

Example with wrong scope type:

\`\`\`
YOUR_AGENT_core op:create_plan params: { title: "My Plan", objective: "Do something", scope: { included: [] } }
\`\`\`
`,
    );

    const result = validateSkillDocs(skillsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const scopeError = result.errors.find(
      (e) => e.op === 'create_plan' && e.message.includes('scope'),
    );
    expect(scopeError).toBeDefined();
    expect(scopeError!.message).toContain('Expected string');
  });

  it('returns structured error objects with required fields', () => {
    addSkill(
      skillsDir,
      'structured-error-skill',
      `# Structured Error Skill

\`\`\`
YOUR_AGENT_core op:capture_knowledge params: { entries: [{ type: "pattern", domain: "testing", title: "Test", description: "A test", severity: "suggestion" }] }
\`\`\`
`,
    );

    const result = validateSkillDocs(skillsDir);

    // "suggestion" is not a valid severity — expect at least one error
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors[0];
    expect(err).toHaveProperty('file');
    expect(err).toHaveProperty('op');
    expect(err).toHaveProperty('message');
    expect(typeof err.file).toBe('string');
    expect(typeof err.op).toBe('string');
    expect(typeof err.message).toBe('string');
  });

  it('includes the file path and op name in each error', () => {
    addSkill(
      skillsDir,
      'named-skill',
      `# Named Skill

\`\`\`
YOUR_AGENT_core op:capture_knowledge params: { entries: [{ type: "pattern", domain: "testing", title: "Test", description: "A test", severity: "suggestion" }] }
\`\`\`
`,
    );

    const result = validateSkillDocs(skillsDir);
    expect(result.errors.length).toBeGreaterThan(0);

    const err = result.errors[0];
    expect(err.file).toContain('named-skill');
    expect(err.op).toBe('capture_knowledge');
  });

  it('builds a schema registry covering core ops', () => {
    const result = validateSkillDocs(skillsDir);
    // Registry must cover: capture_knowledge, capture_quick, create_plan, approve_plan, etc.
    expect(result.registrySize).toBeGreaterThanOrEqual(60);
  });

  it('handles a skills directory that does not exist', () => {
    const nonExistentDir = join(skillsDir, 'does-not-exist');
    const result = validateSkillDocs(nonExistentDir);
    expect(result.valid).toBe(true);
    expect(result.totalFiles).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('counts multiple skill files correctly', () => {
    addSkill(
      skillsDir,
      'skill-one',
      `# Skill One\n\n\`\`\`\nYOUR_AGENT_core op:capture_quick params: { title: "Test", content: "Content" }\n\`\`\`\n`,
    );
    addSkill(skillsDir, 'skill-two', `# Skill Two\n\nNo examples here.\n`);

    const result = validateSkillDocs(skillsDir);
    expect(result.totalFiles).toBe(2);
  });
});
