/**
 * Operator Profile — persistence layer for operator personality learning.
 *
 * Follows the BrainIntelligence pattern: separate class, own SQLite tables,
 * takes Vault as constructor dep.
 */

import { randomUUID } from 'node:crypto';
import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  OperatorSignal,
  OperatorProfile as OperatorProfileType,
  ProfileSectionKey,
  SynthesisCheckResult,
  ProfileSection,
} from './operator-types.js';

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_AGENT_ID = 'default';
const SYNTHESIS_SIGNAL_THRESHOLD = 50;
const SYNTHESIS_SESSION_THRESHOLD = 5;
const SECTION_SIGNAL_THRESHOLD = 8;

/** Maps signal types to the profile sections they influence. */
const SIGNAL_SECTION_MAP: Record<string, ProfileSectionKey[]> = {
  command_style: ['communication'],
  work_rhythm: ['cognition'],
  tool_preference: ['technicalContext'],
  session_depth: ['cognition'],
  domain_expertise: ['technicalContext', 'identity'],
  correction: ['workingRules', 'trustModel'],
  frustration: ['trustModel', 'communication'],
  personal_share: ['identity', 'tasteProfile'],
  communication_pref: ['communication'],
  reaction_to_output: ['trustModel', 'growthEdges'],
};

// ─── Defaults ───────────────────────────────────────────────────────

function defaultProfile(id: string, agentId: string): OperatorProfileType {
  const now = new Date().toISOString();
  return {
    id,
    operatorId: agentId,
    version: 1,
    identity: { background: '', role: '', philosophy: '', evidence: [] },
    cognition: { patterns: [], derivations: [], evidence: [] },
    communication: {
      style: 'mixed',
      signalWords: [],
      formality: 0.5,
      patience: 0.5,
      adaptationRules: [],
    },
    workingRules: { rules: [] },
    trustModel: { level: 'new', builders: [], breakers: [], currentLevel: 0.5 },
    tasteProfile: { entries: [] },
    growthEdges: { observed: [], selfReported: [] },
    technicalContext: { domains: [], tools: [], blindSpots: [] },
    sessionCount: 0,
    lastSynthesis: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Section column mapping ─────────────────────────────────────────

const SECTION_COLUMNS: Record<ProfileSectionKey, string> = {
  identity: 'identity',
  cognition: 'cognition',
  communication: 'communication',
  workingRules: 'working_rules',
  trustModel: 'trust_model',
  tasteProfile: 'taste_profile',
  growthEdges: 'growth_edges',
  technicalContext: 'technical_context',
};

// ─── Class ──────────────────────────────────────────────────────────

export class OperatorProfileStore {
  private provider: PersistenceProvider;

  constructor(vault: Vault) {
    this.provider = vault.getProvider();
    this.initTables();
  }

  // ─── Table Initialization ─────────────────────────────────────────

  private initTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS operator_profiles (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL DEFAULT '${DEFAULT_AGENT_ID}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        identity TEXT NOT NULL DEFAULT '{}',
        cognition TEXT NOT NULL DEFAULT '{}',
        communication TEXT NOT NULL DEFAULT '{}',
        working_rules TEXT NOT NULL DEFAULT '{}',
        trust_model TEXT NOT NULL DEFAULT '{}',
        taste_profile TEXT NOT NULL DEFAULT '{}',
        growth_edges TEXT NOT NULL DEFAULT '{}',
        technical_context TEXT NOT NULL DEFAULT '{}',
        session_count INTEGER NOT NULL DEFAULT 0,
        signal_count INTEGER NOT NULL DEFAULT 0,
        last_synthesis TEXT,
        synthesis_version INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS operator_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_data TEXT NOT NULL DEFAULT '{}',
        source TEXT,
        confidence REAL NOT NULL DEFAULT 0.5,
        processed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (profile_id) REFERENCES operator_profiles(id)
      );

      CREATE INDEX IF NOT EXISTS idx_operator_signals_type_processed
        ON operator_signals(signal_type, processed);

      CREATE INDEX IF NOT EXISTS idx_operator_signals_profile_created
        ON operator_signals(profile_id, created_at);

      CREATE TABLE IF NOT EXISTS operator_profile_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL DEFAULT '{}',
        changes TEXT,
        trigger TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────

  getProfile(profileId?: string): OperatorProfileType | null {
    const sql = profileId
      ? 'SELECT * FROM operator_profiles WHERE id = ?'
      : 'SELECT * FROM operator_profiles LIMIT 1';
    const params = profileId ? [profileId] : [];
    const row = this.provider.get<Record<string, unknown>>(sql, params);
    if (!row) return null;
    return this.rowToProfile(row);
  }

  getSection(section: ProfileSectionKey, profileId?: string): ProfileSection | null {
    const col = SECTION_COLUMNS[section];
    const sql = profileId
      ? `SELECT ${col} FROM operator_profiles WHERE id = ?`
      : `SELECT ${col} FROM operator_profiles LIMIT 1`;
    const params = profileId ? [profileId] : [];
    const row = this.provider.get<Record<string, unknown>>(sql, params);
    if (!row) return null;
    return JSON.parse((row[col] as string) || '{}') as ProfileSection;
  }

  updateSection(
    section: ProfileSectionKey,
    data: ProfileSection,
    profileId?: string,
  ): boolean {
    const id = profileId ?? this.ensureProfile();
    const col = SECTION_COLUMNS[section];
    const result = this.provider.run(
      `UPDATE operator_profiles SET ${col} = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(data), id],
    );
    return result.changes > 0;
  }

  correctSection(
    section: ProfileSectionKey,
    data: ProfileSection,
    profileId?: string,
  ): boolean {
    const id = profileId ?? this.ensureProfile();
    this.snapshot('correction', id);
    return this.updateSection(section, data, id);
  }

  deleteProfile(profileId?: string): boolean {
    const id = profileId ?? this.getDefaultProfileId();
    if (!id) return false;
    const profile = this.getProfile(id);
    if (!profile) return false;
    this.snapshot('deletion', id);
    this.provider.run('DELETE FROM operator_signals WHERE profile_id = ?', [id]);
    const result = this.provider.run('DELETE FROM operator_profiles WHERE id = ?', [id]);
    return result.changes > 0;
  }

  // ─── Signal Methods ───────────────────────────────────────────────

  accumulateSignals(signals: OperatorSignal[], profileId?: string): number {
    const id = profileId ?? this.ensureProfile();
    let inserted = 0;
    this.provider.transaction(() => {
      for (const signal of signals) {
        this.provider.run(
          `INSERT INTO operator_signals (profile_id, signal_type, signal_data, source, confidence, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, signal.signalType, JSON.stringify(signal.data), signal.source ?? null, signal.confidence, signal.timestamp],
        );
        inserted++;
      }
      this.provider.run(
        `UPDATE operator_profiles SET signal_count = signal_count + ?, updated_at = datetime('now') WHERE id = ?`,
        [inserted, id],
      );
    });
    return inserted;
  }

  listSignals(
    filter: { types?: string[]; processed?: boolean; limit?: number } = {},
    profileId?: string,
  ): Array<{ id: number; signalType: string; signalData: unknown; source: string | null; confidence: number; processed: boolean; createdAt: string }> {
    const id = profileId ?? this.getDefaultProfileId();
    if (!id) return [];
    const conditions = ['profile_id = ?'];
    const params: unknown[] = [id];
    if (filter.types && filter.types.length > 0) {
      conditions.push(`signal_type IN (${filter.types.map(() => '?').join(',')})`);
      params.push(...filter.types);
    }
    if (filter.processed !== undefined) {
      conditions.push('processed = ?');
      params.push(filter.processed ? 1 : 0);
    }
    const limit = filter.limit ?? 100;
    const sql = `SELECT * FROM operator_signals WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = this.provider.all<Record<string, unknown>>(sql, params);
    return rows.map((r) => ({
      id: r.id as number,
      signalType: r.signal_type as string,
      signalData: JSON.parse((r.signal_data as string) || '{}'),
      source: (r.source as string) ?? null,
      confidence: r.confidence as number,
      processed: (r.processed as number) === 1,
      createdAt: r.created_at as string,
    }));
  }

  signalStats(profileId?: string): {
    byType: Record<string, number>;
    totalUnprocessed: number;
    lastSynthesis: string | null;
  } {
    const id = profileId ?? this.getDefaultProfileId();
    if (!id) return { byType: {}, totalUnprocessed: 0, lastSynthesis: null };
    const rows = this.provider.all<{ signal_type: string; cnt: number }>(
      'SELECT signal_type, COUNT(*) as cnt FROM operator_signals WHERE profile_id = ? GROUP BY signal_type',
      [id],
    );
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.signal_type] = r.cnt;

    const unprocessed = this.provider.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM operator_signals WHERE profile_id = ? AND processed = 0',
      [id],
    );
    const profile = this.provider.get<{ last_synthesis: string | null }>(
      'SELECT last_synthesis FROM operator_profiles WHERE id = ?',
      [id],
    );
    return {
      byType,
      totalUnprocessed: unprocessed?.cnt ?? 0,
      lastSynthesis: profile?.last_synthesis ?? null,
    };
  }

  // ─── Synthesis Check ──────────────────────────────────────────────

  synthesisCheck(profileId?: string): SynthesisCheckResult {
    const id = profileId ?? this.getDefaultProfileId();
    if (!id) {
      return {
        due: false,
        reason: 'No profile exists',
        sectionsToUpdate: allSectionsFalse(),
        pendingSignalCount: 0,
        lastSynthesisAt: null,
      };
    }
    const stats = this.signalStats(id);
    const profile = this.provider.get<{ session_count: number; last_synthesis: string | null; synthesis_version: number }>(
      'SELECT session_count, last_synthesis, synthesis_version FROM operator_profiles WHERE id = ?',
      [id],
    );
    if (!profile) {
      return {
        due: false,
        reason: 'Profile not found',
        sectionsToUpdate: allSectionsFalse(),
        pendingSignalCount: 0,
        lastSynthesisAt: null,
      };
    }

    const pending = stats.totalUnprocessed;
    const sessionsSinceSynthesis = profile.synthesis_version === 0
      ? profile.session_count
      : profile.session_count; // tracked by incrementing session_count

    const signalThresholdMet = pending >= SYNTHESIS_SIGNAL_THRESHOLD;
    const sessionThresholdMet = sessionsSinceSynthesis >= SYNTHESIS_SESSION_THRESHOLD && profile.synthesis_version > 0
      ? false // sessions threshold only meaningful after first synthesis
      : sessionsSinceSynthesis >= SYNTHESIS_SESSION_THRESHOLD;

    const due = signalThresholdMet || sessionThresholdMet;

    // Per-section analysis
    const sectionCounts = this.sectionSignalCounts(id);
    const sectionsToUpdate = allSectionsFalse();
    for (const [section, count] of Object.entries(sectionCounts)) {
      if (count >= SECTION_SIGNAL_THRESHOLD) {
        sectionsToUpdate[section as ProfileSectionKey] = true;
      }
    }

    const reasons: string[] = [];
    if (signalThresholdMet) reasons.push(`${pending} unprocessed signals (threshold: ${SYNTHESIS_SIGNAL_THRESHOLD})`);
    if (sessionThresholdMet) reasons.push(`${sessionsSinceSynthesis} sessions since last synthesis (threshold: ${SYNTHESIS_SESSION_THRESHOLD})`);
    if (!due) reasons.push('Below all thresholds');

    return {
      due,
      reason: reasons.join('; '),
      sectionsToUpdate,
      pendingSignalCount: pending,
      lastSynthesisAt: profile.last_synthesis,
    };
  }

  // ─── Snapshot / Versioning ────────────────────────────────────────

  snapshot(trigger: string, profileId?: string): boolean {
    const id = profileId ?? this.getDefaultProfileId();
    if (!id) return false;
    const profile = this.getProfile(id);
    if (!profile) return false;

    const version = this.provider.get<{ synthesis_version: number }>(
      'SELECT synthesis_version FROM operator_profiles WHERE id = ?',
      [id],
    );
    const nextVersion = (version?.synthesis_version ?? 0) + 1;

    this.provider.run(
      `INSERT INTO operator_profile_history (profile_id, version, snapshot, changes, trigger)
       VALUES (?, ?, ?, ?, ?)`,
      [id, nextVersion, JSON.stringify(profile), null, trigger],
    );
    this.provider.run(
      `UPDATE operator_profiles SET synthesis_version = ?, last_synthesis = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [nextVersion, id],
    );
    return true;
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private ensureProfile(agentId: string = DEFAULT_AGENT_ID): string {
    const existing = this.provider.get<{ id: string }>(
      'SELECT id FROM operator_profiles WHERE agent_id = ? LIMIT 1',
      [agentId],
    );
    if (existing) return existing.id;
    const id = randomUUID();
    const profile = defaultProfile(id, agentId);
    this.provider.run(
      `INSERT INTO operator_profiles (id, agent_id, identity, cognition, communication, working_rules, trust_model, taste_profile, growth_edges, technical_context)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, agentId,
        JSON.stringify(profile.identity),
        JSON.stringify(profile.cognition),
        JSON.stringify(profile.communication),
        JSON.stringify(profile.workingRules),
        JSON.stringify(profile.trustModel),
        JSON.stringify(profile.tasteProfile),
        JSON.stringify(profile.growthEdges),
        JSON.stringify(profile.technicalContext),
      ],
    );
    return id;
  }

  private getDefaultProfileId(): string | null {
    const row = this.provider.get<{ id: string }>('SELECT id FROM operator_profiles LIMIT 1');
    return row?.id ?? null;
  }

  private rowToProfile(row: Record<string, unknown>): OperatorProfileType {
    return {
      id: row.id as string,
      operatorId: row.agent_id as string,
      version: (row.synthesis_version as number) ?? 1,
      identity: JSON.parse((row.identity as string) || '{}'),
      cognition: JSON.parse((row.cognition as string) || '{}'),
      communication: JSON.parse((row.communication as string) || '{}'),
      workingRules: JSON.parse((row.working_rules as string) || '{}'),
      trustModel: JSON.parse((row.trust_model as string) || '{}'),
      tasteProfile: JSON.parse((row.taste_profile as string) || '{}'),
      growthEdges: JSON.parse((row.growth_edges as string) || '{}'),
      technicalContext: JSON.parse((row.technical_context as string) || '{}'),
      sessionCount: (row.session_count as number) ?? 0,
      lastSynthesis: (row.last_synthesis as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private sectionSignalCounts(profileId: string): Record<ProfileSectionKey, number> {
    const counts = allSectionsZero();
    const rows = this.provider.all<{ signal_type: string; cnt: number }>(
      'SELECT signal_type, COUNT(*) as cnt FROM operator_signals WHERE profile_id = ? AND processed = 0 GROUP BY signal_type',
      [profileId],
    );
    for (const row of rows) {
      const sections = SIGNAL_SECTION_MAP[row.signal_type];
      if (sections) {
        for (const s of sections) counts[s] += row.cnt;
      }
    }
    return counts;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────

function allSectionsFalse(): Record<ProfileSectionKey, boolean> {
  return {
    identity: false,
    cognition: false,
    communication: false,
    workingRules: false,
    trustModel: false,
    tasteProfile: false,
    growthEdges: false,
    technicalContext: false,
  };
}

function allSectionsZero(): Record<ProfileSectionKey, number> {
  return {
    identity: 0,
    cognition: 0,
    communication: 0,
    workingRules: 0,
    trustModel: 0,
    tasteProfile: 0,
    growthEdges: 0,
    technicalContext: 0,
  };
}
