/**
 * Lockstep guard for the WS6 `engine.autoOps.editSourceLoop` flag.
 *
 * The forge Zod schema silently strips fields it does not declare, so a core
 * autoOps flag that is not mirrored here would never survive agent.yaml
 * parsing (see commit 37d0f98 / #796). These tests assert the flag both
 * defaults to false and round-trips when opted in.
 */

import { describe, it, expect } from 'vitest';
import { AgentYamlSchema } from '../agent-schema.js';

const BASE = {
  id: 'test-agent',
  name: 'Test Agent',
  role: 'tester',
  description: 'An agent used to verify schema round-tripping.',
};

describe('engine.autoOps.editSourceLoop (forge schema)', () => {
  it('defaults to false when engine is absent', () => {
    const parsed = AgentYamlSchema.parse({ ...BASE });
    expect(parsed.engine.autoOps.editSourceLoop).toBe(false);
  });

  it('defaults to false when engine.autoOps is absent', () => {
    const parsed = AgentYamlSchema.parse({ ...BASE, engine: { learning: true } });
    expect(parsed.engine.autoOps.editSourceLoop).toBe(false);
  });

  it('round-trips editSourceLoop: true (not stripped)', () => {
    const parsed = AgentYamlSchema.parse({
      ...BASE,
      engine: { autoOps: { editSourceLoop: true } },
    });
    expect(parsed.engine.autoOps.editSourceLoop).toBe(true);
  });

  it('keeps other autoOps flags independent of editSourceLoop', () => {
    const parsed = AgentYamlSchema.parse({
      ...BASE,
      engine: { autoOps: { editSourceLoop: true, dream: true } },
    });
    expect(parsed.engine.autoOps.editSourceLoop).toBe(true);
    expect(parsed.engine.autoOps.dream).toBe(true);
    expect(parsed.engine.autoOps.selfHeal).toBe(false);
  });
});
