import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { previewScaffold, scaffold } from '@soleri/forge/lib';
import type { AgentConfig } from '@soleri/forge/lib';

describe('create command', () => {
  let tempDir: string;

  const testConfig: AgentConfig = {
    id: 'test-agent',
    name: 'TestAgent',
    role: 'A test agent',
    description: 'This agent is used for testing the CLI create command.',
    domains: ['testing', 'quality'],
    principles: ['Test everything', 'Quality first'],
    greeting: 'Hello! I am TestAgent, here to help with testing.',
    outputDir: '',
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-create-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    testConfig.outputDir = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should preview scaffold without creating files', () => {
    const preview = previewScaffold(testConfig);

    expect(preview.agentDir).toBe(join(tempDir, 'test-agent'));
    expect(preview.persona.name).toBe('TestAgent');
    expect(preview.domains).toEqual(['testing', 'quality']);
    expect(preview.files.length).toBeGreaterThan(10);
    expect(existsSync(preview.agentDir)).toBe(false);
  });

  it('should scaffold agent successfully', () => {
    const result = scaffold(testConfig);

    expect(result.success).toBe(true);
    expect(result.agentDir).toBe(join(tempDir, 'test-agent'));
    expect(result.filesCreated.length).toBeGreaterThan(10);
    expect(existsSync(join(tempDir, 'test-agent', 'package.json'))).toBe(true);
    expect(existsSync(join(tempDir, 'test-agent', 'src', 'index.ts'))).toBe(true);
  });

  it('should fail if directory already exists', () => {
    scaffold(testConfig);
    const result = scaffold(testConfig);

    expect(result.success).toBe(false);
    expect(result.summary).toContain('already exists');
  });

  it('should create domain facades for each domain', () => {
    scaffold(testConfig);

    expect(existsSync(join(tempDir, 'test-agent', 'src', 'facades', 'testing.facade.ts'))).toBe(
      true,
    );
    expect(existsSync(join(tempDir, 'test-agent', 'src', 'facades', 'quality.facade.ts'))).toBe(
      true,
    );
  });

  it('should create intelligence data files for each domain', () => {
    scaffold(testConfig);

    const testingBundle = JSON.parse(
      readFileSync(
        join(tempDir, 'test-agent', 'src', 'intelligence', 'data', 'testing.json'),
        'utf-8',
      ),
    );
    expect(testingBundle.domain).toBe('testing');
    expect(testingBundle.entries).toEqual([]);
  });

  it('should read config from file for non-interactive mode', () => {
    const configPath = join(tempDir, 'agent.json');
    writeFileSync(configPath, JSON.stringify(testConfig), 'utf-8');

    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(raw.id).toBe('test-agent');
    expect(raw.domains).toEqual(['testing', 'quality']);
  });
});
