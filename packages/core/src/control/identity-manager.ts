/**
 * IdentityManager — Agent identity CRUD with versioning and rollback.
 *
 * Follows the Curator/BrainIntelligence pattern: separate class, own SQLite
 * tables, takes Vault as constructor dep. Uses PersistenceProvider abstraction
 * for all database access.
 */

import { randomUUID } from 'node:crypto';
import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  AgentIdentity,
  IdentityVersion,
  IdentityUpdateInput,
  Guideline,
  GuidelineInput,
  GuidelineCategory,
} from './types.js';

// ─── Class ──────────────────────────────────────────────────────────

export class IdentityManager {
  private vault: Vault;
  private provider: PersistenceProvider;

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
    this.initializeTables();
  }

  // ─── Table Initialization ───────────────────────────────────────────

  private initializeTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS agent_identity (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        personality TEXT NOT NULL DEFAULT '[]',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS agent_identity_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        changed_by TEXT NOT NULL DEFAULT 'system',
        change_reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE(agent_id, version)
      );

      CREATE TABLE IF NOT EXISTS agent_guidelines (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('behavior', 'preference', 'restriction', 'style')),
        text TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_guidelines_agent
        ON agent_guidelines(agent_id);
      CREATE INDEX IF NOT EXISTS idx_identity_versions_agent
        ON agent_identity_versions(agent_id, version);
    `);
  }

  // ─── Identity CRUD ──────────────────────────────────────────────────

  getIdentity(agentId: string): AgentIdentity | null {
    const row = this.provider.get<IdentityRow>('SELECT * FROM agent_identity WHERE agent_id = ?', [
      agentId,
    ]);
    if (!row) return null;

    const guidelines = this.getGuidelines(agentId);
    return rowToIdentity(row, guidelines);
  }

  setIdentity(agentId: string, input: IdentityUpdateInput): AgentIdentity {
    this.provider.transaction(() => {
      const existing = this.provider.get<IdentityRow>(
        'SELECT * FROM agent_identity WHERE agent_id = ?',
        [agentId],
      );

      if (existing) {
        // Snapshot current state before updating
        const snapshot = JSON.stringify(rowToIdentitySnapshot(existing));
        this.provider.run(
          `INSERT INTO agent_identity_versions (agent_id, version, snapshot, changed_by, change_reason)
           VALUES (?, ?, ?, ?, ?)`,
          [
            agentId,
            existing.version,
            snapshot,
            input.changedBy ?? 'system',
            input.changeReason ?? '',
          ],
        );

        const newVersion = existing.version + 1;
        const name = input.name ?? existing.name;
        const role = input.role ?? existing.role;
        const description = input.description ?? existing.description;
        const personality = input.personality
          ? JSON.stringify(input.personality)
          : existing.personality;

        this.provider.run(
          `UPDATE agent_identity
           SET name = ?, role = ?, description = ?, personality = ?,
               version = ?, updated_at = unixepoch()
           WHERE agent_id = ?`,
          [name, role, description, personality, newVersion, agentId],
        );
      } else {
        // First identity creation — version 1
        const name = input.name ?? agentId;
        const role = input.role ?? '';
        const description = input.description ?? '';
        const personality = JSON.stringify(input.personality ?? []);

        this.provider.run(
          `INSERT INTO agent_identity (agent_id, name, role, description, personality, version)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [agentId, name, role, description, personality],
        );
      }
    });

    return this.getIdentity(agentId)!;
  }

  // ─── Guidelines ─────────────────────────────────────────────────────

  addGuideline(agentId: string, input: GuidelineInput): Guideline {
    const id = randomUUID();
    const priority = input.priority ?? 0;

    this.provider.run(
      `INSERT INTO agent_guidelines (id, agent_id, category, text, priority)
       VALUES (?, ?, ?, ?, ?)`,
      [id, agentId, input.category, input.text, priority],
    );

    const row = this.provider.get<GuidelineRow>('SELECT * FROM agent_guidelines WHERE id = ?', [
      id,
    ]);
    return rowToGuideline(row!);
  }

  removeGuideline(guidelineId: string): boolean {
    const result = this.provider.run('DELETE FROM agent_guidelines WHERE id = ?', [guidelineId]);
    return result.changes > 0;
  }

  getGuidelines(agentId: string, category?: GuidelineCategory): Guideline[] {
    if (category) {
      const rows = this.provider.all<GuidelineRow>(
        'SELECT * FROM agent_guidelines WHERE agent_id = ? AND category = ? ORDER BY priority DESC, created_at ASC',
        [agentId, category],
      );
      return rows.map(rowToGuideline);
    }
    const rows = this.provider.all<GuidelineRow>(
      'SELECT * FROM agent_guidelines WHERE agent_id = ? ORDER BY priority DESC, created_at ASC',
      [agentId],
    );
    return rows.map(rowToGuideline);
  }

  // ─── Versioning ─────────────────────────────────────────────────────

  getVersionHistory(agentId: string, limit = 20): IdentityVersion[] {
    const rows = this.provider.all<VersionRow>(
      'SELECT * FROM agent_identity_versions WHERE agent_id = ? ORDER BY version DESC LIMIT ?',
      [agentId, limit],
    );
    return rows.map(rowToVersion);
  }

  rollback(agentId: string, version: number): AgentIdentity {
    this.provider.transaction(() => {
      const versionRow = this.provider.get<VersionRow>(
        'SELECT * FROM agent_identity_versions WHERE agent_id = ? AND version = ?',
        [agentId, version],
      );

      if (!versionRow) {
        throw new Error(`Version ${version} not found for agent ${agentId}`);
      }

      const snapshot = JSON.parse(versionRow.snapshot) as IdentitySnapshot;
      const current = this.provider.get<IdentityRow>(
        'SELECT * FROM agent_identity WHERE agent_id = ?',
        [agentId],
      )!;

      // Snapshot current state before rollback
      const currentSnapshot = JSON.stringify(rowToIdentitySnapshot(current));
      this.provider.run(
        `INSERT INTO agent_identity_versions (agent_id, version, snapshot, changed_by, change_reason)
         VALUES (?, ?, ?, ?, ?)`,
        [agentId, current.version, currentSnapshot, 'system', `Before rollback to v${version}`],
      );

      const newVersion = current.version + 1;
      this.provider.run(
        `UPDATE agent_identity
         SET name = ?, role = ?, description = ?, personality = ?,
             version = ?, updated_at = unixepoch()
         WHERE agent_id = ?`,
        [
          snapshot.name,
          snapshot.role,
          snapshot.description,
          JSON.stringify(snapshot.personality),
          newVersion,
          agentId,
        ],
      );
    });

    return this.getIdentity(agentId)!;
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  renderIdentityMarkdown(agentId: string): string {
    const identity = this.getIdentity(agentId);
    if (!identity) return `# Unknown Agent\n\nNo identity found for ${agentId}.`;

    const lines: string[] = [
      `# ${identity.name}`,
      '',
      `**Role:** ${identity.role}`,
      '',
      identity.description,
      '',
    ];

    if (identity.personality.length > 0) {
      lines.push('## Personality', '');
      for (const trait of identity.personality) {
        lines.push(`- ${trait}`);
      }
      lines.push('');
    }

    const categories: GuidelineCategory[] = ['behavior', 'preference', 'restriction', 'style'];
    for (const cat of categories) {
      const guidelines = identity.guidelines.filter((g) => g.category === cat);
      if (guidelines.length > 0) {
        lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}s`, '');
        for (const g of guidelines) {
          lines.push(`- ${g.text}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

// ─── Internal Row Types ─────────────────────────────────────────────

interface IdentityRow {
  agent_id: string;
  name: string;
  role: string;
  description: string;
  personality: string;
  version: number;
  updated_at: string;
}

interface GuidelineRow {
  id: string;
  agent_id: string;
  category: GuidelineCategory;
  text: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: number;
  agent_id: string;
  version: number;
  snapshot: string;
  changed_by: string;
  change_reason: string;
  created_at: string;
}

interface IdentitySnapshot {
  name: string;
  role: string;
  description: string;
  personality: string[];
}

// ─── Row Converters ─────────────────────────────────────────────────

function rowToIdentity(row: IdentityRow, guidelines: Guideline[]): AgentIdentity {
  return {
    agentId: row.agent_id,
    name: row.name,
    role: row.role,
    description: row.description,
    personality: JSON.parse(row.personality) as string[],
    guidelines,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function rowToIdentitySnapshot(row: IdentityRow): IdentitySnapshot {
  return {
    name: row.name,
    role: row.role,
    description: row.description,
    personality: JSON.parse(row.personality) as string[],
  };
}

function rowToGuideline(row: GuidelineRow): Guideline {
  return {
    id: row.id,
    category: row.category,
    text: row.text,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToVersion(row: VersionRow): IdentityVersion {
  return {
    version: row.version,
    snapshot: row.snapshot,
    changedBy: row.changed_by,
    changeReason: row.change_reason,
    createdAt: row.created_at,
  };
}
