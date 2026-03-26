import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock getPack before importing graduation
const mockGetPack = vi.fn();
vi.mock('../hook-packs/registry.js', () => ({
  getPack: (...args: unknown[]) => mockGetPack(...args),
}));

import { promotePack, demotePack } from '../hook-packs/graduation.js';

describe('graduation — promote/demote action levels', () => {
  let tempDir: string;

  function createPackDir(actionLevel?: string): string {
    const packDir = join(tempDir, 'test-pack');
    mkdirSync(packDir, { recursive: true });
    const manifest: Record<string, unknown> = {
      name: 'test-pack',
      description: 'A test hook pack',
      hooks: ['PreToolUse'],
      version: '1.0.0',
    };
    if (actionLevel !== undefined) {
      manifest.actionLevel = actionLevel;
    }
    writeFileSync(join(packDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return packDir;
  }

  function readManifest(packDir: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8'));
  }

  beforeEach(() => {
    tempDir = join(tmpdir(), `graduation-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    mockGetPack.mockReset();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('promotePack', () => {
    it('should promote remind → warn', () => {
      const packDir = createPackDir('remind');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = promotePack('test-pack');

      expect(result.previousLevel).toBe('remind');
      expect(result.newLevel).toBe('warn');
      expect(readManifest(packDir).actionLevel).toBe('warn');
    });

    it('should promote warn → block', () => {
      const packDir = createPackDir('warn');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = promotePack('test-pack');

      expect(result.previousLevel).toBe('warn');
      expect(result.newLevel).toBe('block');
      expect(readManifest(packDir).actionLevel).toBe('block');
    });

    it('should throw at maximum level (block)', () => {
      const packDir = createPackDir('block');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      expect(() => promotePack('test-pack')).toThrow('already at maximum level: block');
    });

    it('should default to remind when actionLevel is missing', () => {
      const packDir = createPackDir();
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = promotePack('test-pack');

      expect(result.previousLevel).toBe('remind');
      expect(result.newLevel).toBe('warn');
    });

    it('should throw for unknown pack', () => {
      mockGetPack.mockReturnValue(null);

      expect(() => promotePack('nonexistent')).toThrow('Unknown hook pack: "nonexistent"');
    });
  });

  describe('demotePack', () => {
    it('should demote block → warn', () => {
      const packDir = createPackDir('block');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = demotePack('test-pack');

      expect(result.previousLevel).toBe('block');
      expect(result.newLevel).toBe('warn');
      expect(readManifest(packDir).actionLevel).toBe('warn');
    });

    it('should demote warn → remind', () => {
      const packDir = createPackDir('warn');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = demotePack('test-pack');

      expect(result.previousLevel).toBe('warn');
      expect(result.newLevel).toBe('remind');
      expect(readManifest(packDir).actionLevel).toBe('remind');
    });

    it('should throw at minimum level (remind)', () => {
      const packDir = createPackDir('remind');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      expect(() => demotePack('test-pack')).toThrow('already at minimum level: remind');
    });

    it('should throw for unknown pack', () => {
      mockGetPack.mockReturnValue(null);

      expect(() => demotePack('nonexistent')).toThrow('Unknown hook pack: "nonexistent"');
    });
  });

  describe('manifest persistence', () => {
    it('should write updated manifest to disk', () => {
      const packDir = createPackDir('remind');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      promotePack('test-pack');

      const manifest = readManifest(packDir);
      expect(manifest.actionLevel).toBe('warn');
      expect(manifest.name).toBe('test-pack');
      expect(manifest.description).toBe('A test hook pack');
      expect(manifest.version).toBe('1.0.0');
    });

    it('should preserve all manifest fields after promotion', () => {
      const packDir = createPackDir('remind');
      const originalManifest = readManifest(packDir);
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      promotePack('test-pack');

      const updatedManifest = readManifest(packDir);
      expect(updatedManifest.name).toBe(originalManifest.name);
      expect(updatedManifest.description).toBe(originalManifest.description);
      expect(updatedManifest.hooks).toEqual(originalManifest.hooks);
      expect(updatedManifest.version).toBe(originalManifest.version);
      expect(updatedManifest.actionLevel).toBe('warn');
    });

    it('should return the manifest path in the result', () => {
      const packDir = createPackDir('remind');
      mockGetPack.mockReturnValue({
        manifest: JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf-8')),
        dir: packDir,
      });

      const result = promotePack('test-pack');

      expect(result.manifestPath).toBe(join(packDir, 'manifest.json'));
    });
  });
});
