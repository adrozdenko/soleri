import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  installKnowledge,
  patchIndexTs,
  patchClaudeMdContent,
  generateVaultOnlyDomainFacade,
} from '../knowledge-installer.js';

describe('Knowledge Installer', () => {
  let tempDir: string;
  let agentDir: string;
  let bundleDir: string;

  // --- Helpers to build a minimal agent structure ---

  function createMinimalAgent(opts: { hasBrain?: boolean } = {}): void {
    const { hasBrain = true } = opts;

    // package.json
    writeFileSync(
      join(agentDir, 'package.json'),
      JSON.stringify({ name: 'test-agent-mcp', version: '1.0.0' }),
    );

    // src/intelligence/data/ with one existing domain
    mkdirSync(join(agentDir, 'src', 'intelligence', 'data'), { recursive: true });
    writeFileSync(
      join(agentDir, 'src', 'intelligence', 'data', 'existing-domain.json'),
      JSON.stringify({ domain: 'existing-domain', version: '1.0.0', entries: [] }),
    );

    // src/facades/
    mkdirSync(join(agentDir, 'src', 'facades'), { recursive: true });

    // src/activation/
    mkdirSync(join(agentDir, 'src', 'activation'), { recursive: true });

    // Brain directory (if applicable)
    if (hasBrain) {
      mkdirSync(join(agentDir, 'src', 'brain'), { recursive: true });
    }
  }

  function createMockBundle(domain: string, entryCount: number = 2): string {
    const entries = Array.from({ length: entryCount }, (_, i) => ({
      id: `${domain}-${i + 1}`,
      type: 'pattern',
      domain,
      title: `${domain} pattern ${i + 1}`,
      severity: 'warning',
      description: `Description for ${domain} pattern ${i + 1}`,
      tags: [domain, 'test'],
    }));

    const file = join(bundleDir, `${domain}.json`);
    writeFileSync(file, JSON.stringify({ domain, version: '1.0.0', entries }));
    return file;
  }

  function createMockIndexTs(): void {
    const content = `#!/usr/bin/env node

import { registerAllFacades } from './facades/facade-factory.js';
import { createExistingDomainFacade } from './facades/existing-domain.facade.js';
import { createCoreFacade } from './facades/core.facade.js';
import { Vault } from './vault/vault.js';
import { Brain } from './brain/brain.js';

async function main(): Promise<void> {
  const vault = new Vault('test');
  const brain = new Brain(vault);

  const facades = [
    createExistingDomainFacade(vault, brain),
    createCoreFacade(vault, planner, brain),
  ];

  registerAllFacades(server, facades);
}

main();
`;
    writeFileSync(join(agentDir, 'src', 'index.ts'), content);
  }

  function createMockClaudeMdContent(): void {
    const content = `export function getClaudeMdContent(): string {
  return [
    '# Test Agent',
    '| existing-domain patterns | \`test_agent_existing_domain\` | \`get_patterns\` |',
    '| Search existing-domain | \`test_agent_existing_domain\` | \`search\` |',
    '| Capture existing-domain | \`test_agent_existing_domain\` | \`capture\` |',
    '| Memory search | \`test_agent_core\` | \`memory_search\` |',
    '| Memory capture | \`test_agent_core\` | \`memory_capture\` |',
  ].join('\\n');
}
`;
    writeFileSync(join(agentDir, 'src', 'activation', 'claude-md-content.ts'), content);
  }

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-ki-test-${Date.now()}`);
    agentDir = join(tempDir, 'test-agent');
    bundleDir = join(tempDir, 'bundles');
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(bundleDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Validation tests ──────────────────────────────────────────

  describe('validation', () => {
    it('should fail if package.json is missing', async () => {
      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain('No package.json found');
    });

    it('should fail if package name does not end with -mcp', async () => {
      writeFileSync(
        join(agentDir, 'package.json'),
        JSON.stringify({ name: 'not-an-agent' }),
      );

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain('does not end with -mcp');
    });

    it('should fail if intelligence data directory is missing', async () => {
      writeFileSync(
        join(agentDir, 'package.json'),
        JSON.stringify({ name: 'test-agent-mcp' }),
      );

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain('src/intelligence/data/ directory not found');
    });

    it('should fail if no bundle files found', async () => {
      createMinimalAgent();

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: join(tempDir, 'nonexistent'),
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain('No .json bundle files');
    });

    it('should fail if all bundles have validation errors', async () => {
      createMinimalAgent();
      writeFileSync(join(bundleDir, 'bad.json'), JSON.stringify({ entries: 'not-array' }));

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.success).toBe(false);
      expect(result.summary).toContain('All bundles failed validation');
    });
  });

  // ── Bundle validation ─────────────────────────────────────────

  describe('bundle validation', () => {
    it('should validate entry required fields', async () => {
      createMinimalAgent();
      writeFileSync(
        join(bundleDir, 'bad.json'),
        JSON.stringify({
          domain: 'test',
          version: '1.0.0',
          entries: [{ id: '', type: 'invalid', tags: 'not-array' }],
        }),
      );

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.success).toBe(false);
    });

    it('should accept a single .json file as bundlePath', async () => {
      createMinimalAgent();
      const file = createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: file,
        generateFacades: false,
      });

      // Will fail at build step since there's no real build setup, but bundles should be installed
      expect(result.bundlesInstalled).toBe(1);
      expect(result.domainsAdded).toContain('new-domain');
    });

    it('should skip invalid bundles but install valid ones', async () => {
      createMinimalAgent();
      createMockBundle('valid-domain', 3);
      writeFileSync(
        join(bundleDir, 'invalid.json'),
        JSON.stringify({ domain: 'bad', version: '1.0.0', entries: [{ id: '' }] }),
      );

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.bundlesInstalled).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ── Bundle copying ────────────────────────────────────────────

  describe('bundle copying', () => {
    it('should copy bundles to intelligence data directory', async () => {
      createMinimalAgent();
      createMockBundle('new-domain', 5);

      await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      const dest = join(agentDir, 'src', 'intelligence', 'data', 'new-domain.json');
      expect(existsSync(dest)).toBe(true);

      const copied = JSON.parse(readFileSync(dest, 'utf-8'));
      expect(copied.domain).toBe('new-domain');
      expect(copied.entries).toHaveLength(5);
    });

    it('should overwrite existing bundle files (upsert)', async () => {
      createMinimalAgent();
      createMockBundle('existing-domain', 3);

      await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      const dest = join(agentDir, 'src', 'intelligence', 'data', 'existing-domain.json');
      const copied = JSON.parse(readFileSync(dest, 'utf-8'));
      expect(copied.entries).toHaveLength(3); // overwritten with 3 entries
    });

    it('should copy to dist directory if it exists', async () => {
      createMinimalAgent();
      mkdirSync(join(agentDir, 'dist'), { recursive: true });
      createMockBundle('new-domain');

      await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      const distFile = join(agentDir, 'dist', 'intelligence', 'data', 'new-domain.json');
      expect(existsSync(distFile)).toBe(true);
    });

    it('should classify domains as added vs updated', async () => {
      createMinimalAgent();
      createMockBundle('existing-domain', 1);
      createMockBundle('brand-new', 2);

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.domainsAdded).toContain('brand-new');
      expect(result.domainsUpdated).toContain('existing-domain');
    });
  });

  // ── Facade generation ─────────────────────────────────────────

  describe('facade generation', () => {
    it('should generate vault+brain facades when brain dir exists', async () => {
      createMinimalAgent({ hasBrain: true });
      createMockBundle('new-domain');

      await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      const facadePath = join(agentDir, 'src', 'facades', 'new-domain.facade.ts');
      expect(existsSync(facadePath)).toBe(true);

      const content = readFileSync(facadePath, 'utf-8');
      expect(content).toContain('brain: Brain');
      expect(content).toContain('brain.intelligentSearch');
      expect(content).toContain('brain.enrichAndCapture');
    });

    it('should generate vault-only facades when brain dir is absent', async () => {
      createMinimalAgent({ hasBrain: false });
      createMockBundle('new-domain');

      await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      const facadePath = join(agentDir, 'src', 'facades', 'new-domain.facade.ts');
      expect(existsSync(facadePath)).toBe(true);

      const content = readFileSync(facadePath, 'utf-8');
      expect(content).toContain('vault: Vault');
      expect(content).not.toContain('brain: Brain');
      expect(content).toContain('vault.search');
      expect(content).toContain('vault.add');
    });

    it('should not generate facades for updated (existing) domains', async () => {
      createMinimalAgent();
      createMockBundle('existing-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.facadesGenerated).toEqual([]);
    });

    it('should skip facade generation when generateFacades is false', async () => {
      createMinimalAgent();
      createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.facadesGenerated).toEqual([]);
      const facadePath = join(agentDir, 'src', 'facades', 'new-domain.facade.ts');
      expect(existsSync(facadePath)).toBe(false);
    });
  });

  // ── generateVaultOnlyDomainFacade ─────────────────────────────

  describe('generateVaultOnlyDomainFacade', () => {
    it('should generate valid facade code', () => {
      const code = generateVaultOnlyDomainFacade('gaudi', 'api-design');

      expect(code).toContain('createApiDesignFacade');
      expect(code).toContain("name: 'gaudi_api_design'");
      expect(code).toContain('vault: Vault');
      expect(code).not.toContain('Brain');
      expect(code).toContain('vault.search');
      expect(code).toContain('vault.add');
    });

    it('should use correct facade name with underscores', () => {
      const code = generateVaultOnlyDomainFacade('my-agent', 'web-components');

      expect(code).toContain("name: 'my-agent_web_components'");
      expect(code).toContain('createWebComponentsFacade');
    });
  });

  // ── patchIndexTs ──────────────────────────────────────────────

  describe('patchIndexTs', () => {
    const sampleSource = `import { registerAllFacades } from './facades/facade-factory.js';
import { createExistingFacade } from './facades/existing.facade.js';
import { createCoreFacade } from './facades/core.facade.js';
import { Vault } from './vault/vault.js';

  const facades = [
    createExistingFacade(vault, brain),
    createCoreFacade(vault, planner, brain),
  ];
`;

    it('should insert imports before createCoreFacade import', () => {
      const result = patchIndexTs(sampleSource, ['api-design', 'security'], true);
      expect(result).not.toBeNull();

      const lines = result!.split('\n');
      const apiImportIdx = lines.findIndex((l) => l.includes('createApiDesignFacade'));
      const secImportIdx = lines.findIndex((l) => l.includes('createSecurityFacade'));
      const coreImportIdx = lines.findIndex((l) => l.includes('createCoreFacade'));

      expect(apiImportIdx).toBeLessThan(coreImportIdx);
      expect(secImportIdx).toBeLessThan(coreImportIdx);
    });

    it('should insert facade creations before createCoreFacade call', () => {
      const result = patchIndexTs(sampleSource, ['api-design'], true);
      expect(result).not.toBeNull();

      const lines = result!.split('\n');
      const newFacadeIdx = lines.findIndex((l) => l.includes('createApiDesignFacade(vault, brain)'));
      const coreFacadeIdx = lines.findIndex((l) => l.includes('createCoreFacade(vault'));

      expect(newFacadeIdx).toBeLessThan(coreFacadeIdx);
    });

    it('should use vault-only args when hasBrain is false', () => {
      const vaultOnlySource = sampleSource
        .replace('brain: Brain', '')
        .replace('createExistingFacade(vault, brain)', 'createExistingFacade(vault)');

      const result = patchIndexTs(vaultOnlySource, ['api-design'], false);
      expect(result).not.toBeNull();
      expect(result).toContain('createApiDesignFacade(vault),');
    });

    it('should return null if anchor patterns are missing', () => {
      const badSource = 'const x = 1;';
      expect(patchIndexTs(badSource, ['test'], true)).toBeNull();
    });
  });

  // ── patchClaudeMdContent ──────────────────────────────────────

  describe('patchClaudeMdContent', () => {
    const sampleSource = `export function getClaudeMdContent(): string {
  return [
    '| existing patterns | \`test_existing\` | \`get_patterns\` |',
    '| Memory search | \`test_core\` | \`memory_search\` |',
    '| Memory capture | \`test_core\` | \`memory_capture\` |',
  ].join('\\n');
}
`;

    it('should insert domain rows before Memory search', () => {
      const result = patchClaudeMdContent(sampleSource, 'test', ['api-design']);
      expect(result).not.toBeNull();

      const lines = result!.split('\n');
      const newRowIdx = lines.findIndex((l) => l.includes('api-design patterns'));
      const memoryIdx = lines.findIndex((l) => l.includes('Memory search'));

      expect(newRowIdx).toBeGreaterThan(-1);
      expect(newRowIdx).toBeLessThan(memoryIdx);
    });

    it('should generate 3 rows per domain (patterns, search, capture)', () => {
      const result = patchClaudeMdContent(sampleSource, 'test', ['api-design']);
      expect(result).not.toBeNull();

      expect(result).toContain('api-design patterns');
      expect(result).toContain('Search api-design');
      expect(result).toContain('Capture api-design');
    });

    it('should use correct facade name with agentId', () => {
      const result = patchClaudeMdContent(sampleSource, 'my-agent', ['web-components']);
      expect(result).not.toBeNull();

      expect(result).toContain('my_agent_web_components');
    });

    it('should handle multiple new domains', () => {
      const result = patchClaudeMdContent(sampleSource, 'test', ['api-design', 'security']);
      expect(result).not.toBeNull();

      expect(result).toContain('api-design patterns');
      expect(result).toContain('security patterns');

      // All new rows should be before Memory search
      const lines = result!.split('\n');
      const memoryIdx = lines.findIndex((l) => l.includes('Memory search'));
      const apiIdx = lines.findIndex((l) => l.includes('api-design'));
      const secIdx = lines.findIndex((l) => l.includes('security'));

      expect(apiIdx).toBeLessThan(memoryIdx);
      expect(secIdx).toBeLessThan(memoryIdx);
    });

    it('should return null if anchor is missing', () => {
      const badSource = 'export const x = 1;';
      expect(patchClaudeMdContent(badSource, 'test', ['api'])).toBeNull();
    });

    it('should use fallback anchor (## Intent Detection) for older agents', () => {
      // Older agents don't have Memory search rows — they go straight to Intent Detection
      const olderSource = `export function getClaudeMdContent(): string {
  return [
    '| existing patterns | \`test_existing\` | \`get_patterns\` |',
    '',
    '## Intent Detection',
    '',
  ].join('\\n');
}
`;
      const result = patchClaudeMdContent(olderSource, 'test', ['api-design']);
      expect(result).not.toBeNull();

      // New rows should appear before Intent Detection
      const lines = result!.split('\n');
      const newRowIdx = lines.findIndex((l) => l.includes('api-design patterns'));
      const intentIdx = lines.findIndex((l) => l.includes('Intent Detection'));

      expect(newRowIdx).toBeGreaterThan(-1);
      expect(newRowIdx).toBeLessThan(intentIdx);
    });
  });

  // ── Integration (source patching) ─────────────────────────────

  describe('integration - source patching', () => {
    it('should patch index.ts when new domains are added', async () => {
      createMinimalAgent();
      createMockIndexTs();
      createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.sourceFilesPatched).toContain('src/index.ts');

      const patched = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
      expect(patched).toContain('createNewDomainFacade');
      expect(patched).toContain("'./facades/new-domain.facade.js'");
    });

    it('should patch claude-md-content.ts when new domains are added', async () => {
      createMinimalAgent();
      createMockClaudeMdContent();
      createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.sourceFilesPatched).toContain('src/activation/claude-md-content.ts');

      const patched = readFileSync(
        join(agentDir, 'src', 'activation', 'claude-md-content.ts'),
        'utf-8',
      );
      expect(patched).toContain('new-domain patterns');
      expect(patched).toContain('test_agent_new_domain');
    });

    it('should not patch source files when only updating existing domains', async () => {
      createMinimalAgent();
      createMockIndexTs();
      createMockClaudeMdContent();
      createMockBundle('existing-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.sourceFilesPatched).toEqual([]);
      expect(result.facadesGenerated).toEqual([]);
    });

    it('should warn if index.ts patching fails', async () => {
      createMinimalAgent();
      // Write a non-standard index.ts that won't match anchors
      writeFileSync(join(agentDir, 'src', 'index.ts'), 'const x = 1;');
      createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.warnings).toContainEqual(
        expect.stringContaining('Could not patch src/index.ts'),
      );
    });
  });

  // ── Idempotency ────────────────────────────────────────────────

  describe('idempotency', () => {
    it('patchIndexTs should not duplicate imports already present', () => {
      const sourceWithExisting = `import { registerAllFacades } from './facades/facade-factory.js';
import { createApiDesignFacade } from './facades/api-design.facade.js';
import { createCoreFacade } from './facades/core.facade.js';

  const facades = [
    createApiDesignFacade(vault, brain),
    createCoreFacade(vault, planner, brain),
  ];
`;
      // api-design already exists — should not be duplicated
      const result = patchIndexTs(sourceWithExisting, ['api-design'], true);
      expect(result).not.toBeNull();

      const importCount = (result!.match(/createApiDesignFacade/g) || []).length;
      // 1 import + 1 call = 2 occurrences, not 4
      expect(importCount).toBe(2);
    });

    it('patchIndexTs should add only missing domains from a mixed set', () => {
      const sourceWithExisting = `import { registerAllFacades } from './facades/facade-factory.js';
import { createApiDesignFacade } from './facades/api-design.facade.js';
import { createCoreFacade } from './facades/core.facade.js';

  const facades = [
    createApiDesignFacade(vault, brain),
    createCoreFacade(vault, planner, brain),
  ];
`;
      // api-design exists, security is new
      const result = patchIndexTs(sourceWithExisting, ['api-design', 'security'], true);
      expect(result).not.toBeNull();
      expect(result).toContain('createSecurityFacade');

      const apiCount = (result!.match(/import \{ createApiDesignFacade \}/g) || []).length;
      expect(apiCount).toBe(1); // not duplicated
    });

    it('patchIndexTs should return unchanged source when all domains exist', () => {
      const sourceWithAll = `import { createApiDesignFacade } from './facades/api-design.facade.js';
import { createCoreFacade } from './facades/core.facade.js';

  const facades = [
    createApiDesignFacade(vault, brain),
    createCoreFacade(vault, planner, brain),
  ];
`;
      const result = patchIndexTs(sourceWithAll, ['api-design'], true);
      expect(result).toBe(sourceWithAll);
    });

    it('patchClaudeMdContent should not duplicate rows already present', () => {
      const sourceWithExisting = `export function getClaudeMdContent(): string {
  return [
    '| api-design patterns | \`test_api_design\` | \`get_patterns\` |',
    '| Search api-design | \`test_api_design\` | \`search\` |',
    '| Capture api-design | \`test_api_design\` | \`capture\` |',
    '| Memory search | \`test_core\` | \`memory_search\` |',
  ].join('\\n');
}
`;
      const result = patchClaudeMdContent(sourceWithExisting, 'test', ['api-design']);
      expect(result).toBe(sourceWithExisting); // unchanged
    });

    it('patchClaudeMdContent should add only missing domains', () => {
      const sourceWithExisting = `export function getClaudeMdContent(): string {
  return [
    '| api-design patterns | \`test_api_design\` | \`get_patterns\` |',
    '| Memory search | \`test_core\` | \`memory_search\` |',
  ].join('\\n');
}
`;
      const result = patchClaudeMdContent(sourceWithExisting, 'test', ['api-design', 'security']);
      expect(result).not.toBeNull();
      expect(result).toContain('security patterns');

      // api-design should not be duplicated
      const apiCount = (result!.match(/api-design patterns/g) || []).length;
      expect(apiCount).toBe(1);
    });

    it('should skip facade generation if facade file already exists', async () => {
      createMinimalAgent();
      createMockBundle('new-domain');

      // Pre-create the facade file
      writeFileSync(
        join(agentDir, 'src', 'facades', 'new-domain.facade.ts'),
        '// existing facade',
      );

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      expect(result.facadesGenerated).toEqual([]);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('already exists'),
      );

      // Should not overwrite
      const content = readFileSync(
        join(agentDir, 'src', 'facades', 'new-domain.facade.ts'),
        'utf-8',
      );
      expect(content).toBe('// existing facade');
    });

    it('should be safe to run twice — full double-run', async () => {
      createMinimalAgent();
      createMockIndexTs();
      createMockClaudeMdContent();
      createMockBundle('new-domain', 5);

      // First run
      const first = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });
      expect(first.domainsAdded).toContain('new-domain');
      expect(first.facadesGenerated).toContain('new-domain.facade.ts');
      expect(first.sourceFilesPatched).toContain('src/index.ts');

      const indexAfterFirst = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
      const mdAfterFirst = readFileSync(
        join(agentDir, 'src', 'activation', 'claude-md-content.ts'),
        'utf-8',
      );

      // Second run — same bundles
      const second = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
      });

      // Data files should be updated (upsert)
      expect(second.domainsUpdated).toContain('new-domain');
      expect(second.domainsAdded).toEqual([]);

      // Facade should not be regenerated (file exists now)
      expect(second.facadesGenerated).toEqual([]);

      // Source files should be unchanged (no duplicates)
      const indexAfterSecond = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
      const mdAfterSecond = readFileSync(
        join(agentDir, 'src', 'activation', 'claude-md-content.ts'),
        'utf-8',
      );
      expect(indexAfterSecond).toBe(indexAfterFirst);
      expect(mdAfterSecond).toBe(mdAfterFirst);
    });
  });

  // ── Result shape ──────────────────────────────────────────────

  describe('result', () => {
    it('should return correct entry totals', async () => {
      createMinimalAgent();
      createMockBundle('domain-a', 10);
      createMockBundle('domain-b', 5);

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.bundlesInstalled).toBe(2);
      expect(result.entriesTotal).toBe(15);
    });

    it('should include a summary string', async () => {
      createMinimalAgent();
      createMockBundle('new-domain', 3);

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.summary).toContain('Installed 1 bundle(s)');
      expect(result.summary).toContain('3 entries');
      expect(result.summary).toContain('test-agent');
    });

    it('should extract agentId from package name', async () => {
      createMinimalAgent();
      createMockBundle('new-domain');

      const result = await installKnowledge({
        agentPath: agentDir,
        bundlePath: bundleDir,
        generateFacades: false,
      });

      expect(result.agentId).toBe('test-agent');
    });
  });
});
