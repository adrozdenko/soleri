/**
 * Tests for generateAgentsMd ceremony threading.
 *
 * AGENTS.md (Codex/OpenCode's primary instruction file) embeds the engine rules
 * inline, so a light/off agent must NOT get contradictory two-gate rules there.
 */

import { describe, it, expect } from 'vitest';
import { generateAgentsMd } from '../templates/agents-md.js';
import type { AgentConfig } from '../types.js';

const CONFIG: AgentConfig = {
  id: 'test-agent',
  name: 'Test Agent',
  role: 'Testing Advisor',
  description: 'A test agent for AGENTS.md ceremony threading.',
  domains: ['testing'],
  principles: ['Test everything'],
} as unknown as AgentConfig;

describe('generateAgentsMd — ceremony threading', () => {
  it('defaults to two-gate (full) rules when no ceremony is passed', () => {
    const md = generateAgentsMd(CONFIG);
    expect(md).toContain('Two-gate approval (`ceremony: full`)');
    expect(md).not.toContain('Single-gate approval');
  });

  it('embeds single-gate rules for a light agent', () => {
    const md = generateAgentsMd(CONFIG, 'light');
    expect(md).toContain('Single-gate approval (`ceremony: light`)');
    expect(md).not.toContain('Two-gate approval');
  });

  it('embeds no-gate rules for an off agent', () => {
    const md = generateAgentsMd(CONFIG, 'off');
    expect(md).toContain('No approval gates (`ceremony: off`)');
    expect(md).not.toContain('Two-gate approval');
    expect(md).not.toContain('Single-gate approval');
  });

  it('never leaks the ceremony sentinel', () => {
    for (const ceremony of ['full', 'light', 'off'] as const) {
      expect(generateAgentsMd(CONFIG, ceremony)).not.toContain('<!-- soleri:ceremony-rules -->');
    }
  });
});
