import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectAgent } from '../utils/agent-context.js';

describe('dev command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cli-dev-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect agent in directory', () => {
    const agentDir = join(tempDir, 'my-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'my-agent-mcp' }));

    const ctx = detectAgent(agentDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.agentId).toBe('my-agent');
  });

  it('should return null for non-agent directory', () => {
    const dir = join(tempDir, 'not-agent');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'some-lib' }));

    const ctx = detectAgent(dir);
    expect(ctx).toBeNull();
  });

  it('should return null for directory without package.json', () => {
    const ctx = detectAgent(tempDir);
    expect(ctx).toBeNull();
  });

  it('should detect brain presence', () => {
    const agentDir = join(tempDir, 'brain-agent');
    mkdirSync(join(agentDir, 'src', 'brain'), { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'brain-agent-mcp' }));

    const ctx = detectAgent(agentDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.hasBrain).toBe(true);
  });

  it('should report no brain when absent', () => {
    const agentDir = join(tempDir, 'no-brain');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'package.json'), JSON.stringify({ name: 'no-brain-mcp' }));

    const ctx = detectAgent(agentDir);
    expect(ctx).not.toBeNull();
    expect(ctx!.hasBrain).toBe(false);
  });
});
