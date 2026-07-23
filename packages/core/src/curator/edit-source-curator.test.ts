import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Curator } from './curator.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { DiffKind } from './types.js';

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern for testing.',
    tags: overrides.tags ?? ['testing'],
  };
}

const CONTRACT = 'vault:capture-contract/pattern';

/** Seed 3 diffs sharing source_ref + diff_kind across 3 distinct runs. */
function seedRecurring(curator: Curator, sourceRef: string, kind: DiffKind, runs: string[]): void {
  runs.forEach((run, i) => {
    curator.recordEditDiff({
      outputId: `entry-${run}`,
      sourceRef,
      runId: run,
      beforeText: `A long agent-written body number ${i} that keeps going with detail and more detail.`,
      afterText: `Short body ${i}.`,
      diffKind: kind,
    });
  });
}

describe('Curator — Edit-Source Learning Loop (WS6)', () => {
  let vault: Vault;
  let curator: Curator;

  beforeEach(() => {
    vault = new Vault(':memory:');
    curator = new Curator(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── Schema ───────────────────────────────────────────────────

  it('creates edit_diffs + edit_proposals tables', () => {
    const status = curator.getStatus();
    expect(status.tables).toHaveProperty('edit_diffs');
    expect(status.tables).toHaveProperty('edit_proposals');
    expect(status.tables.edit_diffs).toBe(0);
    expect(status.tables.edit_proposals).toBe(0);
  });

  // ─── recordEditDiff ───────────────────────────────────────────

  it('records a human edit and auto-classifies the diff kind', () => {
    const res = curator.recordEditDiff({
      outputId: 'e1',
      sourceRef: CONTRACT,
      runId: 'run-1',
      beforeText:
        'The authentication module validates tokens and refreshes sessions and logs every attempt and retries failures.',
      afterText: 'The authentication module validates tokens.',
    });
    expect(res.recorded).toBe(true);
    expect(res.diffKind).toBe('length_trim');
    expect(curator.getStatus().tables.edit_diffs).toBe(1);
  });

  it('does not record a no-op edit', () => {
    const res = curator.recordEditDiff({
      outputId: 'e1',
      sourceRef: CONTRACT,
      runId: 'run-1',
      beforeText: 'same text',
      afterText: 'same text',
    });
    expect(res.recorded).toBe(false);
    expect(curator.getStatus().tables.edit_diffs).toBe(0);
  });

  it('dedups an identical diff within the same run', () => {
    const input = {
      outputId: 'e1',
      sourceRef: CONTRACT,
      runId: 'run-1',
      beforeText: 'a long original text here',
      afterText: 'short',
      diffKind: 'length_trim' as DiffKind,
    };
    curator.recordEditDiff(input);
    const second = curator.recordEditDiff(input);
    expect(second.recorded).toBe(false);
    expect(curator.getStatus().tables.edit_diffs).toBe(1);
  });

  // ─── Entry-history feed ───────────────────────────────────────

  it('captures diffs from curator_entry_history (day-one feed)', () => {
    const entry = makeEntry({
      id: 'e1',
      description:
        'A very long agent-written opening that rambles at length before ever getting to the point. The body covers caching in detail with specifics.',
    });
    vault.add(entry);
    curator.recordSnapshot('e1', 'agent', 'seed'); // agent output (before)
    vault.update('e1', {
      description: 'Short opening. The body covers caching in detail with specifics.',
    });
    curator.recordSnapshot('e1', 'user', 'run-1'); // human edit (after), runId = run-1

    const { ingested } = curator.ingestEntryHistoryDiffs();
    expect(ingested).toBe(1);

    const rows = vault
      .getProvider()
      .all<Record<string, unknown>>('SELECT * FROM curator_edit_diffs');
    expect(rows).toHaveLength(1);
    expect(rows[0].run_id).toBe('run-1');
    expect(rows[0].output_id).toBe('e1');
    expect(rows[0].source_ref).toBe('vault:capture-contract/pattern');
    expect(rows[0].diff_kind).toBe('tightened_opening');
  });

  it('skips untraceable edits (no run id in change_reason)', () => {
    vault.add(makeEntry({ id: 'e2' }));
    curator.recordSnapshot('e2', 'agent', 'seed');
    vault.update('e2', { description: 'edited by a human but with no run id attached' });
    curator.recordSnapshot('e2', 'user'); // no changeReason → untraceable
    expect(curator.ingestEntryHistoryDiffs('e2').ingested).toBe(0);
  });

  it('ignores agent/system snapshots (not human edits)', () => {
    vault.add(makeEntry({ id: 'e3' }));
    curator.recordSnapshot('e3', 'agent', 'seed');
    vault.update('e3', { description: 'a system-driven change, not a human edit' });
    curator.recordSnapshot('e3', 'system', 'run-x');
    expect(curator.ingestEntryHistoryDiffs('e3').ingested).toBe(0);
  });

  // ─── Recurrence threshold ─────────────────────────────────────

  it('fires a proposal at 3 diffs across 3 DISTINCT runs', () => {
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-b', 'run-c']);
    const { proposals } = curator.detectEditSourceProposals();
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.kind).toBe('edit_source');
    expect(p.sourceRef).toBe(CONTRACT);
    expect(p.diffKind).toBe('length_trim');
    expect([...p.evidenceRuns].sort()).toEqual(['run-a', 'run-b', 'run-c']);
    expect(['contract_amendment', 'reference_update', 'new_constraint']).toContain(
      p.proposedChange.type,
    );
    expect(p.status).toBe('pending');
    expect(p.id).toMatch(/^esp-/);
  });

  it('does NOT fire for 3 edits in a single run', () => {
    seedRecurring(curator, 'vault:capture-contract/rule', 'length_trim', [
      'run-solo',
      'run-solo',
      'run-solo',
    ]);
    const { proposals } = curator.detectEditSourceProposals();
    expect(proposals).toHaveLength(0);
    expect(curator.getEditSourceProposals()).toHaveLength(0);
  });

  it('does NOT fire below the distinct-run threshold (2 runs)', () => {
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-a', 'run-b']);
    expect(curator.detectEditSourceProposals().proposals).toHaveLength(0);
  });

  it('does NOT fire for 3 diffs across 3 distinct runs with 3 DIFFERENT diff_kinds', () => {
    // Same source_ref, three distinct runs — but each edit is a different kind,
    // so no (source_ref + diff_kind) group reaches 3 diffs. All three conditions
    // (same source, same kind, three runs) are required together.
    const kinds: DiffKind[] = ['length_trim', 'tone_shift', 'tightened_opening'];
    (['run-a', 'run-b', 'run-c'] as const).forEach((run, i) => {
      curator.recordEditDiff({
        outputId: `entry-${run}`,
        sourceRef: CONTRACT,
        runId: run,
        beforeText: `A long agent-written body number ${i} with plenty of detail here.`,
        afterText: `Short body ${i}.`,
        diffKind: kinds[i],
      });
    });
    expect(curator.getStatus().tables.edit_diffs).toBe(3);
    expect(curator.detectEditSourceProposals().proposals).toHaveLength(0);
    expect(curator.getEditSourceProposals()).toHaveLength(0);
  });

  it('re-detection is idempotent — one proposal row, not duplicated', () => {
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-b', 'run-c']);
    curator.detectEditSourceProposals();
    curator.detectEditSourceProposals();
    expect(curator.getEditSourceProposals()).toHaveLength(1);
    expect(curator.getStatus().tables.edit_proposals).toBe(1);
  });

  // ─── The hard rule: NEVER auto-applied ────────────────────────

  it('never auto-applies — proposals stay pending regardless of recurrence', () => {
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-b', 'run-c', 'run-d', 'run-e']);
    curator.detectEditSourceProposals();
    const pending = curator.getEditSourceProposals({ status: 'pending' });
    const approved = curator.getEditSourceProposals({ status: 'approved' });
    expect(pending).toHaveLength(1);
    expect(approved).toHaveLength(0);
  });

  it('exposes no apply/promote path on the curator', () => {
    const c = curator as unknown as Record<string, unknown>;
    expect(c.applyEditSourceProposal).toBeUndefined();
    expect(c.autoApplyEditSourceProposal).toBeUndefined();
    expect(c.promoteEditSourceProposal).toBeUndefined();
  });

  it('approve records the human decision ONLY — does not mutate any source entry', () => {
    vault.add(makeEntry({ id: 'kept', description: 'original human-authored description' }));
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-b', 'run-c']);
    const { proposals } = curator.detectEditSourceProposals();
    const id = proposals[0].id;

    const beforeEntry = vault.get('kept');
    const beforeVaultCount = vault.list({ limit: 1000 }).length;

    const res = curator.approveEditSourceProposal(id, 'genuine source defect');
    expect(res).toEqual({ updated: true, status: 'approved' });

    // No source file / vault entry was written by approval.
    expect(vault.get('kept')).toEqual(beforeEntry);
    expect(vault.list({ limit: 1000 }).length).toBe(beforeVaultCount);

    // Status moved to approved and left pending.
    expect(curator.getEditSourceProposals({ status: 'pending' })).toHaveLength(0);
    expect(curator.getEditSourceProposals({ status: 'approved' })).toHaveLength(1);
  });

  it('never re-opens a human decision on re-detection', () => {
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-a', 'run-b', 'run-c']);
    const { proposals } = curator.detectEditSourceProposals();
    curator.rejectEditSourceProposal(proposals[0].id, 'one-off');

    // More evidence arrives + re-detect: the rejected decision must stand.
    seedRecurring(curator, CONTRACT, 'length_trim', ['run-d', 'run-e', 'run-f']);
    curator.detectEditSourceProposals();

    expect(curator.getEditSourceProposals({ status: 'pending' })).toHaveLength(0);
    expect(curator.getEditSourceProposals({ status: 'rejected' })).toHaveLength(1);
  });

  // ─── Gate ─────────────────────────────────────────────────────

  it('runEditSourceLoop is a no-op when disabled (tracking gated off)', () => {
    // Seed history that WOULD produce a diff if the loop ran.
    vault.add(
      makeEntry({ id: 'e1', description: 'a long original description that rambles onward' }),
    );
    curator.recordSnapshot('e1', 'agent', 'seed');
    vault.update('e1', { description: 'short' });
    curator.recordSnapshot('e1', 'user', 'run-1');

    const result = curator.runEditSourceLoop({ enabled: false });
    expect(result).toEqual({ enabled: false, ingested: 0, proposals: [] });
    expect(curator.getStatus().tables.edit_diffs).toBe(0);
  });

  it('runEditSourceLoop ingests + detects when enabled', () => {
    // Three distinct runs each tighten the opening of a different entry.
    (['run-a', 'run-b', 'run-c'] as const).forEach((run, i) => {
      const id = `e-${run}`;
      vault.add(
        makeEntry({
          id,
          description:
            'This is an extremely long rambling introductory opening that meanders for a while before the point. The body explains item ' +
            i +
            ' with concrete detail here.',
        }),
      );
      curator.recordSnapshot(id, 'agent', 'seed');
      vault.update(id, {
        description: 'Tight opening. The body explains item ' + i + ' with concrete detail here.',
      });
      curator.recordSnapshot(id, 'user', run);
    });

    const result = curator.runEditSourceLoop({ enabled: true });
    expect(result.enabled).toBe(true);
    expect(result.ingested).toBe(3);
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
    expect(result.proposals.every((p) => p.status === 'pending')).toBe(true);
  });
});
