/**
 * E2E Test: Scaffold Edge Cases
 *
 * Verifies scaffold behavior with edge-case configurations:
 * many domains, telegram flag, tone variants, skills filtering,
 * minimum config, duplicate scaffolds, single domain, and
 * package.json name format.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '@soleri/forge/lib';

const BASE_CONFIG = {
  name: 'Edge Case Agent',
  role: 'Testing edge cases in scaffold',
  description: 'An agent scaffolded to verify edge-case handling in the forge.',
  domains: ['testing'],
  principles: ['Correctness first'],
} as const;

describe('E2E: scaffold-edge-cases', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-edge-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should scaffold with many domains (10) and create all domain data files', () => {
    const domains = [
      'analytics',
      'billing',
      'compliance',
      'deployment',
      'encryption',
      'frontend',
      'governance',
      'hosting',
      'integration',
      'journaling',
    ];

    const result = scaffold({
      ...BASE_CONFIG,
      id: 'many-domains-agent',
      name: 'Many Domains Agent',
      domains,
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.domains).toEqual(domains);

    for (const domain of domains) {
      const dataFile = join(result.agentDir, `src/intelligence/data/${domain}.json`);
      expect(existsSync(dataFile), `Missing domain file: ${domain}.json`).toBe(true);
    }
  });

  it('should scaffold with telegram: true and create telegram-related files', () => {
    const result = scaffold({
      ...BASE_CONFIG,
      id: 'telegram-agent',
      name: 'Telegram Agent',
      telegram: true,
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);

    // Check for telegram-related content in the generated files
    const filesWithTelegram = result.filesCreated.filter((f) =>
      f.toLowerCase().includes('telegram'),
    );
    expect(filesWithTelegram.length).toBeGreaterThan(0);
  });

  it.each(['precise', 'mentor', 'pragmatic'] as const)(
    'should scaffold with tone "%s" and include it in entry point',
    (tone) => {
      const result = scaffold({
        ...BASE_CONFIG,
        id: `tone-${tone}-agent`,
        name: `Tone ${tone} Agent`,
        tone,
        outputDir: tempDir,
      });

      expect(result.success).toBe(true);

      const entryPoint = readFileSync(join(result.agentDir, 'src/index.ts'), 'utf-8');
      expect(entryPoint).toContain(tone);
    },
  );

  it('should scaffold with skills filter and include only selected skills', () => {
    const selectedSkills = ['vault-capture', 'commit'];

    const result = scaffold({
      ...BASE_CONFIG,
      id: 'skills-filter-agent',
      name: 'Skills Filter Agent',
      skills: selectedSkills,
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);

    // Check that skills directory exists and contains only selected skills
    const skillsDir = join(result.agentDir, 'skills');
    if (existsSync(skillsDir)) {
      const allSkillDirs = readdirSync(skillsDir, { encoding: 'utf-8' });
      for (const dir of allSkillDirs) {
        const matchesSelected = selectedSkills.some((s) => dir.includes(s));
        expect(matchesSelected, `Unexpected skill directory: ${dir}`).toBe(true);
      }
    }
  });

  it('should scaffold with minimum config (only required fields)', () => {
    const result = scaffold({
      id: 'minimal-agent',
      name: 'Minimal',
      role: 'Minimal role for testing',
      description: 'A minimal agent with only required configuration fields.',
      domains: ['general'],
      principles: ['Keep it simple'],
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(result.agentDir)).toBe(true);
    expect(result.filesCreated.length).toBeGreaterThan(0);

    // Should still have a valid entry point
    const entryPoint = join(result.agentDir, 'src/index.ts');
    expect(existsSync(entryPoint)).toBe(true);

    // Should still have package.json
    const pkgPath = join(result.agentDir, 'package.json');
    expect(existsSync(pkgPath)).toBe(true);
  });

  it('should handle scaffolding into the same directory twice gracefully', () => {
    const config = {
      ...BASE_CONFIG,
      id: 'duplicate-agent',
      name: 'Duplicate Agent',
      outputDir: tempDir,
    };

    const first = scaffold(config);
    expect(first.success).toBe(true);

    // Second scaffold to same location — should either succeed (overwrite) or fail gracefully
    let secondResult: typeof first | undefined;
    let threwError = false;

    try {
      secondResult = scaffold(config);
    } catch {
      threwError = true;
    }

    // All valid outcomes: threw an error, returned success: false, or overwrote successfully
    if (threwError) {
      // Throwing is acceptable
      expect(existsSync(first.agentDir)).toBe(true);
    } else {
      // Either success: false (rejected duplicate) or success: true (overwrote) is fine
      expect(typeof secondResult!.success).toBe('boolean');
    }
  });

  it('should scaffold with a single domain', () => {
    const result = scaffold({
      ...BASE_CONFIG,
      id: 'single-domain-agent',
      name: 'Single Domain Agent',
      domains: ['security'],
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    expect(result.domains).toEqual(['security']);

    const dataFile = join(result.agentDir, 'src/intelligence/data/security.json');
    expect(existsSync(dataFile)).toBe(true);
  });

  it('should generate package.json with correct name format', () => {
    const result = scaffold({
      ...BASE_CONFIG,
      id: 'pkg-name-agent',
      name: 'Package Name Agent',
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);

    const pkg = JSON.parse(readFileSync(join(result.agentDir, 'package.json'), 'utf-8'));

    // Name should contain the agent id
    expect(pkg.name).toContain('pkg-name-agent');

    // Name should be a valid npm package name (lowercase, no spaces)
    expect(pkg.name).toMatch(/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/);

    // Should have required dependencies
    expect(pkg.dependencies['@soleri/core']).toBeDefined();
  });
});
