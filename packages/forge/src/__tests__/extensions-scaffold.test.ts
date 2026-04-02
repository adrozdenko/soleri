import { describe, it, expect, afterEach } from 'vitest';
import { scaffold, previewScaffold } from '../scaffolder.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('scaffold extensions', () => {
  const outputDir = join(tmpdir(), 'soleri-ext-test-' + Date.now());
  const agentId = 'ext-test-agent';
  const agentDir = join(outputDir, agentId);

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('should create extensions directory with index and example op', { timeout: 30_000 }, () => {
    scaffold({
      id: agentId,
      name: 'Extension Test',
      role: 'Test agent',
      description: 'Agent for testing extensions scaffold',
      domains: ['testing'],
      principles: ['Test everything'],
      tone: 'pragmatic',
      outputDir,
    });

    // Extensions directory exists
    expect(existsSync(join(agentDir, 'src', 'extensions', 'index.ts'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'ops', 'example.ts'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'facades'))).toBe(true);
    expect(existsSync(join(agentDir, 'src', 'extensions', 'middleware'))).toBe(true);

    // Extensions index references the agent ID
    const indexContent = readFileSync(join(agentDir, 'src', 'extensions', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('ext-test-agent_core');
    expect(indexContent).toContain('loadExtensions');
    expect(indexContent).toContain('AgentExtensions');

    // Entry point imports extensions
    const entryPoint = readFileSync(join(agentDir, 'src', 'index.ts'), 'utf-8');
    expect(entryPoint).toContain('wrapWithMiddleware');
    expect(entryPoint).toContain('./extensions/index.js');
    expect(entryPoint).toContain('AgentExtensions');
  });

  it('should include extensions in preview', () => {
    const preview = previewScaffold({
      id: agentId,
      name: 'Extension Test',
      role: 'Test agent',
      description: 'Agent for testing extensions scaffold',
      domains: ['testing'],
      principles: ['Test everything'],
      tone: 'pragmatic',
      outputDir,
    });

    const extFile = preview.files.find((f) => f.path === 'src/extensions/');
    expect(extFile).toBeDefined();
    expect(extFile!.description).toContain('extension');
  });
});
