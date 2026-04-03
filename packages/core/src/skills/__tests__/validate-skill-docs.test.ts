/**
 * Unit tests for the SKILL.md validator.
 */

import { describe, it, expect } from 'vitest';
import { validateSkillDocs } from '../validate-skill-docs.js';

// Resolve monorepo root from this file's location (packages/core/src/skills/__tests__)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname2, '../../../../..');

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

  it('returns structured error objects with file, line, opName, message', () => {
    const result = validateSkillDocs(ROOT_DIR);
    // We expect some errors in the current state of docs
    if (result.errors.length > 0) {
      const err = result.errors[0];
      expect(err).toHaveProperty('file');
      expect(err).toHaveProperty('line');
      expect(err).toHaveProperty('opName');
      expect(err).toHaveProperty('message');
      expect(typeof err.line).toBe('number');
      expect(err.line).toBeGreaterThan(0);
    }
  });

  it('detects the create_plan scope mismatch', () => {
    const result = validateSkillDocs(ROOT_DIR);
    const scopeError = result.errors.find(
      (e) => e.opName === 'create_plan' && e.message.includes('scope'),
    );
    expect(scopeError).toBeDefined();
    expect(scopeError!.message).toContain('Expected string');
  });

  it('detects unknown ops', () => {
    const result = validateSkillDocs(ROOT_DIR);
    const unknownOps = result.errors.filter((e) => e.message.includes('unknown op'));
    expect(unknownOps.length).toBeGreaterThan(0);
  });
});
