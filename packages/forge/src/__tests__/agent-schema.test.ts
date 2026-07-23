/**
 * Tests for the agent.yaml Zod schema — focused on the engine.ceremony field.
 *
 * The Zod schema silently strips unknown keys, so a field must be declared to
 * survive a parse. These tests guard that `engine.ceremony` round-trips and
 * that an absent field stays `undefined` (distinguishable from an explicit
 * `full`, which the core `resolveCeremony` helper depends on).
 */

import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AgentYamlSchema } from '../agent-schema.js';

const BASE_YAML = `id: test-agent
name: Test Agent
role: Testing Advisor
description: A test agent for validating the agent.yaml schema.
`;

function parse(yaml: string) {
  const result = AgentYamlSchema.safeParse(parseYaml(yaml));
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

describe('AgentYamlSchema — engine.ceremony', () => {
  it('round-trips an explicit ceremony without stripping it', () => {
    for (const value of ['full', 'light', 'off'] as const) {
      const parsed = parse(`${BASE_YAML}engine:\n  ceremony: ${value}\n`);
      expect(parsed.engine.ceremony).toBe(value);
    }
  });

  it('leaves ceremony undefined when absent (no silent default at the schema layer)', () => {
    const parsed = parse(`${BASE_YAML}engine:\n  learning: true\n`);
    expect(parsed.engine.ceremony).toBeUndefined();
  });

  it('leaves ceremony undefined when the engine block itself is absent', () => {
    const parsed = parse(BASE_YAML);
    // engine gets its default object, but ceremony has no default → undefined.
    expect(parsed.engine.ceremony).toBeUndefined();
  });

  it('rejects an invalid ceremony value', () => {
    const result = AgentYamlSchema.safeParse(parseYaml(`${BASE_YAML}engine:\n  ceremony: lite\n`));
    expect(result.success).toBe(false);
  });

  it('preserves ceremony alongside sibling engine toggles', () => {
    const parsed = parse(
      `${BASE_YAML}engine:\n  learning: true\n  ceremony: off\n  autoOps:\n    dream: true\n`,
    );
    expect(parsed.engine.ceremony).toBe('off');
    expect(parsed.engine.learning).toBe(true);
    expect(parsed.engine.autoOps?.dream).toBe(true);
  });
});
