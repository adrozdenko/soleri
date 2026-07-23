/**
 * Flow loader — WS5 scoped-input schema + from_steps load-error tests.
 *
 * Contract:
 * - flowStepSchema accepts a declarative `inputs:` block (files/vault/from_steps)
 *   and a step-level `on-missing-input`; flowSchema accepts flow-level `enforcement`.
 * - validateFlowInputs() reports a LOAD error when a `from_steps` reference does
 *   not resolve to a key declared in an EARLIER step's output[].
 * - loadFlowById / loadAllFlows throw FlowLoadError on invalid from_steps,
 *   never silently swallowing the error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFlowById, loadAllFlows, validateFlowInputs, FlowLoadError } from './loader.js';
import { flowSchema, type Flow } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid Flow object with the given steps. */
function makeFlow(steps: Flow['steps'], extra?: Partial<Flow>): Flow {
  return {
    id: 'TEST-flow',
    triggers: { modes: ['TEST'] },
    steps,
    ...extra,
  } as Flow;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soleri-flow-loader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFlow(fileName: string, yamlBody: string): void {
  fs.writeFileSync(path.join(tmpDir, fileName), yamlBody);
}

// ---------------------------------------------------------------------------
// Schema — inputs block
// ---------------------------------------------------------------------------

describe('flowStepSchema — inputs block (WS5)', () => {
  it('parses files (layer 3|4), vault, and from_steps', () => {
    const parsed = flowSchema.safeParse({
      id: 'F',
      triggers: { modes: ['BUILD'] },
      enforcement: 'strict',
      steps: [
        { id: 'research', output: ['keyPoints'] },
        {
          id: 'script',
          inputs: {
            files: [
              { path: 'output/research.md', layer: 4 },
              { path: '_config/voice.md', layer: 3 },
            ],
            vault: [{ query: 'script structure', domain: 'content', limit: 3, mandatory: true }],
            from_steps: ['research.keyPoints'],
          },
          'on-missing-input': 'fail',
          output: ['scriptDraft'],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const step = parsed.data.steps[1];
    expect(step.inputs?.files).toHaveLength(2);
    expect(step.inputs?.files?.[0].layer).toBe(4);
    expect(step.inputs?.vault?.[0].mandatory).toBe(true);
    expect(step.inputs?.from_steps).toEqual(['research.keyPoints']);
    expect(step['on-missing-input']).toBe('fail');
    expect(parsed.data.enforcement).toBe('strict');
  });

  it('rejects an invalid file layer (not 3 or 4)', () => {
    const parsed = flowSchema.safeParse({
      id: 'F',
      triggers: { modes: ['BUILD'] },
      steps: [{ id: 's', inputs: { files: [{ path: 'x.md', layer: 5 }] } }],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown on-missing-input value', () => {
    const parsed = flowSchema.safeParse({
      id: 'F',
      triggers: { modes: ['BUILD'] },
      steps: [{ id: 's', 'on-missing-input': 'retry' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('treats a step with no inputs block as valid (backward compatible)', () => {
    const parsed = flowSchema.safeParse({
      id: 'F',
      triggers: { modes: ['BUILD'] },
      steps: [{ id: 's', chains: ['vault-search'], output: ['x'] }],
    });
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateFlowInputs — from_steps load errors
// ---------------------------------------------------------------------------

describe('validateFlowInputs (WS5)', () => {
  it('accepts from_steps referencing an earlier step output key', () => {
    const flow = makeFlow([
      { id: 'a', output: ['foo'] },
      { id: 'b', inputs: { from_steps: ['a.foo'] } },
    ]);
    expect(validateFlowInputs(flow)).toEqual([]);
  });

  it('flags from_steps referencing an undeclared output key', () => {
    const flow = makeFlow([
      { id: 'a', output: ['foo'] },
      { id: 'b', inputs: { from_steps: ['a.bar'] } },
    ]);
    const errors = validateFlowInputs(flow);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('a.bar');
    expect(errors[0]).toContain('not declared');
  });

  it('flags from_steps referencing a non-earlier step', () => {
    const flow = makeFlow([
      { id: 'a', inputs: { from_steps: ['b.foo'] } },
      { id: 'b', output: ['foo'] },
    ]);
    const errors = validateFlowInputs(flow);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not an earlier step');
  });

  it('flags a step referencing its own output (not earlier)', () => {
    const flow = makeFlow([{ id: 'a', output: ['foo'], inputs: { from_steps: ['a.foo'] } }]);
    const errors = validateFlowInputs(flow);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not an earlier step');
  });

  it('flags a malformed from_steps reference (no output key)', () => {
    const flow = makeFlow([
      { id: 'a', output: ['foo'] },
      { id: 'b', inputs: { from_steps: ['a'] } },
    ]);
    const errors = validateFlowInputs(flow);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('<stepId>.<outputKey>');
  });
});

// ---------------------------------------------------------------------------
// loadFlowById / loadAllFlows — surfacing the load error
// ---------------------------------------------------------------------------

describe('loadFlowById / loadAllFlows — from_steps load error (WS5)', () => {
  const validFlow = `
id: OK-flow
triggers:
  modes: [BUILD]
steps:
  - id: a
    output: [foo]
  - id: b
    inputs:
      from_steps: [a.foo]
`;

  const badFlow = `
id: BAD-flow
triggers:
  modes: [FIX]
steps:
  - id: a
    output: [foo]
  - id: b
    inputs:
      from_steps: [a.missing]
`;

  it('loadFlowById returns a flow with valid from_steps', () => {
    writeFlow('ok.flow.yaml', validFlow);
    const flow = loadFlowById('OK-flow', tmpDir);
    expect(flow?.id).toBe('OK-flow');
  });

  it('loadFlowById throws FlowLoadError for invalid from_steps', () => {
    writeFlow('bad.flow.yaml', badFlow);
    expect(() => loadFlowById('BAD-flow', tmpDir)).toThrow(FlowLoadError);
    try {
      loadFlowById('BAD-flow', tmpDir);
    } catch (err) {
      expect(err).toBeInstanceOf(FlowLoadError);
      expect((err as FlowLoadError).flowId).toBe('BAD-flow');
      expect((err as FlowLoadError).errors[0]).toContain('a.missing');
    }
  });

  it('loadAllFlows skips an invalid flow (loudly) but still loads the rest', () => {
    writeFlow('ok.flow.yaml', validFlow);
    writeFlow('bad.flow.yaml', badFlow);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const flows = loadAllFlows(tmpDir);

    // The valid flow still loads — one broken flow must not blast-radius the rest.
    expect(flows.map((f) => f.id)).toContain('OK-flow');
    expect(flows.map((f) => f.id)).not.toContain('BAD-flow');
    // ...but the skip is surfaced loudly, never silent.
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('BAD-flow'))).toBe(true);

    errSpy.mockRestore();
  });

  it('loadAllFlows loads all flows when from_steps are valid', () => {
    writeFlow('ok.flow.yaml', validFlow);
    const flows = loadAllFlows(tmpDir);
    expect(flows.map((f) => f.id)).toContain('OK-flow');
  });
});
