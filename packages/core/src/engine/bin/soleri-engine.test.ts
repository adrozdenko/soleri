/**
 * Tests for soleri-engine boot-time validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAgentConfig } from './validate-agent-config.js';
import { isAgentProjectDir, sameAgentYaml } from './agent-project.js';

describe('validateAgentConfig', () => {
  const yamlPath = '/fake/agent.yaml';

  it('passes with valid id and name', () => {
    expect(() => validateAgentConfig({ id: 'my-agent', name: 'My Agent' }, yamlPath)).not.toThrow();
  });

  it('throws when id is missing', () => {
    expect(() => validateAgentConfig({ name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is empty string', () => {
    expect(() => validateAgentConfig({ id: '', name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is whitespace-only', () => {
    expect(() => validateAgentConfig({ id: '  ', name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is not a string', () => {
    expect(() => validateAgentConfig({ id: 123, name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when name is missing', () => {
    expect(() => validateAgentConfig({ id: 'my-agent' }, yamlPath)).toThrow(
      "agent.yaml requires a 'name' field",
    );
  });

  it('throws when name is empty string', () => {
    expect(() => validateAgentConfig({ id: 'my-agent', name: '' }, yamlPath)).toThrow(
      "agent.yaml requires a 'name' field",
    );
  });

  it('includes the yaml path in the error message', () => {
    expect(() => validateAgentConfig({}, yamlPath)).toThrow(yamlPath);
  });
});

describe('isAgentProjectDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'soleri-engine-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true when agent.yaml exists at the directory', () => {
    writeFileSync(join(dir, 'agent.yaml'), 'id: test\nname: Test\n');
    expect(isAgentProjectDir(dir)).toBe(true);
  });

  it('returns false when agent.yaml is missing', () => {
    expect(isAgentProjectDir(dir)).toBe(false);
  });

  it('returns false for unrelated project directories', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'README.md'), '');
    expect(isAgentProjectDir(dir)).toBe(false);
  });

  it('returns false for non-existent paths', () => {
    expect(isAgentProjectDir(join(dir, 'does-not-exist'))).toBe(false);
  });

  it('returns false when agent.yaml is a directory, not a file', () => {
    // existsSync() would return true for a directory — statSync().isFile() guards this.
    mkdirSync(join(dir, 'agent.yaml'));
    expect(isAgentProjectDir(dir)).toBe(false);
  });
});

describe('sameAgentYaml', () => {
  it('returns true for identical absolute paths', () => {
    expect(sameAgentYaml('/a/b/agent.yaml', '/a/b/agent.yaml')).toBe(true);
  });

  it('returns true after normalizing relative segments', () => {
    expect(sameAgentYaml('/a/b/../b/agent.yaml', '/a/b/agent.yaml')).toBe(true);
  });

  it('returns false for different files', () => {
    expect(sameAgentYaml('/a/b/agent.yaml', '/x/y/agent.yaml')).toBe(false);
  });
});
