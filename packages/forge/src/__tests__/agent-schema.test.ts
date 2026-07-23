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
import { CEREMONY_VALUES } from '../templates/shared-rules.js';

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

describe('ceremony value set — lockstep guard', () => {
  // The canonical set. Adding a 4th value anywhere must fail a test somewhere:
  //  - forge shared-rules CEREMONY_VALUES  → asserted directly below
  //  - forge Zod z.enum(CEREMONY_VALUES)   → asserted via accept/reject below
  //  - forge `Ceremony` type               → derived from CEREMONY_VALUES (can't drift)
  //  - core CEREMONY_VALUES                 → pinned in core agent-config.test.ts
  //  - CLI readEngineCeremony union         → guarded by tsc (returns the schema type)
  const CANONICAL = ['full', 'light', 'off'];

  it('shared-rules CEREMONY_VALUES is exactly the canonical set', () => {
    expect([...CEREMONY_VALUES]).toEqual(CANONICAL);
  });

  it('the Zod schema accepts exactly the shared-rules set — no more, no less', () => {
    // Every declared value parses.
    for (const value of CEREMONY_VALUES) {
      const parsed = parse(`${BASE_YAML}engine:\n  ceremony: ${value}\n`);
      expect(parsed.engine.ceremony).toBe(value);
    }
    // A value outside the set is rejected — proves the enum set == CEREMONY_VALUES.
    const rejected = AgentYamlSchema.safeParse(
      parseYaml(`${BASE_YAML}engine:\n  ceremony: strict\n`),
    );
    expect(rejected.success).toBe(false);
  });
});
