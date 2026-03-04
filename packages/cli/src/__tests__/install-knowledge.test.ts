import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installKnowledge } from '@soleri/forge/lib';

describe('install-knowledge command', () => {
  let tempDir: string;
  let agentDir: string;
  let bundleDir: string;

  function createMinimalAgent(): void {
    mkdirSync(join(agentDir, 'src', 'intelligence', 'data'), { recursive: true });
    mkdirSync(join(agentDir, 'src', 'facades'), { recursive: true });
    writeFileSync(
      join(agentDir, 'package.json'),
      JSON.stringify({
        name: 'test-agent-mcp',
        scripts: { build: 'echo build' },
      }),
    );
  }

  function createBundle(domain: string, entries: unknown[] = []): string {
    const bundlePath = join(bundleDir, `${domain}.json`);
    writeFileSync(
      bundlePath,
      JSON.stringify({
        domain,
        version: '1.0.0',
        entries: entries.length
          ? entries
          : [
              {
                id: `${domain}-pattern-1`,
                type: 'pattern',
                domain,
                title: `${domain} Pattern`,
                severity: 'suggestion',
                description: `A ${domain} pattern for testing.`,
                tags: [domain],
              },
            ],
      }),
    );
    return bundlePath;
  }

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-knowledge-test-${Date.now()}`);
    agentDir = join(tempDir, 'test-agent');
    bundleDir = join(tempDir, 'bundles');
    mkdirSync(bundleDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail if agent path is invalid', async () => {
    const result = await installKnowledge({
      agentPath: join(tempDir, 'nonexistent'),
      bundlePath: bundleDir,
    });
    expect(result.success).toBe(false);
  });

  it('should fail if no bundles found', async () => {
    createMinimalAgent();
    const emptyDir = join(tempDir, 'empty-bundles');
    mkdirSync(emptyDir);

    const result = await installKnowledge({
      agentPath: agentDir,
      bundlePath: emptyDir,
    });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('No .json bundle files');
  });

  it('should install a single bundle', async () => {
    createMinimalAgent();
    createBundle('security');

    const result = await installKnowledge({
      agentPath: agentDir,
      bundlePath: bundleDir,
      generateFacades: false,
    });

    expect(result.success).toBe(true);
    expect(result.bundlesInstalled).toBe(1);
    expect(result.domainsAdded).toContain('security');
    expect(existsSync(join(agentDir, 'src', 'intelligence', 'data', 'security.json'))).toBe(true);
  });

  it('should classify domains as added vs updated', async () => {
    createMinimalAgent();
    // Pre-existing domain
    writeFileSync(
      join(agentDir, 'src', 'intelligence', 'data', 'security.json'),
      JSON.stringify({ domain: 'security', version: '0.5.0', entries: [] }),
    );
    // New + updated bundles
    createBundle('security');
    createBundle('api-design');

    const result = await installKnowledge({
      agentPath: agentDir,
      bundlePath: bundleDir,
      generateFacades: false,
    });

    expect(result.domainsUpdated).toContain('security');
    expect(result.domainsAdded).toContain('api-design');
  });
});
