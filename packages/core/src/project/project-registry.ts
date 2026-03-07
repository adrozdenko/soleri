/**
 * Project Registry — SQLite-backed registry for tracking projects,
 * rules, and cross-project links.
 *
 * Uses the Vault's underlying database via PersistenceProvider.
 * Tables are created lazily on first access.
 */

import type { PersistenceProvider } from '../persistence/types.js';
import type { RegisteredProject, ProjectRule, ProjectLink, LinkType } from './types.js';

/** Row shape for the projects table. */
interface ProjectRow {
  id: string;
  path: string;
  name: string | null;
  registered_at: number;
  last_accessed_at: number;
  metadata: string;
}

/** Row shape for the project_rules table. */
interface RuleRow {
  id: string;
  project_id: string;
  category: string;
  text: string;
  priority: number;
  created_at: number;
}

/** Row shape for the project_links table. */
interface LinkRow {
  id: number;
  source_project_id: string;
  target_project_id: string;
  link_type: string;
  created_at: number;
}

/**
 * Generate a deterministic project ID from a filesystem path.
 */
function pathToId(path: string): string {
  return path
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function rowToProject(row: ProjectRow): RegisteredProject {
  return {
    id: row.id,
    path: row.path,
    name: row.name ?? undefined,
    registeredAt: row.registered_at,
    lastAccessedAt: row.last_accessed_at,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

function rowToRule(row: RuleRow): ProjectRule {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category as ProjectRule['category'],
    text: row.text,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

function rowToLink(row: LinkRow): ProjectLink {
  return {
    id: row.id,
    sourceProjectId: row.source_project_id,
    targetProjectId: row.target_project_id,
    linkType: row.link_type as LinkType,
    createdAt: row.created_at,
  };
}

export class ProjectRegistry {
  private provider: PersistenceProvider;

  constructor(provider: PersistenceProvider) {
    this.provider = provider;
    this.initTables();
  }

  private initTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS registered_projects (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        name TEXT,
        registered_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS project_rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES registered_projects(id)
      );

      CREATE TABLE IF NOT EXISTS project_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_project_id TEXT NOT NULL,
        target_project_id TEXT NOT NULL,
        link_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(source_project_id, target_project_id, link_type)
      );
    `);
  }

  /**
   * Register (upsert) a project. Updates lastAccessedAt on re-register.
   */
  register(path: string, name?: string, metadata?: Record<string, unknown>): RegisteredProject {
    const id = pathToId(path);
    const now = Date.now();

    const existing = this.provider.get<ProjectRow>(
      'SELECT * FROM registered_projects WHERE id = ?',
      [id],
    );

    if (existing) {
      // Update lastAccessedAt, and optionally name/metadata if provided
      const newName = name ?? existing.name;
      const newMetadata = metadata ? JSON.stringify(metadata) : existing.metadata;
      this.provider.run(
        'UPDATE registered_projects SET last_accessed_at = ?, name = ?, metadata = ? WHERE id = ?',
        [now, newName, newMetadata, id],
      );
      return rowToProject({
        ...existing,
        last_accessed_at: now,
        name: newName,
        metadata: newMetadata,
      });
    }

    const row: ProjectRow = {
      id,
      path,
      name: name ?? null,
      registered_at: now,
      last_accessed_at: now,
      metadata: JSON.stringify(metadata ?? {}),
    };
    this.provider.run(
      'INSERT INTO registered_projects (id, path, name, registered_at, last_accessed_at, metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [row.id, row.path, row.name, row.registered_at, row.last_accessed_at, row.metadata],
    );

    return rowToProject(row);
  }

  /**
   * Get a project by ID.
   */
  get(projectId: string): RegisteredProject | null {
    const row = this.provider.get<ProjectRow>('SELECT * FROM registered_projects WHERE id = ?', [
      projectId,
    ]);
    return row ? rowToProject(row) : null;
  }

  /**
   * Get a project by its filesystem path.
   */
  getByPath(path: string): RegisteredProject | null {
    const row = this.provider.get<ProjectRow>('SELECT * FROM registered_projects WHERE path = ?', [
      path,
    ]);
    return row ? rowToProject(row) : null;
  }

  /**
   * List all registered projects.
   */
  list(): RegisteredProject[] {
    const rows = this.provider.all<ProjectRow>(
      'SELECT * FROM registered_projects ORDER BY last_accessed_at DESC',
    );
    return rows.map(rowToProject);
  }

  /**
   * Unregister a project by ID. Also removes associated rules and links.
   */
  unregister(projectId: string): boolean {
    return this.provider.transaction(() => {
      this.provider.run('DELETE FROM project_rules WHERE project_id = ?', [projectId]);
      this.provider.run(
        'DELETE FROM project_links WHERE source_project_id = ? OR target_project_id = ?',
        [projectId, projectId],
      );
      return (
        this.provider.run('DELETE FROM registered_projects WHERE id = ?', [projectId]).changes > 0
      );
    });
  }

  /**
   * Update the lastAccessedAt timestamp for a project.
   */
  touch(projectId: string): void {
    this.provider.run('UPDATE registered_projects SET last_accessed_at = ? WHERE id = ?', [
      Date.now(),
      projectId,
    ]);
  }

  // ─── Rules ──────────────────────────────────────────────────────────

  /**
   * Add a rule to a project.
   */
  addRule(
    projectId: string,
    rule: Omit<ProjectRule, 'id' | 'projectId' | 'createdAt'>,
  ): ProjectRule {
    const id = `rule-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    this.provider.run(
      'INSERT INTO project_rules (id, project_id, category, text, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, projectId, rule.category, rule.text, rule.priority, now],
    );

    return {
      id,
      projectId,
      category: rule.category,
      text: rule.text,
      priority: rule.priority,
      createdAt: now,
    };
  }

  /**
   * Get all rules for a project.
   */
  getRules(projectId: string): ProjectRule[] {
    const rows = this.provider.all<RuleRow>(
      'SELECT * FROM project_rules WHERE project_id = ? ORDER BY priority DESC, created_at ASC',
      [projectId],
    );
    return rows.map(rowToRule);
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(ruleId: string): boolean {
    return this.provider.run('DELETE FROM project_rules WHERE id = ?', [ruleId]).changes > 0;
  }

  /**
   * List all projects with their rules.
   */
  listRulesAll(): Array<{ project: RegisteredProject; rules: ProjectRule[] }> {
    const projects = this.list();
    return projects.map((project) => ({
      project,
      rules: this.getRules(project.id),
    }));
  }

  // ─── Links ──────────────────────────────────────────────────────────

  /**
   * Link two projects.
   */
  link(sourceId: string, targetId: string, linkType: LinkType): ProjectLink {
    const now = Date.now();
    const info = this.provider.run(
      'INSERT OR IGNORE INTO project_links (source_project_id, target_project_id, link_type, created_at) VALUES (?, ?, ?, ?)',
      [sourceId, targetId, linkType, now],
    );

    // If insert was ignored (duplicate), fetch existing
    if (info.changes === 0) {
      const existing = this.provider.get<LinkRow>(
        'SELECT * FROM project_links WHERE source_project_id = ? AND target_project_id = ? AND link_type = ?',
        [sourceId, targetId, linkType],
      );
      return rowToLink(existing!);
    }

    return {
      id: Number(info.lastInsertRowid),
      sourceProjectId: sourceId,
      targetProjectId: targetId,
      linkType,
      createdAt: now,
    };
  }

  /**
   * Unlink two projects. If linkType is omitted, removes all links between them.
   * Returns count of links removed.
   */
  unlink(sourceId: string, targetId: string, linkType?: LinkType): number {
    if (linkType) {
      return this.provider.run(
        'DELETE FROM project_links WHERE source_project_id = ? AND target_project_id = ? AND link_type = ?',
        [sourceId, targetId, linkType],
      ).changes;
    }
    return this.provider.run(
      'DELETE FROM project_links WHERE source_project_id = ? AND target_project_id = ?',
      [sourceId, targetId],
    ).changes;
  }

  /**
   * Get all links for a project (both outgoing and incoming).
   */
  getLinks(projectId: string): ProjectLink[] {
    const rows = this.provider.all<LinkRow>(
      'SELECT * FROM project_links WHERE source_project_id = ? OR target_project_id = ? ORDER BY created_at DESC',
      [projectId, projectId],
    );
    return rows.map(rowToLink);
  }

  /**
   * Get linked projects with details — returns project info, link type, and direction.
   */
  getLinkedProjects(
    projectId: string,
  ): Array<{ project: RegisteredProject; linkType: LinkType; direction: 'outgoing' | 'incoming' }> {
    const links = this.getLinks(projectId);
    const results: Array<{
      project: RegisteredProject;
      linkType: LinkType;
      direction: 'outgoing' | 'incoming';
    }> = [];

    for (const link of links) {
      const isOutgoing = link.sourceProjectId === projectId;
      const otherProjectId = isOutgoing ? link.targetProjectId : link.sourceProjectId;
      const project = this.get(otherProjectId);
      if (project) {
        results.push({
          project,
          linkType: link.linkType,
          direction: isOutgoing ? 'outgoing' : 'incoming',
        });
      }
    }

    return results;
  }
}
