import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listAgents } from '@soleri/forge/lib';

describe('list command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-list-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return empty array for directory with no agents', () => {
    const agents = listAgents(tempDir);
    expect(agents).toEqual([]);
  });

  it('should return empty array for non-existent directory', () => {
    const agents = listAgents(join(tempDir, 'nonexistent'));
    expect(agents).toEqual([]);
  });

  it('should detect agent directories', () => {
    // Create a minimal agent directory
    const agentDir = join(tempDir, 'test-agent');
    mkdirSync(join(agentDir, 'src', 'intelligence', 'data'), { recursive: true });
    writeFileSync(
      join(agentDir, 'package.json'),
      JSON.stringify({ name: 'test-agent-mcp', description: 'A test agent' }),
    );
    writeFileSync(
      join(agentDir, 'src', 'intelligence', 'data', 'testing.json'),
      JSON.stringify({ domain: 'testing', version: '1.0.0', entries: [] }),
    );

    const agents = listAgents(tempDir);
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('test-agent');
    expect(agents[0].domains).toContain('testing');
  });

  it('should skip directories without -mcp package name', () => {
    const dir = join(tempDir, 'not-agent');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'some-lib' }));

    const agents = listAgents(tempDir);
    expect(agents).toHaveLength(0);
  });

  it('should detect multiple agents', () => {
    for (const id of ['alpha', 'beta']) {
      const dir = join(tempDir, id);
      mkdirSync(join(dir, 'src', 'intelligence', 'data'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `${id}-mcp` }));
    }

    const agents = listAgents(tempDir);
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.id).sort()).toEqual(['alpha', 'beta']);
  });

  it('should report build and deps status', () => {
    const agentDir = join(tempDir, 'built-agent');
    mkdirSync(join(agentDir, 'src', 'intelligence', 'data'), { recursive: true });
    mkdirSync(join(agentDir, 'dist'), { recursive: true });
    mkdirSync(join(agentDir, 'node_modules'), { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'built-agent-mcp' }));

    const agents = listAgents(tempDir);
    expect(agents[0].hasDistDir).toBe(true);
    expect(agents[0].hasNodeModules).toBe(true);
  });
});
