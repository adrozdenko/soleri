import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkNodeVersion,
  checkNpm,
  checkAgentProject,
  checkAgentBuild,
  checkNodeModules,
  runAllChecks,
} from '../utils/checks.js';

describe('doctor command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-doctor-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('checkNodeVersion', () => {
    it('should pass for current Node version', () => {
      const result = checkNodeVersion();
      expect(result.status).toBe('pass');
      expect(result.detail).toContain(process.versions.node);
    });
  });

  describe('checkNpm', () => {
    it('should pass when npm is available', () => {
      const result = checkNpm();
      expect(result.status).toBe('pass');
    });
  });

  describe('checkAgentProject', () => {
    it('should warn for non-agent directory', () => {
      const result = checkAgentProject(tempDir);
      expect(result.status).toBe('warn');
    });

    it('should pass for agent directory', () => {
      const agentDir = join(tempDir, 'agent');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'agent-mcp' }));

      const result = checkAgentProject(agentDir);
      expect(result.status).toBe('pass');
      expect(result.detail).toContain('agent-mcp');
    });
  });

  describe('checkAgentBuild', () => {
    it('should warn if no agent detected', () => {
      const result = checkAgentBuild(tempDir);
      expect(result.status).toBe('warn');
    });

    it('should fail if dist is missing', () => {
      const agentDir = join(tempDir, 'agent');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'agent-mcp' }));

      const result = checkAgentBuild(agentDir);
      expect(result.status).toBe('fail');
    });

    it('should pass if dist/index.js exists', () => {
      const agentDir = join(tempDir, 'agent');
      mkdirSync(join(agentDir, 'dist'), { recursive: true });
      writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'agent-mcp' }));
      writeFileSync(join(agentDir, 'dist', 'index.js'), '');

      const result = checkAgentBuild(agentDir);
      expect(result.status).toBe('pass');
    });
  });

  describe('checkNodeModules', () => {
    it('should fail if node_modules is missing', () => {
      const agentDir = join(tempDir, 'agent');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'agent-mcp' }));

      const result = checkNodeModules(agentDir);
      expect(result.status).toBe('fail');
    });

    it('should pass if node_modules exists', () => {
      const agentDir = join(tempDir, 'agent');
      mkdirSync(join(agentDir, 'node_modules'), { recursive: true });
      writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'agent-mcp' }));

      const result = checkNodeModules(agentDir);
      expect(result.status).toBe('pass');
    });
  });

  describe('runAllChecks', () => {
    it('should return array of check results', () => {
      const results = runAllChecks(tempDir);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(['pass', 'fail', 'warn']).toContain(r.status);
        expect(r.label).toBeTruthy();
      }
    });

    it('should include Node and npm checks regardless of directory', () => {
      const results = runAllChecks(tempDir);
      const labels = results.map((r) => r.label);
      expect(labels).toContain('Node.js');
      expect(labels).toContain('npm');
    });
  });
});
