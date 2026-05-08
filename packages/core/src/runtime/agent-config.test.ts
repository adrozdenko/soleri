/**
 * Colocated unit tests for agent-config.ts — YAML loading and defaults.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadAgentConfig, DEFAULT_AGENT_CONFIG, resolveAutoOpsConfig } from './agent-config.js';

describe('loadAgentConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-agent-config-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty object when agent.yaml does not exist', () => {
    const result = loadAgentConfig(tempDir);
    expect(result).toEqual({});
  });

  it('parses a valid agent.yaml and returns typed config', () => {
    writeFileSync(
      join(tempDir, 'agent.yaml'),
      `id: ernesto
capabilities:
  - vault.search
  - brain.recommend
probes:
  - vault
  - brain
workflows:
  feature-dev: BUILD
  bug-fix: FIX
`,
    );
    const result = loadAgentConfig(tempDir);
    expect(result.id).toBe('ernesto');
    expect(result.capabilities).toEqual(['vault.search', 'brain.recommend']);
    expect(result.probes).toEqual(['vault', 'brain']);
    expect(result.workflows).toEqual({ 'feature-dev': 'BUILD', 'bug-fix': 'FIX' });
  });

  it('parses engine.autoOps flags', () => {
    writeFileSync(
      join(tempDir, 'agent.yaml'),
      `id: ernesto
engine:
  autoOps:
    dream: true
    staleClose: true
`,
    );
    const result = loadAgentConfig(tempDir);
    expect(result.engine?.autoOps?.dream).toBe(true);
    expect(result.engine?.autoOps?.staleClose).toBe(true);
  });

  it('returns empty object for an empty agent.yaml', () => {
    writeFileSync(join(tempDir, 'agent.yaml'), '');
    const result = loadAgentConfig(tempDir);
    expect(result).toEqual({});
  });

  it('returns empty object for a non-object YAML value', () => {
    writeFileSync(join(tempDir, 'agent.yaml'), 'just a string');
    const result = loadAgentConfig(tempDir);
    expect(result).toEqual({});
  });

  it('returns partial config when only some fields are present', () => {
    writeFileSync(join(tempDir, 'agent.yaml'), 'id: minimal\n');
    const result = loadAgentConfig(tempDir);
    expect(result.id).toBe('minimal');
    expect(result.capabilities).toBeUndefined();
    expect(result.probes).toBeUndefined();
    expect(result.workflows).toBeUndefined();
  });
});

describe('resolveAutoOpsConfig', () => {
  it('defaults all auto-ops to false', () => {
    expect(resolveAutoOpsConfig({})).toEqual({
      dream: false,
      selfHeal: false,
      orphanReaper: false,
      staleClose: false,
      captureSessions: false,
    });
  });

  it('preserves explicit opt-ins', () => {
    expect(resolveAutoOpsConfig({ engine: { autoOps: { selfHeal: true } } })).toEqual({
      dream: false,
      selfHeal: true,
      orphanReaper: false,
      staleClose: false,
      captureSessions: false,
    });
  });

  it('honors captureSessions opt-in', () => {
    expect(resolveAutoOpsConfig({ engine: { autoOps: { captureSessions: true } } })).toEqual({
      dream: false,
      selfHeal: false,
      orphanReaper: false,
      staleClose: false,
      captureSessions: true,
    });
  });
});

describe('DEFAULT_AGENT_CONFIG', () => {
  it('includes standard probes', () => {
    expect(DEFAULT_AGENT_CONFIG.probes).toContain('vault');
    expect(DEFAULT_AGENT_CONFIG.probes).toContain('brain');
    expect(DEFAULT_AGENT_CONFIG.probes).toContain('sessionStore');
  });

  it('includes standard workflow → intent mappings', () => {
    expect(DEFAULT_AGENT_CONFIG.workflows?.['feature-dev']).toBe('BUILD');
    expect(DEFAULT_AGENT_CONFIG.workflows?.['bug-fix']).toBe('FIX');
    expect(DEFAULT_AGENT_CONFIG.workflows?.['deliver']).toBe('DELIVER');
    expect(DEFAULT_AGENT_CONFIG.workflows?.['plan']).toBe('PLAN');
  });
});
