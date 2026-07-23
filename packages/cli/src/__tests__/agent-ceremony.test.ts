/**
 * Tests for `soleri agent refresh` ceremony threading.
 *
 * The refresh command regenerates instructions/_engine.md via
 * getModularEngineRules(readEngineFeatures(path), readEngineCeremony(path)).
 * These tests exercise that data flow: the ceremony read from agent.yaml must
 * drive the gate rules in the regenerated engine content, so a scaffolded
 * `ceremony: light` agent keeps its light gate rules after a refresh.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getModularEngineRules } from '@soleri/forge/lib';
import { readEngineCeremony } from '../commands/agent.js';

describe('agent refresh — ceremony threading', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-ceremony-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeAgentYaml(engineBlock: string): void {
    writeFileSync(
      join(dir, 'agent.yaml'),
      `id: test-agent
name: Test Agent
role: Testing Advisor
description: A test agent for ceremony threading through refresh.
${engineBlock}`,
      'utf-8',
    );
  }

  it('reads an explicit engine.ceremony from agent.yaml', () => {
    writeAgentYaml('engine:\n  ceremony: light\n');
    expect(readEngineCeremony(dir)).toBe('light');
  });

  it('reads engine.ceremony: off', () => {
    writeAgentYaml('engine:\n  ceremony: off\n');
    expect(readEngineCeremony(dir)).toBe('off');
  });

  it('returns undefined when ceremony is absent (getModularEngineRules falls back to full)', () => {
    writeAgentYaml('engine:\n  learning: true\n');
    expect(readEngineCeremony(dir)).toBeUndefined();
  });

  it('returns undefined when agent.yaml does not exist', () => {
    expect(readEngineCeremony(dir)).toBeUndefined();
  });

  it('regenerated engine rules carry light gate rules for a light agent', () => {
    writeAgentYaml('engine:\n  ceremony: light\n');
    const rules = getModularEngineRules(undefined, readEngineCeremony(dir));
    expect(rules).toContain('Single-gate approval (`ceremony: light`)');
    expect(rules).not.toContain('Two-gate approval');
  });

  it('regenerated engine rules carry no-gate rules for an off agent', () => {
    writeAgentYaml('engine:\n  ceremony: off\n');
    const rules = getModularEngineRules(undefined, readEngineCeremony(dir));
    expect(rules).toContain('No approval gates (`ceremony: off`)');
    expect(rules).not.toContain('Two-gate approval');
  });

  it('regenerated engine rules fall back to two-gate (full) when ceremony is absent', () => {
    writeAgentYaml('engine:\n  learning: true\n');
    const rules = getModularEngineRules(undefined, readEngineCeremony(dir));
    expect(rules).toContain('Two-gate approval (`ceremony: full`)');
    expect(rules).not.toContain('Single-gate approval');
  });
});
