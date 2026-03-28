import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempHome = join(tmpdir(), `cli-hookpacks-test-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => tempHome };
});

import { listPacks, getPack, getInstalledPacks } from '../hook-packs/registry.js';
import { installPack, removePack, isPackInstalled } from '../hook-packs/installer.js';

describe('hook-packs', () => {
  beforeEach(() => {
    mkdirSync(join(tempHome, '.claude'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  describe('registry', () => {
    it('should list all 9 built-in packs', () => {
      const packs = listPacks();
      expect(packs.length).toBe(9);
      const names = packs.map((p) => p.name).sort();
      expect(names).toEqual([
        'a11y',
        'clean-commits',
        'css-discipline',
        'flock-guard',
        'full',
        'marketing-research',
        'safety',
        'typescript-safety',
        'yolo-safety',
      ]);
    });

    it('should get a specific pack by name', () => {
      const pack = getPack('typescript-safety');
      expect(pack).not.toBeNull();
      expect(pack!.manifest.name).toBe('typescript-safety');
      expect(pack!.manifest.hooks).toEqual(['no-any-types', 'no-console-log']);
      expect(pack!.manifest.description).toBe('Block unsafe TypeScript patterns');
    });

    it('should return null for unknown pack', () => {
      expect(getPack('nonexistent')).toBeNull();
    });

    it('should return full pack with composedFrom including safety and yolo-safety', () => {
      const pack = getPack('full');
      expect(pack).not.toBeNull();
      expect(pack!.manifest.composedFrom).toEqual([
        'typescript-safety',
        'a11y',
        'css-discipline',
        'clean-commits',
        'safety',
        'yolo-safety',
      ]);
      expect(pack!.manifest.hooks).toHaveLength(8);
    });

    it('should return empty installed packs when none installed', () => {
      const installed = getInstalledPacks();
      expect(installed.filter((p) => p !== 'yolo-safety' && p !== 'safety')).toEqual([]);
    });

    it('should get safety pack with scripts and lifecycleHooks', () => {
      const pack = getPack('safety');
      expect(pack).not.toBeNull();
      expect(pack!.manifest.name).toBe('safety');
      expect(pack!.manifest.hooks).toEqual([]);
      expect(pack!.manifest.scripts).toHaveLength(1);
      expect(pack!.manifest.scripts![0].name).toBe('anti-deletion');
      expect(pack!.manifest.lifecycleHooks).toHaveLength(1);
      expect(pack!.manifest.lifecycleHooks![0].event).toBe('PreToolUse');
    });

    it('should get yolo-safety pack as composed from safety', () => {
      const pack = getPack('yolo-safety');
      expect(pack).not.toBeNull();
      expect(pack!.manifest.name).toBe('yolo-safety');
      expect(pack!.manifest.hooks).toEqual([]);
      expect(pack!.manifest.composedFrom).toEqual(['safety']);
      expect(pack!.manifest.scripts).toBeUndefined();
      expect(pack!.manifest.lifecycleHooks).toBeUndefined();
    });
  });

  describe('installer', () => {
    it('should install a simple pack', () => {
      const result = installPack('typescript-safety');
      expect(result.installed).toEqual(['no-any-types', 'no-console-log']);
      expect(result.skipped).toEqual([]);
      const claudeDir = join(tempHome, '.claude');
      expect(existsSync(join(claudeDir, 'hookify.no-any-types.local.md'))).toBe(true);
      expect(existsSync(join(claudeDir, 'hookify.no-console-log.local.md'))).toBe(true);
      const content = readFileSync(join(claudeDir, 'hookify.no-any-types.local.md'), 'utf-8');
      expect(content).toContain('name: no-any-types');
      expect(content).toContain('Soleri Hook Pack: typescript-safety');
    });

    it('should be idempotent — skip existing files', () => {
      installPack('typescript-safety');
      const result = installPack('typescript-safety');
      expect(result.installed).toEqual([]);
      expect(result.skipped).toEqual(['no-any-types', 'no-console-log']);
    });

    it('should install composed pack (full)', () => {
      const result = installPack('full');
      expect(result.installed).toHaveLength(8);
      expect(result.skipped).toEqual([]);
      const claudeDir = join(tempHome, '.claude');
      for (const hook of [
        'no-any-types',
        'no-console-log',
        'no-important',
        'no-inline-styles',
        'semantic-html',
        'focus-ring-required',
        'ux-touch-targets',
        'no-ai-attribution',
      ]) {
        expect(existsSync(join(claudeDir, `hookify.${hook}.local.md`))).toBe(true);
      }
      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toBe('hooks/anti-deletion.sh');
      expect(existsSync(join(claudeDir, 'hooks', 'anti-deletion.sh'))).toBe(true);
    });

    it('should skip already-installed hooks when installing full after partial', () => {
      installPack('typescript-safety');
      const result = installPack('full');
      expect(result.skipped).toContain('no-any-types');
      expect(result.skipped).toContain('no-console-log');
      expect(result.installed).toHaveLength(6);
    });

    it('should throw for unknown pack', () => {
      expect(() => installPack('nonexistent')).toThrow('Unknown hook pack: "nonexistent"');
    });

    it('should remove a pack', () => {
      installPack('a11y');
      const result = removePack('a11y');
      expect(result.removed).toEqual(['semantic-html', 'focus-ring-required', 'ux-touch-targets']);
      const claudeDir = join(tempHome, '.claude');
      expect(existsSync(join(claudeDir, 'hookify.semantic-html.local.md'))).toBe(false);
    });

    it('should return empty removed list when pack not installed', () => {
      const result = removePack('a11y');
      expect(result.removed).toEqual([]);
    });

    it('should throw for unknown pack on remove', () => {
      expect(() => removePack('nonexistent')).toThrow('Unknown hook pack: "nonexistent"');
    });

    it('should install safety pack with scripts and lifecycle hooks', () => {
      const result = installPack('safety');
      expect(result.installed).toEqual([]);
      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toBe('hooks/anti-deletion.sh');
      expect(result.lifecycleHooks).toHaveLength(1);
      expect(result.lifecycleHooks[0]).toBe('PreToolUse:Bash');
      const claudeDir = join(tempHome, '.claude');
      expect(existsSync(join(claudeDir, 'hooks', 'anti-deletion.sh'))).toBe(true);
      const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash');
      expect(settings.hooks.PreToolUse[0].hooks).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe(
        'sh ~/.claude/hooks/anti-deletion.sh',
      );
      expect(settings.hooks.PreToolUse[0]._soleriPack).toBe('safety');
    });

    it('should remove safety pack including scripts and lifecycle hooks', () => {
      installPack('safety');
      const result = removePack('safety');
      expect(result.scripts).toHaveLength(1);
      expect(result.lifecycleHooks).toHaveLength(1);
      const claudeDir = join(tempHome, '.claude');
      expect(existsSync(join(claudeDir, 'hooks', 'anti-deletion.sh'))).toBe(false);
      const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
      expect(settings.hooks.PreToolUse).toBeUndefined();
    });

    it('should be idempotent for safety lifecycle hooks', () => {
      installPack('safety');
      const result2 = installPack('safety');
      expect(result2.lifecycleHooks).toEqual([]);
      const claudeDir = join(tempHome, '.claude');
      const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
      expect(settings.hooks.PreToolUse).toHaveLength(1);
    });

    it('should install yolo-safety via composition from safety', () => {
      const result = installPack('yolo-safety');
      // yolo-safety composes from safety — script and lifecycle come from safety
      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toBe('hooks/anti-deletion.sh');
      expect(result.lifecycleHooks).toHaveLength(1);
      const claudeDir = join(tempHome, '.claude');
      expect(existsSync(join(claudeDir, 'hooks', 'anti-deletion.sh'))).toBe(true);
    });
  });

  describe('isPackInstalled', () => {
    it('should return false when nothing installed', () => {
      expect(isPackInstalled('typescript-safety')).toBe(false);
    });

    it('should return true when fully installed', () => {
      installPack('typescript-safety');
      expect(isPackInstalled('typescript-safety')).toBe(true);
    });

    it('should return partial when some hooks present', () => {
      const claudeDir = join(tempHome, '.claude');
      writeFileSync(join(claudeDir, 'hookify.no-any-types.local.md'), 'test');
      expect(isPackInstalled('typescript-safety')).toBe('partial');
    });

    it('should return false for unknown pack', () => {
      expect(isPackInstalled('nonexistent')).toBe(false);
    });

    it('should detect safety as installed when script is present', () => {
      installPack('safety');
      expect(isPackInstalled('safety')).toBe(true);
    });
  });

  describe('getInstalledPacks', () => {
    it('should list installed packs', () => {
      installPack('typescript-safety');
      installPack('a11y');
      const installed = getInstalledPacks();
      expect(installed).toContain('typescript-safety');
      expect(installed).toContain('a11y');
      expect(installed).not.toContain('css-discipline');
    });

    it('should include full when all hooks and scripts are present', () => {
      installPack('full');
      const installed = getInstalledPacks();
      expect(installed).toContain('full');
      expect(installed).toContain('typescript-safety');
      expect(installed).toContain('a11y');
      expect(installed).toContain('css-discipline');
      expect(installed).toContain('clean-commits');
      expect(installed).toContain('safety');
      expect(installed).toContain('yolo-safety');
    });
  });
});
