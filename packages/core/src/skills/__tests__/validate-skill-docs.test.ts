/**
 * Unit tests for the SKILL.md validator.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillDocs } from '../validate-skill-docs.js';

// Resolve monorepo root from this file's location (packages/core/src/skills/__tests__)
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname2, '../../../../..');

/** Create a temp monorepo-shaped root with a single SKILL.md fixture. */
function makeFixtureRoot(skillMd: string): string {
  const root = mkdtempSync(join(tmpdir(), 'skill-docs-'));
  const skillDir = join(root, 'packages', 'forge', 'src', 'skills', 'fixture-skill');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd);
  return root;
}

const fixtureRoots: string[] = [];

function validateFixture(skillMd: string) {
  const root = makeFixtureRoot(skillMd);
  fixtureRoots.push(root);
  return validateSkillDocs(root);
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
  }
});

describe('validateSkillDocs', () => {
  it('builds a non-empty schema registry', () => {
    const result = validateSkillDocs(ROOT_DIR);
    expect(result.registrySize).toBeGreaterThan(100);
  });

  it('discovers SKILL.md files', () => {
    const result = validateSkillDocs(ROOT_DIR);
    expect(result.totalFiles).toBeGreaterThan(10);
  });

  it('extracts op examples from SKILL.md files', () => {
    const result = validateSkillDocs(ROOT_DIR);
    expect(result.totalExamples).toBeGreaterThan(20);
  });

  it('reports zero violations for the shipped SKILL.md docs', () => {
    const result = validateSkillDocs(ROOT_DIR);
    const formatted = result.errors
      .map((e) => `${e.file}:${e.line} — ${e.opName}: ${e.message}`)
      .join('\n');
    expect(result.errors, formatted).toEqual([]);
  });

  it('returns structured error objects with file, line, opName, message', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:update_task params: { planId: "p-1" }\n```\n',
    );
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors[0];
    expect(err).toHaveProperty('file');
    expect(err).toHaveProperty('opName');
    expect(err.opName).toBe('update_task');
    expect(typeof err.line).toBe('number');
    expect(err.line).toBeGreaterThan(0);
  });

  it('detects shape mismatches (create_plan scope as object)', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:create_plan\n  params: { objective: "goal", scope: { included: ["a"] } }\n```\n',
    );
    const scopeError = result.errors.find(
      (e) => e.opName === 'create_plan' && e.message.includes('scope'),
    );
    expect(scopeError).toBeDefined();
    expect(scopeError!.message).toMatch(/expected string, received object/i);
  });

  it('detects unknown ops', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:not_a_real_op params: { foo: "bar" }\n```\n',
    );
    const unknownOp = result.errors.find((e) => e.opName === 'not_a_real_op');
    expect(unknownOp).toBeDefined();
    expect(unknownOp!.message).toContain('unknown op');
  });

  it('detects missing required params', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:merge_patterns params: { keepId: "entry-1" }\n```\n',
    );
    const missing = result.errors.find(
      (e) => e.opName === 'merge_patterns' && e.message.includes('removeId'),
    );
    expect(missing).toBeDefined();
  });

  it('detects invalid enum values on concrete strings', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:update_task params: { planId: "p-1", taskId: "t-1", status: "wip" }\n```\n',
    );
    const enumError = result.errors.find(
      (e) => e.opName === 'update_task' && e.message.includes('status'),
    );
    expect(enumError).toBeDefined();
  });

  it('skips enum mismatches caused by pipe-separated placeholder values', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:update_task params: { planId: "p-1", taskId: "t-1", status: "pending|in_progress|completed" }\n```\n',
    );
    expect(result.errors).toEqual([]);
  });

  it('skips placeholder enum values inside preprocessed schemas (capture_knowledge auto-wrap)', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:capture_knowledge\n  params: { title: "t", description: "d", type: "<pattern|anti-pattern>", domain: "testing" }\n```\n',
    );
    expect(result.errors).toEqual([]);
  });

  it('knows ops that declare no params schema (brain_stats, loop_status)', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:brain_stats params: { verbose: true }\nYOUR_AGENT_loop op:loop_status params: { loopId: "l-1" }\n```\n',
    );
    // The ops exist — they must not be reported as unknown, and with no
    // schema there is nothing to validate params against.
    expect(result.errors).toEqual([]);
  });

  it('registers ops from factories outside runtime/facades (core, dream)', () => {
    const result = validateFixture(
      '```\nYOUR_AGENT_core op:activate params: { projectPath: "." }\nYOUR_AGENT_dream op:dream_run params: { force: true }\n```\n',
    );
    expect(result.errors).toEqual([]);
  });
});
