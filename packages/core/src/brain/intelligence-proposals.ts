/**
 * Proposal CRUD, knowledge extraction, promotion, and auto-promote logic.
 * Extracted from BrainIntelligence to keep the coordinator thin.
 */

import { randomUUID } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';
import type { Brain } from './brain.js';
import type { KnowledgeProposal, ExtractionResult, BrainSession } from './types.js';
import {
  extractObjectiveFromContext,
  rowToProposal,
  type BrainProposalRow,
} from './intelligence-rows.js';
import { extractKnowledgeProposals } from './intelligence-extraction.js';
import { AUTO_PROMOTE_THRESHOLD, AUTO_PROMOTE_PENDING_MIN } from './intelligence-constants.js';

// ─── Proposal CRUD ────────────────────────────────────────────────

export function createProposal(
  provider: PersistenceProvider,
  sessionId: string,
  rule: string,
  type: 'pattern' | 'anti-pattern' | 'workflow',
  data: { title: string; description: string; confidence: number },
): KnowledgeProposal {
  // Dedup guard: skip if a proposal with the same rule + sessionId already exists
  const existing = provider.get<BrainProposalRow>(
    'SELECT * FROM brain_proposals WHERE session_id = ? AND rule = ? LIMIT 1',
    [sessionId, rule],
  );
  if (existing) {
    return rowToProposal(existing);
  }

  const id = randomUUID();
  provider.run(
    `INSERT INTO brain_proposals (id, session_id, rule, type, title, description, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, rule, type, data.title, data.description, data.confidence],
  );

  return {
    id,
    sessionId,
    rule,
    type,
    title: data.title,
    description: data.description,
    confidence: data.confidence,
    promoted: false,
    createdAt: new Date().toISOString(),
  };
}

export function getProposals(
  provider: PersistenceProvider,
  options?: { sessionId?: string; promoted?: boolean; limit?: number },
): KnowledgeProposal[] {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options?.sessionId) {
    conditions.push('session_id = ?');
    values.push(options.sessionId);
  }
  if (options?.promoted !== undefined && options.promoted !== null) {
    conditions.push('promoted = ?');
    values.push(options.promoted ? 1 : 0);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = options?.limit ?? 50;
  values.push(limit);

  const rows = provider.all<BrainProposalRow>(
    `SELECT * FROM brain_proposals ${where} ORDER BY created_at DESC LIMIT ?`,
    values,
  );

  return rows.map((row) => rowToProposal(row));
}

// ─── Extraction ───────────────────────────────────────────────────

export function extractKnowledge(
  provider: PersistenceProvider,
  session: BrainSession,
): ExtractionResult {
  const { proposals, rulesApplied } = extractKnowledgeProposals({
    sessionId: session.id,
    session,
    provider,
    createProposal: (sid, rule, type, data) => createProposal(provider, sid, rule, type, data),
    extractObjective: extractObjectiveFromContext,
  });

  // Mark session as extracted
  provider.run("UPDATE brain_sessions SET extracted_at = datetime('now') WHERE id = ?", [
    session.id,
  ]);

  return {
    sessionId: session.id,
    proposals,
    rulesApplied: [...new Set(rulesApplied)],
  };
}

export function resetExtracted(
  provider: PersistenceProvider,
  options?: { sessionId?: string; since?: string; all?: boolean },
): { reset: number } {
  if (options?.sessionId) {
    const info = provider.run(
      'UPDATE brain_sessions SET extracted_at = NULL WHERE id = ? AND extracted_at IS NOT NULL',
      [options.sessionId],
    );
    return { reset: info.changes };
  }

  if (options?.since) {
    const info = provider.run(
      'UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at >= ?',
      [options.since],
    );
    return { reset: info.changes };
  }

  if (options?.all) {
    const info = provider.run(
      'UPDATE brain_sessions SET extracted_at = NULL WHERE extracted_at IS NOT NULL',
    );
    return { reset: info.changes };
  }

  return { reset: 0 };
}

// ─── Auto-Promote ─────────────────────────────────────────────────

/**
 * Auto-promote high-confidence proposals via enrichAndCapture().
 * Dedup in enrichAndCapture() handles novelty gating:
 * - TF-IDF similarity >= 0.8 -> blocked (near-duplicate)
 * - Content-hash match -> blocked (exact duplicate)
 */
export function autoPromoteProposals(
  provider: PersistenceProvider,
  brain: Brain,
  proposals: KnowledgeProposal[],
): void {
  for (const p of proposals) {
    if (p.confidence >= AUTO_PROMOTE_THRESHOLD) {
      try {
        const vaultType: 'pattern' | 'anti-pattern' | 'rule' =
          p.type === 'anti-pattern' ? 'anti-pattern' : 'pattern';
        const result = brain.enrichAndCapture({
          id: `proposal-${p.id}`,
          type: vaultType,
          domain: 'brain-intelligence',
          title: p.title,
          severity: 'suggestion',
          description: p.description,
          tags: ['auto-extracted', 'auto-promoted', p.rule],
        });
        if (result.captured) {
          provider.run('UPDATE brain_proposals SET promoted = 1 WHERE id = ?', [p.id]);
        }
      } catch {
        // Non-critical — proposal stays as pending
      }
    } else if (p.confidence < AUTO_PROMOTE_PENDING_MIN) {
      // Low confidence — mark as not surfaceable (promoted = false is already default)
    }
    // Medium confidence (0.4-0.8) — stays as pending, surfaced in briefing
  }
}

// ─── Promote ──────────────────────────────────────────────────────

export function promoteProposals(
  provider: PersistenceProvider,
  brain: Brain,
  proposalIds: string[],
  governanceGate?: {
    evaluateCapture: (
      projectPath: string,
      entry: { type: string; category: string; title?: string },
    ) => { action: string; reason?: string };
    propose: (
      projectPath: string,
      entryData: {
        entryId?: string;
        title: string;
        type: string;
        category: string;
        data?: Record<string, unknown>;
      },
      source?: string,
    ) => number;
  },
  projectPath?: string,
): {
  promoted: number;
  failed: string[];
  gated: Array<{ id: string; action: string; reason?: string }>;
} {
  let promoted = 0;
  const failed: string[] = [];
  const gated: Array<{ id: string; action: string; reason?: string }> = [];
  const pp = projectPath ?? '.';

  for (const id of proposalIds) {
    const row = provider.get<{
      id: string;
      session_id: string;
      rule: string;
      type: string;
      title: string;
      description: string;
      confidence: number;
      promoted: number;
      created_at: string;
    }>('SELECT * FROM brain_proposals WHERE id = ?', [id]);

    if (!row) {
      failed.push(id);
      continue;
    }

    if (row.promoted) continue; // Already promoted

    // Map type for vault
    const rawType = row.type;
    const vaultType: 'pattern' | 'anti-pattern' | 'rule' =
      rawType === 'anti-pattern' ? 'anti-pattern' : 'pattern';

    // Governance gate (when provided)
    if (governanceGate) {
      const decision = governanceGate.evaluateCapture(pp, {
        type: vaultType,
        category: 'brain-intelligence',
        title: row.title,
      });

      if (decision.action === 'propose') {
        governanceGate.propose(
          pp,
          {
            entryId: `proposal-${id}`,
            title: row.title,
            type: vaultType,
            category: 'brain-intelligence',
            data: {
              severity: 'suggestion',
              description: row.description,
              tags: ['auto-extracted', row.rule],
            },
          },
          'brain-promote',
        );
        gated.push({ id, action: 'propose', reason: decision.reason });
        continue;
      }

      if (decision.action !== 'capture') {
        gated.push({ id, action: decision.action, reason: decision.reason });
        continue;
      }
    }

    // Capture into vault
    brain.enrichAndCapture({
      id: `proposal-${id}`,
      type: vaultType,
      domain: 'brain-intelligence',
      title: row.title,
      severity: 'suggestion',
      description: row.description,
      tags: ['auto-extracted', row.rule],
    });

    provider.run('UPDATE brain_proposals SET promoted = 1 WHERE id = ?', [id]);
    promoted++;
  }

  return { promoted, failed, gated };
}
