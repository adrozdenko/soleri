/**
 * E2E Test: Scaffold → Install → Build
 *
 * Verifies that a scaffolded agent can be installed and compiled.
 * This catches template generation bugs, missing imports, and
 * TypeScript errors in generated code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, symlinkSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { scaffold } from '@soleri/forge/lib';

describe('E2E: scaffold-and-build', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-build-${Date.now()}`);
  let agentDir: string;

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should scaffold a complete agent project', () => {
    const result = scaffold({
      id: 'e2e-test-agent',
      name: 'E2E Test Agent',
      role: 'Testing Advisor',
      description: 'An agent for end-to-end testing.',
      domains: ['testing', 'quality'],
      principles: ['Test everything', 'Fast feedback loops'],
      greeting: 'Ready for testing.',
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    agentDir = result.agentDir;
    expect(existsSync(agentDir)).toBe(true);
  });

  it('should have a valid package.json with @soleri/core dependency', () => {
    const pkg = JSON.parse(readFileSync(join(agentDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toContain('e2e-test-agent');
    expect(pkg.dependencies['@soleri/core']).toBeDefined();
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
  });

  it('should have an entry point with all required imports', () => {
    const entryPoint = readFileSync(join(agentDir, 'src/index.ts'), 'utf-8');
    expect(entryPoint).toContain('createAgentRuntime');
    expect(entryPoint).toContain('createSemanticFacades');
    expect(entryPoint).toContain('registerAllFacades');
    expect(entryPoint).toContain('StdioServerTransport');
  });

  it('should have generated facade test file', () => {
    const testFile = readFileSync(join(agentDir, 'src/__tests__/facades.test.ts'), 'utf-8');
    expect(testFile).toContain('createAgentRuntime');
    expect(testFile).toContain('e2e-test-agent');
  });

  it('should have domain intelligence data files', () => {
    expect(existsSync(join(agentDir, 'src/intelligence/data/testing.json'))).toBe(true);
    expect(existsSync(join(agentDir, 'src/intelligence/data/quality.json'))).toBe(true);
  });

  it('should have skills directory with built-in skills', () => {
    expect(existsSync(join(agentDir, 'skills'))).toBe(true);
    const skills = readdirSync(join(agentDir, 'skills'), { recursive: true, encoding: 'utf-8' });
    const skillFiles = skills.filter((f) => f.endsWith('SKILL.md'));
    expect(skillFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('should install dependencies and typecheck successfully', () => {
    // Point @soleri/core to the local workspace version
    const monorepoRoot = join(import.meta.dirname, '..');
    const corePkg = join(monorepoRoot, 'packages/core');

    const pkgPath = join(agentDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.dependencies['@soleri/core'] = `file:${corePkg}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    // Install dependencies (no scripts — faster, avoids build hooks)
    execFileSync('npm', ['install', '--ignore-scripts'], {
      cwd: agentDir,
      stdio: 'pipe',
      timeout: 60_000,
    });

    // file: link to @soleri/core brings the monorepo's @modelcontextprotocol/sdk.
    // The agent also installs its own copy, causing duplicate type declarations.
    // Replace the agent's copy with a symlink to the monorepo's single copy.
    const agentMcpSdk = join(agentDir, 'node_modules', '@modelcontextprotocol', 'sdk');
    const monorepoMcpSdk = join(monorepoRoot, 'node_modules', '@modelcontextprotocol', 'sdk');
    if (existsSync(agentMcpSdk) && existsSync(monorepoMcpSdk)) {
      rmSync(agentMcpSdk, { recursive: true, force: true });
      symlinkSync(monorepoMcpSdk, agentMcpSdk, 'junction');
    }

    // Typecheck — verifies generated code compiles
    execFileSync('npx', ['tsc', '--noEmit'], {
      cwd: agentDir,
      stdio: 'pipe',
      timeout: 30_000,
    });
  });
});
