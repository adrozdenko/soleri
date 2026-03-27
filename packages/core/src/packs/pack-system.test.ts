import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { packManifestSchema } from './types.js';
import { PackInstaller } from './pack-installer.js';
import { PluginRegistry } from '../plugins/plugin-registry.js';
import { Vault } from '../vault/vault.js';
import type { IntelligenceBundle } from '../intelligence/types.js';

// =============================================================================
// HELPERS
// =============================================================================

let testDir: string;

function setupTestDir(): string {
  testDir = join(tmpdir(), `soleri-pack-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createPackDir(
  parentDir: string,
  id: string,
  manifest: Record<string, unknown>,
  options?: {
    vaultEntries?: IntelligenceBundle;
    skills?: string[];
    hooks?: string[];
  },
): string {
  const dir = join(parentDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soleri-pack.json'), JSON.stringify(manifest));

  if (options?.vaultEntries) {
    const vaultDir = join(dir, 'vault');
    mkdirSync(vaultDir, { recursive: true });
    writeFileSync(join(vaultDir, 'data.json'), JSON.stringify(options.vaultEntries));
  }

  if (options?.skills) {
    const skillsDir = join(dir, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    for (const skill of options.skills) {
      writeFileSync(join(skillsDir, `${skill}.md`), `# ${skill}\nSkill content.`);
    }
  }

  if (options?.hooks) {
    const hooksDir = join(dir, 'hooks');
    mkdirSync(hooksDir, { recursive: true });
    for (const hook of options.hooks) {
      writeFileSync(join(hooksDir, `${hook}.md`), `# ${hook}\nHook content.`);
    }
  }

  return dir;
}

// =============================================================================
// MANIFEST SCHEMA
// =============================================================================

describe('packManifestSchema', () => {
  it('should validate a minimal manifest', () => {
    const result = packManifestSchema.safeParse({
      id: 'my-pack',
      name: 'My Pack',
      version: '1.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('should accept full manifest', () => {
    const result = packManifestSchema.safeParse({
      id: 'design-system',
      name: 'Design System Pack',
      version: '2.0.0',
      description: 'Design system intelligence',
      domains: ['design', 'accessibility'],
      engine: '>=2.8.0',
      dependencies: ['base-pack'],
      facades: [
        {
          name: 'design',
          description: 'Design ops',
          ops: [{ name: 'check_contrast', auth: 'read' }],
        },
      ],
      vault: { dir: 'vault' },
      skills: { dir: 'skills' },
      hooks: { dir: 'hooks' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domains).toEqual(['design', 'accessibility']);
    }
  });

  it('should reject invalid ID', () => {
    const result = packManifestSchema.safeParse({
      id: 'Bad Pack',
      name: 'Bad',
      version: '1.0.0',
    });
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// PACK INSTALLER — VALIDATE
// =============================================================================

describe('PackInstaller', () => {
  let vault: Vault;
  let registry: PluginRegistry;
  let installer: PackInstaller;

  beforeEach(() => {
    vault = new Vault(':memory:');
    registry = new PluginRegistry();
    installer = new PackInstaller(vault, registry);
  });

  afterEach(() => {
    vault.close();
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* cleanup */
      }
    }
  });

  describe('validate', () => {
    it('should validate a minimal pack', () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'minimal', {
        id: 'minimal',
        name: 'Minimal Pack',
        version: '1.0.0',
      });

      const result = installer.validate(packDir);
      expect(result.valid).toBe(true);
      expect(result.manifest?.id).toBe('minimal');
    });

    it('should count vault entries', () => {
      const dir = setupTestDir();
      const packDir = createPackDir(
        dir,
        'with-vault',
        { id: 'with-vault', name: 'Vault Pack', version: '1.0.0', vault: { dir: 'vault' } },
        {
          vaultEntries: {
            domain: 'security',
            version: '1.0.0',
            entries: [
              {
                id: 'sec-001',
                type: 'pattern',
                domain: 'security',
                title: 'Input Validation',
                severity: 'critical',
                description: 'Always validate user input.',
                tags: ['security'],
              },
              {
                id: 'sec-002',
                type: 'anti-pattern',
                domain: 'security',
                title: 'SQL Injection',
                severity: 'critical',
                description: 'Never concatenate user input into SQL.',
                tags: ['security', 'sql'],
              },
            ],
          },
        },
      );

      const result = installer.validate(packDir);
      expect(result.valid).toBe(true);
      expect(result.counts?.vaultEntries).toBe(2);
    });

    it('should count skills and hooks', () => {
      const dir = setupTestDir();
      const packDir = createPackDir(
        dir,
        'full',
        {
          id: 'full',
          name: 'Full Pack',
          version: '1.0.0',
          skills: { dir: 'skills' },
          hooks: { dir: 'hooks' },
        },
        {
          skills: ['design-review', 'token-check'],
          hooks: ['no-inline-styles', 'focus-ring'],
        },
      );

      const result = installer.validate(packDir);
      expect(result.valid).toBe(true);
      expect(result.counts?.skills).toBe(2);
      expect(result.counts?.hooks).toBe(2);
    });

    it('should return error for missing manifest', () => {
      const dir = setupTestDir();
      mkdirSync(join(dir, 'empty-pack'), { recursive: true });

      const result = installer.validate(join(dir, 'empty-pack'));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('No soleri-pack.json');
    });

    it('should return warnings for declared but missing directories', () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'missing-dirs', {
        id: 'missing-dirs',
        name: 'Missing Dirs',
        version: '1.0.0',
        vault: { dir: 'data' },
        skills: { dir: 'my-skills' },
      });

      const result = installer.validate(packDir);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  // ─── INSTALL ──────────────────────────────────────────────────────────

  describe('install', () => {
    it('should install a pack with vault entries', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(
        dir,
        'installable',
        { id: 'installable', name: 'Installable', version: '1.0.0', vault: { dir: 'vault' } },
        {
          vaultEntries: {
            domain: 'test',
            version: '1.0.0',
            entries: [
              {
                id: 'test-001',
                type: 'pattern',
                domain: 'test',
                title: 'Test Pattern',
                severity: 'suggestion',
                description: 'A test pattern.',
                tags: ['test'],
              },
            ],
          },
        },
      );

      const result = await installer.install(packDir);
      expect(result.installed).toBe(true);
      expect(result.vaultEntries).toBe(1);

      // Verify vault was seeded
      const entries = vault.list({ domain: 'test' });
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should install a pack with facades', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'with-facade', {
        id: 'with-facade',
        name: 'Facade Pack',
        version: '1.0.0',
        facades: [
          {
            name: 'test_facade',
            description: 'Test',
            ops: [{ name: 'test_op', description: 'A test', auth: 'read' }],
          },
        ],
      });

      const result = await installer.install(packDir);
      expect(result.installed).toBe(true);
      expect(result.facades).toBe(1);

      // Verify plugin was registered
      const plugin = registry.get('with-facade');
      expect(plugin).toBeDefined();
      expect(plugin?.status).toBe('active');
    });

    it('should install a pack with skills and hooks', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(
        dir,
        'with-extras',
        {
          id: 'with-extras',
          name: 'Extras',
          version: '1.0.0',
          skills: { dir: 'skills' },
          hooks: { dir: 'hooks' },
        },
        {
          skills: ['my-skill'],
          hooks: ['my-hook'],
        },
      );

      const result = await installer.install(packDir);
      expect(result.installed).toBe(true);
      expect(result.skills).toEqual(['my-skill']);
      expect(result.hooks).toEqual(['my-hook']);
    });

    it('should reject duplicate install', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'dup', {
        id: 'dup',
        name: 'Dup',
        version: '1.0.0',
      });

      await installer.install(packDir);
      const result = await installer.install(packDir);
      expect(result.installed).toBe(false);
      expect(result.error).toContain('already installed');
    });

    it('should return error for invalid manifest', async () => {
      const dir = setupTestDir();
      const packDir = join(dir, 'bad');
      mkdirSync(packDir, { recursive: true });
      writeFileSync(join(packDir, 'soleri-pack.json'), '{ invalid }');

      const result = await installer.install(packDir);
      expect(result.installed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ─── UNINSTALL ────────────────────────────────────────────────────────

  describe('uninstall', () => {
    it('should uninstall a pack', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'removable', {
        id: 'removable',
        name: 'Removable',
        version: '1.0.0',
      });

      await installer.install(packDir);
      expect(installer.uninstall('removable')).toBe(true);
      expect(installer.get('removable')).toBeUndefined();
    });

    it('should return false for unknown pack', () => {
      expect(installer.uninstall('nonexistent')).toBe(false);
    });

    it('should deactivate facades on uninstall', async () => {
      const dir = setupTestDir();
      const packDir = createPackDir(dir, 'facade-remove', {
        id: 'facade-remove',
        name: 'Facade Remove',
        version: '1.0.0',
        facades: [
          {
            name: 'rm_facade',
            description: 'Remove',
            ops: [{ name: 'rm_op', auth: 'read' }],
          },
        ],
      });

      await installer.install(packDir);
      expect(registry.get('facade-remove')?.status).toBe('active');

      installer.uninstall('facade-remove');
      expect(registry.get('facade-remove')?.status).toBe('deactivated');
    });
  });

  // ─── LIST & GET ───────────────────────────────────────────────────────

  describe('list and get', () => {
    it('should list installed packs', async () => {
      const dir = setupTestDir();
      createPackDir(dir, 'a', { id: 'a', name: 'A', version: '1.0.0' });
      createPackDir(dir, 'b', { id: 'b', name: 'B', version: '1.0.0' });

      await installer.install(join(dir, 'a'));
      await installer.install(join(dir, 'b'));

      const list = installer.list();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.id).sort()).toEqual(['a', 'b']);
    });

    it('should get a specific pack', async () => {
      const dir = setupTestDir();
      createPackDir(dir, 'specific', { id: 'specific', name: 'Specific', version: '3.0.0' });

      await installer.install(join(dir, 'specific'));

      const pack = installer.get('specific');
      expect(pack).toBeDefined();
      expect(pack?.manifest.version).toBe('3.0.0');
      expect(pack?.status).toBe('ready');
    });
  });
});
