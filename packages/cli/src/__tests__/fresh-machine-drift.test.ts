import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for fresh-machine drift.
 * Plan: plan-1775741365371-wmc9u3
 *
 * These tests document broken behavior that must be fixed.
 * Each test describes what SHOULD happen — failures prove the drift exists.
 */

// ─── 1. Quick create missing persona ────────────────────────────────────────

describe('quick create persona consistency', () => {
  it('quick create (--yes) must include a default persona block in source', async () => {
    // Quick create must pass a persona field to AgentConfigSchema.parse().
    // The interactive wizard uses ITALIAN_CRAFTSPERSON — quick create must too.

    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const createSrc = readFileSync(
      join(dirname(__filename), '..', 'commands', 'create.ts'),
      'utf-8',
    );

    // The quick create block (name && opts?.yes && !opts?.config) must:
    // 1. Import ITALIAN_CRAFTSPERSON
    expect(createSrc).toMatch(/ITALIAN_CRAFTSPERSON/);
    // 2. Include persona in the AgentConfigSchema.parse() call
    // Find the quick-create block and verify it has persona
    const quickCreateBlock = createSrc.match(
      /if \(name && opts\?\.yes && !opts\?\.config\) \{[\s\S]*?AgentConfigSchema\.parse\(\{([\s\S]*?)\}\)/,
    );
    expect(quickCreateBlock).not.toBeNull();
    expect(quickCreateBlock![1]).toContain('persona');
  });
});

// ─── 2. Update installs wrong package ───────────────────────────────────────

describe('update command installs canonical package', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('update must install @soleri/cli, not the soleri wrapper', async () => {
    // Currently: update.ts line 28 runs `npm install -g soleri@latest`
    // Should:    run `npm install -g @soleri/cli@latest`
    //
    // The `soleri` package is a thin wrapper. Installing it may pull a
    // stale @soleri/cli if the wrapper's dependency range is loose.

    // Read the actual source to verify
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const updateSrc = readFileSync(
      join(dirname(__filename), '..', 'commands', 'update.ts'),
      'utf-8',
    );

    // The install command must target @soleri/cli, not the wrapper
    expect(updateSrc).toContain('@soleri/cli@latest');
    expect(updateSrc).not.toMatch(/npm install -g soleri@latest/);
  });

  it('update and upgrade must install the same package', async () => {
    // Currently: update installs `soleri@latest`, upgrade installs `@soleri/cli@latest`
    // They should be aliases for the exact same operation.

    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const base = join(dirname(__filename), '..', 'commands');

    const updateSrc = readFileSync(join(base, 'update.ts'), 'utf-8');
    const upgradeSrc = readFileSync(join(base, 'upgrade.ts'), 'utf-8');

    // Extract the npm install target from each file
    const updateInstall = updateSrc.match(/npm install -g ([^\s'"]+)/)?.[1];
    const upgradeInstall = upgradeSrc.match(/npm install -g ([^\s'"]+)/)?.[1];

    expect(updateInstall).toBeDefined();
    expect(upgradeInstall).toBeDefined();
    expect(updateInstall).toBe(upgradeInstall);
  });
});

// ─── 3. Engine resolution consistency ───────────────────────────────────────

describe('engine resolution consistency', () => {
  it('dev command must use resolveEngineBin from install.ts, not its own logic', async () => {
    // Currently: dev.ts has its own hard-coded engine resolution (lines 41-56)
    // that errors without npx fallback. It should use the shared resolveEngineBin().

    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const devSrc = readFileSync(join(dirname(__filename), '..', 'commands', 'dev.ts'), 'utf-8');

    // dev.ts should import and use resolveEngineBin, not roll its own
    expect(devSrc).toMatch(/resolveEngineBin/);
    // Should NOT have a hard-coded path construction for the engine binary
    expect(devSrc).not.toMatch(/join\(.*node_modules.*@soleri.*core.*engine.*bin.*soleri-engine/);
  });
});

// ─── 4. Release workflow publishes all packages ─────────────────────────────

describe('release workflow completeness', () => {
  it('release.yml must publish all 6 publishable packages', async () => {
    // Currently: release.yml only publishes 4 packages (core, forge, cli, create-soleri)
    // Missing: @soleri/engine and soleri (wrapper)

    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const releaseYml = readFileSync(
      join(dirname(__filename), '..', '..', '..', '..', '.github', 'workflows', 'release.yml'),
      'utf-8',
    );

    const requiredPackages = [
      '@soleri/core',
      '@soleri/forge',
      '@soleri/cli',
      'create-soleri',
      '@soleri/engine',
      'soleri',
    ];

    for (const pkg of requiredPackages) {
      // Each package must have a publish step
      expect(releaseYml).toContain(`Publish ${pkg}`);
    }
  });

  it('release.yml must build @soleri/engine before publish', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const __filename = fileURLToPath(import.meta.url);
    const releaseYml = readFileSync(
      join(dirname(__filename), '..', '..', '..', '..', '.github', 'workflows', 'release.yml'),
      'utf-8',
    );

    expect(releaseYml).toContain('build --workspace=@soleri/engine');
  });
});
