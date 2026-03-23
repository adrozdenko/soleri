import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectRegistry } from './project-registry.js';
import type { PersistenceProvider } from '../persistence/types.js';

// ─── In-memory mock of PersistenceProvider ────────────────────────

interface MockTable {
  rows: Record<string, unknown>[];
}

function createMockProvider(): PersistenceProvider {
  const _tables: Record<string, MockTable> = {};
  let autoIncrementId = 0;

  // Simple in-memory store that understands basic SQL patterns
  const store: Record<string, Record<string, unknown>[]> = {
    registered_projects: [],
    project_rules: [],
    project_links: [],
  };

  const provider: PersistenceProvider = {
    backend: 'sqlite' as const,

    execSql(_sql: string): void {
      // Tables are pre-initialized in store — no-op
    },

    run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
      const p = (params ?? []) as unknown[];

      if (sql.startsWith('INSERT OR IGNORE INTO project_links')) {
        // Check for duplicate
        const existing = store.project_links.find(
          (r) =>
            r.source_project_id === p[0] && r.target_project_id === p[1] && r.link_type === p[2],
        );
        if (existing) return { changes: 0, lastInsertRowid: existing.id as number };
        autoIncrementId++;
        const row = {
          id: autoIncrementId,
          source_project_id: p[0],
          target_project_id: p[1],
          link_type: p[2],
          created_at: p[3],
        };
        store.project_links.push(row);
        return { changes: 1, lastInsertRowid: autoIncrementId };
      }

      if (sql.startsWith('INSERT INTO registered_projects')) {
        store.registered_projects.push({
          id: p[0],
          path: p[1],
          name: p[2],
          registered_at: p[3],
          last_accessed_at: p[4],
          metadata: p[5],
        });
        return { changes: 1, lastInsertRowid: 0 };
      }

      if (sql.startsWith('INSERT INTO project_rules')) {
        store.project_rules.push({
          id: p[0],
          project_id: p[1],
          category: p[2],
          text: p[3],
          priority: p[4],
          created_at: p[5],
        });
        return { changes: 1, lastInsertRowid: 0 };
      }

      if (sql.startsWith('UPDATE registered_projects')) {
        const row = store.registered_projects.find((r) => r.id === p[3]);
        if (row) {
          row.last_accessed_at = p[0];
          row.name = p[1];
          row.metadata = p[2];
          return { changes: 1, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      }

      if (sql.startsWith('DELETE FROM project_rules WHERE project_id')) {
        const before = store.project_rules.length;
        store.project_rules = store.project_rules.filter((r) => r.project_id !== p[0]);
        return { changes: before - store.project_rules.length, lastInsertRowid: 0 };
      }

      if (sql.startsWith('DELETE FROM project_rules WHERE id')) {
        const before = store.project_rules.length;
        store.project_rules = store.project_rules.filter((r) => r.id !== p[0]);
        return { changes: before - store.project_rules.length, lastInsertRowid: 0 };
      }

      if (
        sql.startsWith(
          'DELETE FROM project_links WHERE source_project_id = ? AND target_project_id = ? AND link_type',
        )
      ) {
        const before = store.project_links.length;
        store.project_links = store.project_links.filter(
          (r) =>
            !(r.source_project_id === p[0] && r.target_project_id === p[1] && r.link_type === p[2]),
        );
        return { changes: before - store.project_links.length, lastInsertRowid: 0 };
      }

      if (
        sql.startsWith(
          'DELETE FROM project_links WHERE source_project_id = ? AND target_project_id = ?',
        )
      ) {
        const before = store.project_links.length;
        store.project_links = store.project_links.filter(
          (r) => !(r.source_project_id === p[0] && r.target_project_id === p[1]),
        );
        return { changes: before - store.project_links.length, lastInsertRowid: 0 };
      }

      if (
        sql.startsWith(
          'DELETE FROM project_links WHERE source_project_id = ? OR target_project_id = ?',
        )
      ) {
        const before = store.project_links.length;
        store.project_links = store.project_links.filter(
          (r) => r.source_project_id !== p[0] && r.target_project_id !== p[1],
        );
        return { changes: before - store.project_links.length, lastInsertRowid: 0 };
      }

      if (sql.startsWith('DELETE FROM registered_projects')) {
        const before = store.registered_projects.length;
        store.registered_projects = store.registered_projects.filter((r) => r.id !== p[0]);
        return { changes: before - store.registered_projects.length, lastInsertRowid: 0 };
      }

      return { changes: 0, lastInsertRowid: 0 };
    },

    get<T>(sql: string, params?: unknown[]): T | undefined {
      const p = (params ?? []) as unknown[];

      if (sql.includes('FROM registered_projects WHERE id')) {
        return store.registered_projects.find((r) => r.id === p[0]) as T | undefined;
      }
      if (sql.includes('FROM registered_projects WHERE path')) {
        return store.registered_projects.find((r) => r.path === p[0]) as T | undefined;
      }
      if (
        sql.includes(
          'FROM project_links WHERE source_project_id = ? AND target_project_id = ? AND link_type',
        )
      ) {
        return store.project_links.find(
          (r) =>
            r.source_project_id === p[0] && r.target_project_id === p[1] && r.link_type === p[2],
        ) as T | undefined;
      }

      return undefined;
    },

    all<T>(sql: string, params?: unknown[]): T[] {
      const p = (params ?? []) as unknown[];

      if (sql.includes('FROM registered_projects ORDER BY')) {
        return [...store.registered_projects].sort(
          (a, b) => (b.last_accessed_at as number) - (a.last_accessed_at as number),
        ) as T[];
      }
      if (sql.includes('FROM project_rules WHERE project_id')) {
        return store.project_rules
          .filter((r) => r.project_id === p[0])
          .sort((a, b) => {
            const pd = (b.priority as number) - (a.priority as number);
            return pd !== 0 ? pd : (a.created_at as number) - (b.created_at as number);
          }) as T[];
      }
      if (sql.includes('FROM project_links WHERE source_project_id = ? OR target_project_id = ?')) {
        return store.project_links
          .filter((r) => r.source_project_id === p[0] || r.target_project_id === p[1])
          .sort((a, b) => (b.created_at as number) - (a.created_at as number)) as T[];
      }

      return [] as T[];
    },

    transaction<T>(fn: () => T): T {
      return fn();
    },

    ftsSearch: (() => []) as unknown,
  };

  return provider;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('ProjectRegistry', () => {
  let registry: ProjectRegistry;
  let provider: PersistenceProvider;

  beforeEach(() => {
    provider = createMockProvider();
    registry = new ProjectRegistry(provider);
  });

  // ─── register ─────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new project and returns it', () => {
      const proj = registry.register('/tmp/myproj', 'My Project');
      expect(proj.path).toBe('/tmp/myproj');
      expect(proj.name).toBe('My Project');
      expect(proj.id).toBeTruthy();
      expect(proj.registeredAt).toBeLessThanOrEqual(Date.now());
    });

    it('generates deterministic id from path', () => {
      const p1 = registry.register('/tmp/my-project');
      const p2 = registry.register('/tmp/my-project');
      expect(p1.id).toBe(p2.id);
    });

    it('updates lastAccessedAt on re-register', () => {
      const p1 = registry.register('/tmp/proj');
      const p2 = registry.register('/tmp/proj');
      expect(p2.lastAccessedAt).toBeGreaterThanOrEqual(p1.lastAccessedAt);
    });

    it('updates name on re-register when provided', () => {
      registry.register('/tmp/proj', 'Old Name');
      const p2 = registry.register('/tmp/proj', 'New Name');
      expect(p2.name).toBe('New Name');
    });

    it('preserves existing name when not provided on re-register', () => {
      registry.register('/tmp/proj', 'Keep Me');
      const p2 = registry.register('/tmp/proj');
      expect(p2.name).toBe('Keep Me');
    });

    it('stores metadata as JSON', () => {
      const meta = { framework: 'next', version: 14 };
      const proj = registry.register('/tmp/proj', 'P', meta);
      expect(proj.metadata).toEqual(meta);
    });
  });

  // ─── get / getByPath ──────────────────────────────────────────

  describe('get and getByPath', () => {
    it('retrieves project by id', () => {
      const proj = registry.register('/tmp/proj');
      expect(registry.get(proj.id)).toEqual(proj);
    });

    it('returns null for unknown id', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });

    it('retrieves project by path', () => {
      registry.register('/tmp/proj', 'P');
      const found = registry.getByPath('/tmp/proj');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('P');
    });

    it('returns null for unknown path', () => {
      expect(registry.getByPath('/nope')).toBeNull();
    });
  });

  // ─── list ─────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all projects ordered by lastAccessedAt desc', () => {
      registry.register('/a');
      registry.register('/b');
      registry.register('/a'); // re-register bumps lastAccessedAt
      const list = registry.list();
      expect(list.length).toBe(2);
      expect(list[0].path).toBe('/a');
    });

    it('returns empty array when no projects', () => {
      expect(registry.list()).toEqual([]);
    });
  });

  // ─── unregister ───────────────────────────────────────────────

  describe('unregister', () => {
    it('removes project and returns true', () => {
      const proj = registry.register('/tmp/proj');
      expect(registry.unregister(proj.id)).toBe(true);
      expect(registry.get(proj.id)).toBeNull();
    });

    it('returns false for unknown project', () => {
      expect(registry.unregister('ghost')).toBe(false);
    });

    it('cascades delete to rules', () => {
      const proj = registry.register('/tmp/proj');
      registry.addRule(proj.id, { category: 'behavior', text: 'rule', priority: 1 });
      registry.unregister(proj.id);
      expect(registry.getRules(proj.id)).toEqual([]);
    });
  });

  // ─── rules ────────────────────────────────────────────────────

  describe('rules', () => {
    it('adds and retrieves a rule', () => {
      const proj = registry.register('/tmp/proj');
      const rule = registry.addRule(proj.id, {
        category: 'convention',
        text: 'Use conventional commits',
        priority: 10,
      });
      expect(rule.projectId).toBe(proj.id);
      expect(rule.category).toBe('convention');
      expect(rule.text).toBe('Use conventional commits');
      const rules = registry.getRules(proj.id);
      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe(rule.id);
    });

    it('removes a rule by id', () => {
      const proj = registry.register('/tmp/proj');
      const rule = registry.addRule(proj.id, {
        category: 'restriction',
        text: 'No raw colors',
        priority: 5,
      });
      expect(registry.removeRule(rule.id)).toBe(true);
      expect(registry.getRules(proj.id)).toEqual([]);
    });

    it('removeRule returns false for unknown id', () => {
      expect(registry.removeRule('nope')).toBe(false);
    });

    it('listRulesAll returns projects with their rules', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      registry.addRule(p1.id, { category: 'behavior', text: 'r1', priority: 1 });
      registry.addRule(p2.id, { category: 'preference', text: 'r2', priority: 2 });
      const all = registry.listRulesAll();
      expect(all.length).toBe(2);
      expect(all.every((e) => e.rules.length === 1)).toBe(true);
    });
  });

  // ─── links ────────────────────────────────────────────────────

  describe('links', () => {
    it('links two projects', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      const link = registry.link(p1.id, p2.id, 'related');
      expect(link.sourceProjectId).toBe(p1.id);
      expect(link.targetProjectId).toBe(p2.id);
      expect(link.linkType).toBe('related');
    });

    it('duplicate link returns existing instead of creating new', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      const link1 = registry.link(p1.id, p2.id, 'related');
      const link2 = registry.link(p1.id, p2.id, 'related');
      expect(link2.id).toBe(link1.id);
    });

    it('getLinks returns both incoming and outgoing', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      const p3 = registry.register('/c');
      registry.link(p1.id, p2.id, 'related');
      registry.link(p3.id, p1.id, 'parent');
      const links = registry.getLinks(p1.id);
      expect(links.length).toBe(2);
    });

    it('unlink with linkType removes specific link', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      registry.link(p1.id, p2.id, 'related');
      registry.link(p1.id, p2.id, 'parent');
      const removed = registry.unlink(p1.id, p2.id, 'related');
      expect(removed).toBe(1);
    });

    it('unlink without linkType removes all links between projects', () => {
      const p1 = registry.register('/a');
      const p2 = registry.register('/b');
      registry.link(p1.id, p2.id, 'related');
      registry.link(p1.id, p2.id, 'parent');
      const removed = registry.unlink(p1.id, p2.id);
      expect(removed).toBe(2);
    });

    it('getLinkedProjects returns project details with direction', () => {
      const p1 = registry.register('/a', 'A');
      const p2 = registry.register('/b', 'B');
      registry.link(p1.id, p2.id, 'child');
      const linked = registry.getLinkedProjects(p1.id);
      expect(linked.length).toBe(1);
      expect(linked[0].project.name).toBe('B');
      expect(linked[0].direction).toBe('outgoing');
      expect(linked[0].linkType).toBe('child');
    });

    it('getLinkedProjects shows incoming links', () => {
      const p1 = registry.register('/a', 'A');
      const p2 = registry.register('/b', 'B');
      registry.link(p1.id, p2.id, 'parent');
      const linked = registry.getLinkedProjects(p2.id);
      expect(linked.length).toBe(1);
      expect(linked[0].direction).toBe('incoming');
    });
  });

  // ─── touch ────────────────────────────────────────────────────

  describe('touch', () => {
    it('updates lastAccessedAt without error', () => {
      const proj = registry.register('/tmp/proj');
      // Should not throw
      registry.touch(proj.id);
    });
  });
});
