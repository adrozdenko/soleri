/**
 * Failing tests for agent.yaml config loading.
 *
 * These tests reference `loadAgentConfig` from `./agent-config.js` which does
 * NOT exist yet — they are intentionally red (task 1 of 8 in plan-1775482177429-3rseb0).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAgentConfig } from './agent-config.js';
import type { AgentConfig } from './agent-config.js';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

import fs from 'node:fs';

describe('loadAgentConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns parsed AgentConfig when agent.yaml exists', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`
workflows:
  deliver: DELIVER
  feature-dev: BUILD
probes:
  - vault
  - brain
`);

    const config: AgentConfig = loadAgentConfig('/agent/dir');

    expect(config.workflows).toEqual({ deliver: 'DELIVER', 'feature-dev': 'BUILD' });
    expect(config.probes).toEqual(['vault', 'brain']);
  });

  it('returns defaults when agent.yaml is missing — does not throw', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    expect(() => loadAgentConfig('/agent/dir')).not.toThrow();

    const config: AgentConfig = loadAgentConfig('/agent/dir');
    expect(config.workflows).toEqual({});
    expect(config.probes).toEqual([]);
  });

  it('config.workflows maps workflow names to intent strings', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`
workflows:
  bug-fix: FIX
  code-review: REVIEW
`);

    const config: AgentConfig = loadAgentConfig('/agent/dir');

    expect(typeof config.workflows).toBe('object');
    expect(config.workflows['bug-fix']).toBe('FIX');
    expect(config.workflows['code-review']).toBe('REVIEW');
  });

  it('config.probes is an array of probe name strings', () => {
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(`
probes:
  - vault
  - brain
  - designSystem
`);

    const config: AgentConfig = loadAgentConfig('/agent/dir');

    expect(Array.isArray(config.probes)).toBe(true);
    expect(config.probes).toContain('vault');
    expect(config.probes).toContain('brain');
    expect(config.probes).toContain('designSystem');
  });
});
