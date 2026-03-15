import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectInstalledDomainPacks } from '../utils/detect-domain-packs.js';

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `soleri-forge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('detectInstalledDomainPacks', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('returns empty array when no node_modules exists', () => {
    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when @soleri scope exists but has no domain-* packages', () => {
    const scope = join(tempDir, 'node_modules', '@soleri', 'core');
    mkdirSync(scope, { recursive: true });
    writeFileSync(
      join(scope, 'package.json'),
      JSON.stringify({ name: '@soleri/core', version: '1.0.0' }),
    );

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([]);
  });

  it('detects a domain pack with soleri-domain-pack keyword', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-design');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({
        name: '@soleri/domain-design',
        version: '2.1.0',
        keywords: ['soleri-domain-pack'],
      }),
    );

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([
      { name: 'design', package: '@soleri/domain-design', version: '2.1.0' },
    ]);
  });

  it('detects a domain pack with a main entry point', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-security');
    const distDir = join(packDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({
        name: '@soleri/domain-security',
        version: '1.0.0',
        main: 'dist/index.js',
      }),
    );
    writeFileSync(join(distDir, 'index.js'), 'module.exports = {};');

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([
      { name: 'security', package: '@soleri/domain-security', version: '1.0.0' },
    ]);
  });

  it('detects multiple domain packs', () => {
    for (const [suffix, ver] of [
      ['design', '2.0.0'],
      ['security', '1.0.0'],
      ['analytics', '0.5.0'],
    ]) {
      const packDir = join(tempDir, 'node_modules', '@soleri', `domain-${suffix}`);
      mkdirSync(packDir, { recursive: true });
      writeFileSync(
        join(packDir, 'package.json'),
        JSON.stringify({
          name: `@soleri/domain-${suffix}`,
          version: ver,
          keywords: ['soleri-domain-pack'],
        }),
      );
    }

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.name).sort()).toEqual(['analytics', 'design', 'security']);
  });

  it('skips packages without valid package.json', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-broken');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'package.json'), '{ invalid json }');

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([]);
  });

  it('skips packages missing name or version', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-incomplete');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({ name: '@soleri/domain-incomplete' }), // no version
    );

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([]);
  });

  it('skips packages that have no entry point and no keyword', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-empty');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({ name: '@soleri/domain-empty', version: '1.0.0' }),
    );

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([]);
  });

  it('walks up to find node_modules in a parent directory', () => {
    // Create node_modules in tempDir but search from a subdirectory
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-design');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({
        name: '@soleri/domain-design',
        version: '1.0.0',
        keywords: ['soleri-domain-pack'],
      }),
    );

    const subDir = join(tempDir, 'projects', 'my-agent');
    mkdirSync(subDir, { recursive: true });

    const result = detectInstalledDomainPacks(subDir);
    expect(result).toEqual([
      { name: 'design', package: '@soleri/domain-design', version: '1.0.0' },
    ]);
  });

  it('detects domain pack with dist/index.js entry point (no main field)', () => {
    const packDir = join(tempDir, 'node_modules', '@soleri', 'domain-testing');
    mkdirSync(join(packDir, 'dist'), { recursive: true });
    writeFileSync(
      join(packDir, 'package.json'),
      JSON.stringify({ name: '@soleri/domain-testing', version: '1.0.0' }),
    );
    writeFileSync(join(packDir, 'dist', 'index.js'), 'export default {};');

    const result = detectInstalledDomainPacks(tempDir);
    expect(result).toEqual([
      { name: 'testing', package: '@soleri/domain-testing', version: '1.0.0' },
    ]);
  });
});
