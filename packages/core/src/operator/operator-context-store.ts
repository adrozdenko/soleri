/**
 * OperatorContextStore — persistence and compounding for the operator context
 * signal taxonomy.
 *
 * Manages a single SQLite table (`operator_context`) and implements the
 * compounding algorithms that blend per-session signals into a stable profile.
 */

import { randomUUID } from 'node:crypto';
import type { PersistenceProvider } from '../persistence/types.js';
import {
  DECLINED_CATEGORIES,
  type ContextItemType,
  type CorrectionItem,
  type CorrectionSignal,
  type ExpertiseItem,
  type ExpertiseLevel,
  type ExpertiseSignal,
  type InterestItem,
  type InterestSignal,
  type OperatorContext,
  type OperatorSignals,
  type PatternFrequency,
  type WorkPatternItem,
  type WorkPatternSignal,
} from './operator-context-types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIDENCE = 0.5;

/** Regex to detect declined-category content in signal text fields. */
const DECLINED_RE = new RegExp(`\\b(${DECLINED_CATEGORIES.join('|')})\\b`, 'i');

// =============================================================================
// STORE
// =============================================================================

export class OperatorContextStore {
  private provider: PersistenceProvider;
  private lastRendered: string | null = null;

  constructor(provider: PersistenceProvider) {
    this.provider = provider;
    this.init();
  }

  // ─── Initialization ─────────────────────────────────────────────────

  init(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS operator_context (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        scope TEXT DEFAULT 'global',
        session_count INTEGER DEFAULT 1,
        last_observed INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        active INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_operator_context_type
        ON operator_context(type);

      CREATE INDEX IF NOT EXISTS idx_operator_context_key
        ON operator_context(type, key);
    `);
  }

  // ─── Read ──────────────────────────────────────────────────────────

  getContext(): OperatorContext {
    const rows = this.provider.all<ContextRow>(
      'SELECT * FROM operator_context WHERE active = 1 ORDER BY type, last_observed DESC',
    );

    const expertise: ExpertiseItem[] = [];
    const corrections: CorrectionItem[] = [];
    const interests: InterestItem[] = [];
    const patterns: WorkPatternItem[] = [];

    for (const row of rows) {
      const parsed = JSON.parse(row.value);
      switch (row.type as ContextItemType) {
        case 'expertise':
          expertise.push(parsed as ExpertiseItem);
          break;
        case 'correction':
          corrections.push(parsed as CorrectionItem);
          break;
        case 'interest':
          interests.push(parsed as InterestItem);
          break;
        case 'pattern':
          patterns.push(parsed as WorkPatternItem);
          break;
      }
    }

    const sessionCountRow = this.provider.get<{ cnt: number }>(
      'SELECT MAX(session_count) as cnt FROM operator_context',
    );
    const lastRow = this.provider.get<{ ts: number }>(
      'SELECT MAX(last_observed) as ts FROM operator_context',
    );

    return {
      expertise,
      corrections,
      interests,
      patterns,
      sessionCount: sessionCountRow?.cnt ?? 0,
      lastUpdated: lastRow?.ts ?? 0,
    };
  }

  // ─── Compound ─────────────────────────────────────────────────────

  compoundSignals(signals: OperatorSignals, sessionId: string): void {
    this.provider.transaction(() => {
      for (const sig of signals.expertise) {
        if (this.isDeclined(sig.topic, sig.evidence)) continue;
        this.compoundExpertise(sig);
      }
      for (const sig of signals.corrections) {
        if (this.isDeclined(sig.rule, sig.quote)) continue;
        this.compoundCorrection(sig, sessionId);
      }
      for (const sig of signals.interests) {
        if (this.isDeclined(sig.tag, sig.context)) continue;
        this.compoundInterest(sig);
      }
      for (const sig of signals.patterns) {
        if (this.isDeclined(sig.pattern)) continue;
        this.compoundPattern(sig);
      }

      // Decay interests not mentioned in this session
      this.decayInterests(signals.interests.map((i) => i.tag));
    });
  }

  // ─── Drift ────────────────────────────────────────────────────────

  hasDrifted(): boolean {
    const current = this.renderContextFile();
    if (this.lastRendered === null) {
      this.lastRendered = current;
      return true; // first render is always drift
    }
    const drifted = current !== this.lastRendered;
    if (drifted) {
      this.lastRendered = current;
    }
    return drifted;
  }

  // ─── Render ───────────────────────────────────────────────────────

  renderContextFile(): string {
    const ctx = this.getContext();
    const lines: string[] = ['# Operator Context', ''];

    // Expertise
    if (ctx.expertise.length > 0) {
      const items = ctx.expertise
        .sort((a, b) => b.confidence - a.confidence)
        .map((e) => `${e.topic} (${e.level}, ${e.sessionCount} sessions, confidence ${e.confidence.toFixed(2)})`);
      lines.push(`**Expertise:** ${items.join(', ')}.`);
      lines.push('');
    }

    // Corrections
    const active = ctx.corrections.filter((c) => c.active);
    if (active.length > 0) {
      lines.push('**Corrections:**');
      for (const c of active) {
        const scopeTag = c.scope === 'project' ? ` [project]` : '';
        const quoteTag = c.quote ? ` — "${c.quote}"` : '';
        lines.push(`- ${c.rule}${scopeTag}${quoteTag}`);
      }
      lines.push('');
    }

    // Interests
    const significantInterests = ctx.interests
      .filter((i) => i.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence);
    if (significantInterests.length > 0) {
      const items = significantInterests.map(
        (i) => `${i.tag} (${i.mentionCount} mentions, confidence ${i.confidence.toFixed(2)})`,
      );
      lines.push(`**Interests:** ${items.join(', ')}.`);
      lines.push('');
    }

    // Patterns
    if (ctx.patterns.length > 0) {
      const items = ctx.patterns
        .sort((a, b) => b.confidence - a.confidence)
        .map((p) => `${p.pattern} (${p.frequency}, ${p.observedCount} observations)`);
      lines.push(`**Work patterns:** ${items.join(', ')}.`);
      lines.push('');
    }

    return lines.join('\n').trimEnd();
  }

  // ─── Inspect / Delete ─────────────────────────────────────────────

  inspect(): OperatorContext {
    return this.getContext();
  }

  deleteItem(type: ContextItemType, id: string): boolean {
    const result = this.provider.run('DELETE FROM operator_context WHERE type = ? AND id = ?', [
      type,
      id,
    ]);
    return result.changes > 0;
  }

  // ─── Private: Compounding Algorithms ──────────────────────────────

  private compoundExpertise(sig: ExpertiseSignal): void {
    const now = Date.now();
    const signalConf = sig.confidence ?? DEFAULT_CONFIDENCE;
    const key = sig.topic.toLowerCase();

    const existing = this.getRow('expertise', key);
    if (existing) {
      const item = JSON.parse(existing.value) as ExpertiseItem;

      // Exponential moving average
      const newConfidence = item.confidence * 0.7 + signalConf * 0.3;

      // Level upgrade: only up, never down automatically
      let level = item.level;
      if (this.levelRank(sig.level) > this.levelRank(item.level) && newConfidence > 0.8) {
        level = sig.level;
      }

      const updated: ExpertiseItem = {
        ...item,
        level,
        confidence: Math.min(1.0, newConfidence),
        sessionCount: item.sessionCount + 1,
        lastObserved: now,
      };

      this.updateRow(existing.id, 'expertise', key, updated, updated.confidence);
    } else {
      const item: ExpertiseItem = {
        topic: sig.topic,
        level: sig.level,
        confidence: signalConf,
        sessionCount: 1,
        lastObserved: now,
      };
      this.insertRow('expertise', key, item, signalConf);
    }
  }

  private compoundCorrection(sig: CorrectionSignal, sessionId: string): void {
    const now = Date.now();
    const key = sig.rule.toLowerCase();

    // Corrections: latest wins on conflict
    const existing = this.getRow('correction', key);
    if (existing) {
      const item: CorrectionItem = {
        ...(JSON.parse(existing.value) as CorrectionItem),
        rule: sig.rule,
        quote: sig.quote,
        scope: sig.scope,
        active: true,
        sessionId,
      };
      this.updateRow(existing.id, 'correction', key, item, 1.0, sig.scope);
    } else {
      const correctionId = randomUUID();
      const item: CorrectionItem = {
        id: correctionId,
        rule: sig.rule,
        quote: sig.quote,
        scope: sig.scope,
        active: true,
        createdAt: now,
        sessionId,
      };
      this.insertRow('correction', key, item, 1.0, sig.scope, correctionId);
    }
  }

  private compoundInterest(sig: InterestSignal): void {
    const now = Date.now();
    const key = sig.tag.toLowerCase();

    const existing = this.getRow('interest', key);
    if (existing) {
      const item = JSON.parse(existing.value) as InterestItem;
      const newMentions = item.mentionCount + 1;
      const newConfidence = Math.min(1.0, item.confidence + 0.1);

      const updated: InterestItem = {
        ...item,
        confidence: newConfidence,
        mentionCount: newMentions,
        lastMentioned: now,
      };
      this.updateRow(existing.id, 'interest', key, updated, updated.confidence);
    } else {
      const item: InterestItem = {
        tag: sig.tag,
        confidence: DEFAULT_CONFIDENCE,
        mentionCount: 1,
        lastMentioned: now,
      };
      this.insertRow('interest', key, item, item.confidence);
    }
  }

  private compoundPattern(sig: WorkPatternSignal): void {
    const now = Date.now();
    const signalConf = DEFAULT_CONFIDENCE;
    const key = sig.pattern.toLowerCase();

    const existing = this.getRow('pattern', key);
    if (existing) {
      const item = JSON.parse(existing.value) as WorkPatternItem;

      // Exponential moving average
      const newConfidence = item.confidence * 0.8 + signalConf * 0.2;
      const newCount = item.observedCount + 1;

      // Frequency upgrades
      let frequency = item.frequency;
      if (newCount >= 8) frequency = 'frequent';
      else if (newCount >= 3) frequency = 'occasional';

      const updated: WorkPatternItem = {
        ...item,
        frequency,
        confidence: Math.min(1.0, newConfidence),
        observedCount: newCount,
        lastObserved: now,
      };
      this.updateRow(existing.id, 'pattern', key, updated, updated.confidence);
    } else {
      const item: WorkPatternItem = {
        pattern: sig.pattern,
        frequency: sig.frequency ?? 'once',
        confidence: signalConf,
        observedCount: 1,
        lastObserved: now,
      };
      this.insertRow('pattern', key, item, item.confidence);
    }
  }

  private decayInterests(mentionedTags: string[]): void {
    const mentioned = new Set(mentionedTags.map((t) => t.toLowerCase()));
    const allInterests = this.provider.all<ContextRow>(
      "SELECT * FROM operator_context WHERE type = 'interest' AND active = 1",
    );

    for (const row of allInterests) {
      if (mentioned.has(row.key)) continue;
      const item = JSON.parse(row.value) as InterestItem;
      const decayed = Math.max(0.1, item.confidence - 0.01);
      if (decayed !== item.confidence) {
        const updated = { ...item, confidence: decayed };
        this.updateRow(row.id, 'interest', row.key, updated, decayed);
      }
    }
  }

  // ─── Private: DB Helpers ──────────────────────────────────────────

  private getRow(type: ContextItemType, key: string): ContextRow | undefined {
    return this.provider.get<ContextRow>(
      'SELECT * FROM operator_context WHERE type = ? AND key = ? AND active = 1',
      [type, key],
    );
  }

  private insertRow(
    type: ContextItemType,
    key: string,
    value: unknown,
    confidence: number,
    scope: string = 'global',
    rowId?: string,
  ): void {
    const now = Date.now();
    this.provider.run(
      `INSERT INTO operator_context (id, type, key, value, confidence, scope, session_count, last_observed, created_at, active)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      [rowId ?? randomUUID(), type, key, JSON.stringify(value), confidence, scope, now, now],
    );
  }

  private updateRow(
    id: string,
    type: ContextItemType,
    key: string,
    value: unknown,
    confidence: number,
    scope?: string,
  ): void {
    const now = Date.now();
    const scopeClause = scope !== undefined ? ', scope = ?' : '';
    const params: unknown[] = [
      JSON.stringify(value),
      confidence,
      now,
      ...(scope !== undefined ? [scope] : []),
      id,
    ];
    this.provider.run(
      `UPDATE operator_context SET value = ?, confidence = ?, last_observed = ?${scopeClause} WHERE id = ?`,
      params,
    );
    // Suppress unused warnings
    void type;
    void key;
  }

  // ─── Private: Utilities ───────────────────────────────────────────

  private levelRank(level: ExpertiseLevel): number {
    switch (level) {
      case 'learning':
        return 0;
      case 'intermediate':
        return 1;
      case 'expert':
        return 2;
    }
  }

  private isDeclined(...fields: (string | undefined | null)[]): boolean {
    for (const field of fields) {
      if (field && DECLINED_RE.test(field)) return true;
    }
    return false;
  }
}

// =============================================================================
// INTERNAL ROW TYPE
// =============================================================================

interface ContextRow {
  id: string;
  type: string;
  key: string;
  value: string;
  confidence: number;
  scope: string;
  session_count: number;
  last_observed: number;
  created_at: number;
  active: number;
}
