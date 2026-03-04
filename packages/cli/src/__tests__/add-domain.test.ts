import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addDomain } from '@soleri/forge/lib';

describe('add-domain command', () => {
  let tempDir: string;
  let agentDir: string;

  function createMinimalAgent(): void {
    mkdirSync(join(agentDir, 'src', 'intelligence', 'data'), { recursive: true });
    mkdirSync(join(agentDir, 'src', 'facades'), { recursive: true });
    mkdirSync(join(agentDir, 'src', 'activation'), { recursive: true });
    writeFileSync(
      join(agentDir, 'package.json'),
      JSON.stringify({
        name: 'test-agent-mcp',
        scripts: { build: 'echo build' },
      }),
    );
    // Minimal index.ts with anchors
    writeFileSync(
      join(agentDir, 'src', 'index.ts'),
      [
        "import { createCoreFacade } from './facades/core.facade.js';",
        '',
        'const facades = [',
        '    createCoreFacade(vault, brain),',
        '];',
      ].join('\n'),
    );
  }

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-add-domain-test-${Date.now()}`);
    agentDir = join(tempDir, 'test-agent');
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should fail if no package.json', async () => {
    mkdirSync(agentDir, { recursive: true });
    const result = await addDomain({ agentPath: agentDir, domain: 'security', noBuild: true });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('package.json');
  });

  it('should fail if package name does not end with -mcp', async () => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'not-agent' }));
    const result = await addDomain({ agentPath: agentDir, domain: 'security', noBuild: true });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('-mcp');
  });

  it('should fail with invalid domain name', async () => {
    createMinimalAgent();
    const result = await addDomain({ agentPath: agentDir, domain: 'Invalid', noBuild: true });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('kebab-case');
  });

  it('should fail if domain already exists', async () => {
    createMinimalAgent();
    writeFileSync(
      join(agentDir, 'src', 'intelligence', 'data', 'security.json'),
      JSON.stringify({ domain: 'security', version: '1.0.0', entries: [] }),
    );

    const result = await addDomain({ agentPath: agentDir, domain: 'security', noBuild: true });
    expect(result.success).toBe(false);
    expect(result.summary).toContain('already exists');
  });

  it('should create empty bundle and facade', async () => {
    createMinimalAgent();

    const result = await addDomain({ agentPath: agentDir, domain: 'security', noBuild: true });
    expect(result.success).toBe(true);

    // Bundle
    const bundle = JSON.parse(
      readFileSync(join(agentDir, 'src', 'intelligence', 'data', 'security.json'), 'utf-8'),
    );
    expect(bundle.domain).toBe('security');
    expect(bundle.entries).toEqual([]);

    // Facade
    expect(existsSync(join(agentDir, 'src', 'facades', 'security.facade.ts'))).toBe(true);
  });

  it('should patch index.ts with new import and facade', async () => {
    createMinimalAgent();

    await addDomain({ agentPath: agentDir, domain: 'security', noBuild: true });

    const indexContent = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('createSecurityFacade');
    expect(indexContent).toContain('import { createSecurityFacade }');
  });

  it('should handle agents without brain directory', async () => {
    createMinimalAgent();
    // No brain dir → vault-only facade

    const result = await addDomain({ agentPath: agentDir, domain: 'api-design', noBuild: true });
    expect(result.success).toBe(true);

    const facade = readFileSync(join(agentDir, 'src', 'facades', 'api-design.facade.ts'), 'utf-8');
    // Vault-only facades import from vault directly, not from @soleri/core
    expect(facade).toContain('vault');
  });
});
