import { describe, it, expect } from 'vitest';
import {
  classifyDiff,
  buildProposedChange,
  proposalIdFor,
  computeConfidence,
  groupDiffs,
  crossesThreshold,
  buildProposal,
  sourceRefForEntry,
  isHumanEdit,
} from './edit-source-loop.js';
import type { DiffKind, EditDiffRow } from './types.js';

function diffRow(overrides: Partial<EditDiffRow>): EditDiffRow {
  return {
    id: overrides.id ?? 1,
    outputId: overrides.outputId ?? 'entry-1',
    sourceRef: overrides.sourceRef ?? 'vault:capture-contract/pattern',
    runId: overrides.runId ?? 'run-a',
    beforeText: overrides.beforeText ?? 'before',
    afterText: overrides.afterText ?? 'after',
    diffKind: overrides.diffKind ?? 'length_trim',
    createdAt: overrides.createdAt ?? 0,
  };
}

describe('classifyDiff', () => {
  it('classifies a shortened lead sentence with preserved body as tightened_opening', () => {
    const before =
      'This is a very long and rambling introductory opening sentence that goes on and on with lots of unnecessary preamble and context. The core body explains the caching strategy in detail with specifics.';
    const after =
      'Short opening. The core body explains the caching strategy in detail with specifics.';
    expect(classifyDiff(before, after)).toBe('tightened_opening');
  });

  it('classifies a large content reduction as length_trim', () => {
    const before =
      'The authentication module validates tokens and refreshes sessions and logs every attempt and handles concurrency and retries failures.';
    const after = 'The authentication module validates tokens.';
    expect(classifyDiff(before, after)).toBe('length_trim');
  });

  it('classifies an added rule/limit as constraint_added', () => {
    const before = 'Write a summary of the research findings for the reader.';
    const after =
      'Write a summary of the research findings for the reader. Keep it under three sentences and never exceed the limit.';
    expect(classifyDiff(before, after)).toBe('constraint_added');
  });

  it('classifies localized word swaps as terminology', () => {
    const before = 'The component uses the colour palette and behaviour tokens for theming.';
    const after = 'The component uses the color palette and behavior tokens for theming.';
    expect(classifyDiff(before, after)).toBe('terminology');
  });

  it('classifies a same-token reorder as structure_reorder', () => {
    const before = 'Validate the input, normalize the output, cache the results.';
    const after = 'Cache the results, normalize the output, validate the input.';
    expect(classifyDiff(before, after)).toBe('structure_reorder');
  });

  it('falls back to tone_shift for a register rewrite', () => {
    const before = 'yeah the login page looks pretty ugly and janky honestly.';
    const after = 'The login interface presents an unpolished and inconsistent appearance.';
    expect(classifyDiff(before, after)).toBe('tone_shift');
  });

  it('always returns one of the six canonical kinds', () => {
    const kinds: DiffKind[] = [
      'tightened_opening',
      'tone_shift',
      'length_trim',
      'terminology',
      'structure_reorder',
      'constraint_added',
    ];
    expect(kinds).toContain(
      classifyDiff('anything at all here', 'something else entirely different'),
    );
  });
});

describe('buildProposedChange', () => {
  it('maps every diff kind to one of the three named remedies', () => {
    const kinds: DiffKind[] = [
      'tightened_opening',
      'tone_shift',
      'length_trim',
      'terminology',
      'structure_reorder',
      'constraint_added',
    ];
    for (const k of kinds) {
      const change = buildProposedChange(k, 'vault:capture-contract/pattern');
      expect(['contract_amendment', 'reference_update', 'new_constraint']).toContain(change.type);
      expect(change.target).toBe('vault:capture-contract/pattern');
      expect(change.suggestion.length).toBeGreaterThan(0);
    }
  });
});

describe('proposalIdFor', () => {
  it('is deterministic for the same source_ref + diff_kind', () => {
    const a = proposalIdFor('vault:capture-contract/pattern', 'length_trim');
    const b = proposalIdFor('vault:capture-contract/pattern', 'length_trim');
    expect(a).toBe(b);
    expect(a).toMatch(/^esp-/);
  });

  it('differs when source_ref or diff_kind differs', () => {
    expect(proposalIdFor('a', 'length_trim')).not.toBe(proposalIdFor('b', 'length_trim'));
    expect(proposalIdFor('a', 'length_trim')).not.toBe(proposalIdFor('a', 'tone_shift'));
  });
});

describe('computeConfidence', () => {
  it('is advisory only — always within [0, 1]', () => {
    const c = computeConfidence(3, ['keep it short', 'keep it short', 'keep it short']);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('rises with more distinct runs', () => {
    const texts = ['keep it short', 'keep it short', 'keep it short'];
    expect(computeConfidence(5, texts)).toBeGreaterThanOrEqual(computeConfidence(3, texts));
  });
});

describe('crossesThreshold', () => {
  it('fires with 3 diffs across 3 distinct runs', () => {
    const [group] = groupDiffs([
      diffRow({ id: 1, runId: 'run-a' }),
      diffRow({ id: 2, runId: 'run-b' }),
      diffRow({ id: 3, runId: 'run-c' }),
    ]);
    expect(crossesThreshold(group)).toBe(true);
  });

  it('does NOT fire with 3 diffs in a single run', () => {
    const [group] = groupDiffs([
      diffRow({ id: 1, runId: 'run-x' }),
      diffRow({ id: 2, runId: 'run-x' }),
      diffRow({ id: 3, runId: 'run-x' }),
    ]);
    expect(crossesThreshold(group)).toBe(false);
  });

  it('does NOT fire with only 2 distinct runs', () => {
    const [group] = groupDiffs([
      diffRow({ id: 1, runId: 'run-a' }),
      diffRow({ id: 2, runId: 'run-a' }),
      diffRow({ id: 3, runId: 'run-b' }),
    ]);
    expect(crossesThreshold(group)).toBe(false);
  });

  it('groups by source_ref + diff_kind, not output_id', () => {
    const groups = groupDiffs([
      diffRow({ id: 1, outputId: 'e1', diffKind: 'length_trim' }),
      diffRow({ id: 2, outputId: 'e2', diffKind: 'length_trim' }),
      diffRow({ id: 3, outputId: 'e3', diffKind: 'tone_shift' }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('buildProposal', () => {
  it('emits the EditSourceProposal shape with pending status', () => {
    const [group] = groupDiffs([
      diffRow({ id: 10, runId: 'run-a', diffKind: 'tightened_opening', afterText: 'short' }),
      diffRow({ id: 11, runId: 'run-b', diffKind: 'tightened_opening', afterText: 'short' }),
      diffRow({ id: 12, runId: 'run-c', diffKind: 'tightened_opening', afterText: 'short' }),
    ]);
    const p = buildProposal(group);
    expect(p.id).toMatch(/^esp-/);
    expect(p.kind).toBe('edit_source');
    expect(p.diffKind).toBe('tightened_opening');
    expect(p.evidenceRuns.sort()).toEqual(['run-a', 'run-b', 'run-c']);
    expect(p.evidenceDiffIds).toEqual([10, 11, 12]);
    expect(p.proposedChange.type).toBe('contract_amendment');
    expect(p.status).toBe('pending');
  });
});

describe('feed helpers', () => {
  it('derives a capture-contract source_ref from entry type', () => {
    expect(sourceRefForEntry('pattern')).toBe('vault:capture-contract/pattern');
    expect(sourceRefForEntry('rule')).toBe('vault:capture-contract/rule');
  });

  it('treats non-engine authors as human edits', () => {
    expect(isHumanEdit('user')).toBe(true);
    expect(isHumanEdit('adrozdenko')).toBe(true);
    expect(isHumanEdit('system')).toBe(false);
    expect(isHumanEdit('agent')).toBe(false);
    expect(isHumanEdit('curator')).toBe(false);
    expect(isHumanEdit('')).toBe(false);
    expect(isHumanEdit(null)).toBe(false);
  });
});
