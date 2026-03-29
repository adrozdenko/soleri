import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { addDomain } from '../domain-manager.js';

describe('addDomain — file-tree agents', () => {
  let tempDir: string;
  let agentDir: string;

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `domain-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    agentDir = join(tempDir, 'my-agent');
    mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createFileTreeAgent(opts: { domains?: string[] } = {}): void {
    const yaml = {
      id: 'test-agent',
      name: 'Test Agent',
      role: 'A test agent',
      domains: opts.domains ?? [],
    };
    writeFileSync(join(agentDir, 'agent.yaml'), stringifyYaml(yaml), 'utf-8');
  }

  it('creates knowledge/{domain}.json with empty bundle', async () => {
    createFileTreeAgent();

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(result.success).toBe(true);
    expect(result.domain).toBe('security');
    expect(result.agentId).toBe('test-agent');

    const bundlePath = join(agentDir, 'knowledge', 'security.json');
    expect(existsSync(bundlePath)).toBe(true);

    const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
    expect(bundle).toEqual({ domain: 'security', entries: [] });
  });

  it('updates agent.yaml domains array', async () => {
    createFileTreeAgent({ domains: ['existing'] });

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(result.success).toBe(true);

    const yaml = parseYaml(readFileSync(join(agentDir, 'agent.yaml'), 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(yaml.domains).toEqual(['existing', 'security']);
  });

  it('does NOT require package.json', async () => {
    createFileTreeAgent();
    // Explicitly verify no package.json exists
    expect(existsSync(join(agentDir, 'package.json'))).toBe(false);

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(result.success).toBe(true);
    expect(result.facadeGenerated).toBe(false);
    expect(result.buildOutput).toBe('');
  });

  it('rejects duplicate domain', async () => {
    createFileTreeAgent({ domains: ['security'] });

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(result.success).toBe(false);
    expect(result.warnings[0]).toContain('already exists');
  });

  it('rejects invalid domain name', async () => {
    createFileTreeAgent();

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'Invalid-Name',
      format: 'filetree',
    });

    expect(result.success).toBe(false);
    expect(result.warnings[0]).toContain('kebab-case');
  });

  it('fails when agent.yaml is missing', async () => {
    // No agent.yaml created

    const result = await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(result.success).toBe(false);
    expect(result.warnings[0]).toContain('No agent.yaml found');
  });

  it('creates knowledge/ directory if it does not exist', async () => {
    createFileTreeAgent();
    expect(existsSync(join(agentDir, 'knowledge'))).toBe(false);

    await addDomain({
      agentPath: agentDir,
      domain: 'security',
      format: 'filetree',
    });

    expect(existsSync(join(agentDir, 'knowledge'))).toBe(true);
  });
});
