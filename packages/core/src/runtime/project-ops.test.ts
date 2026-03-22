/**
 * Unit tests for project-ops — 12 ops for project registry management.
 */

import { describe, it, expect } from 'vitest';
import { captureOps, executeOp } from '../engine/test-helpers.js';
import { createProjectOps } from './project-ops.js';
import type { AgentRuntime } from './types.js';

/** Minimal in-memory project registry stub. */
function makeProjectRegistryStub() {
  const projects = new Map<string, { id: string; name: string; lastAccessed: number }>();
  const rules = new Map<string, Array<{ id: string; category: string; text: string; priority: number }>>();
  const links: Array<{ sourceId: string; targetId: string; linkType: string }> = [];
  let ruleCounter = 0;

  return {
    get: (id: string) => projects.get(id) ?? null,
    list: () => [...projects.values()].sort((a, b) => b.lastAccessed - a.lastAccessed),
    unregister: (id: string) => {
      const had = projects.has(id);
      projects.delete(id);
      rules.delete(id);
      return had;
    },
    getRules: (projectId: string) => rules.get(projectId) ?? [],
    listRulesAll: () =>
      [...projects.values()].map((p) => ({
        project: p,
        rules: rules.get(p.id) ?? [],
      })),
    addRule: (projectId: string, rule: { category: string; text: string; priority: number }) => {
      const id = `rule-${++ruleCounter}`;
      const entry = { id, ...rule };
      if (!rules.has(projectId)) rules.set(projectId, []);
      rules.get(projectId)!.push(entry);
      return entry;
    },
    removeRule: (ruleId: string) => {
      for (const [, arr] of rules) {
        const idx = arr.findIndex((r) => r.id === ruleId);
        if (idx >= 0) { arr.splice(idx, 1); return true; }
      }
      return false;
    },
    link: (sourceId: string, targetId: string, linkType: string) => {
      const entry = { sourceId, targetId, linkType };
      links.push(entry);
      return entry;
    },
    unlink: (sourceId: string, targetId: string, linkType?: string) => {
      let count = 0;
      for (let i = links.length - 1; i >= 0; i--) {
        const l = links[i];
        if (l.sourceId === sourceId && l.targetId === targetId && (!linkType || l.linkType === linkType)) {
          links.splice(i, 1);
          count++;
        }
      }
      return count;
    },
    getLinks: (projectId: string) => links.filter((l) => l.sourceId === projectId || l.targetId === projectId),
    getLinkedProjects: (projectId: string) => {
      return links
        .filter((l) => l.sourceId === projectId || l.targetId === projectId)
        .map((l) => ({
          project: projects.get(l.sourceId === projectId ? l.targetId : l.sourceId),
          linkType: l.linkType,
          direction: l.sourceId === projectId ? 'outgoing' : 'incoming',
        }));
    },
    touch: (projectId: string) => {
      const p = projects.get(projectId);
      if (p) p.lastAccessed = Date.now();
    },
    // Test helper to seed data
    _seed: (id: string, name: string) => {
      projects.set(id, { id, name, lastAccessed: Date.now() });
    },
  };
}

describe('project-ops', () => {
  function setup() {
    const registry = makeProjectRegistryStub();
    const ops = captureOps(
      createProjectOps({ projectRegistry: registry } as unknown as AgentRuntime),
    );
    return { registry, ops };
  }

  describe('project_get', () => {
    it('returns found:false for missing project', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'project_get', { projectId: 'nope' });
      expect(res.success).toBe(true);
      expect((res.data as { found: boolean }).found).toBe(false);
    });

    it('returns project data when found', async () => {
      const { ops, registry } = setup();
      registry._seed('proj-1', 'My Project');
      const res = await executeOp(ops, 'project_get', { projectId: 'proj-1' });
      expect(res.success).toBe(true);
      const data = res.data as { found: boolean; project: { id: string; name: string } };
      expect(data.found).toBe(true);
      expect(data.project.name).toBe('My Project');
    });
  });

  describe('project_list', () => {
    it('returns empty list for no projects', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'project_list');
      expect(res.success).toBe(true);
      expect((res.data as { count: number }).count).toBe(0);
    });

    it('lists seeded projects', async () => {
      const { ops, registry } = setup();
      registry._seed('a', 'Alpha');
      registry._seed('b', 'Beta');
      const res = await executeOp(ops, 'project_list');
      expect((res.data as { count: number }).count).toBe(2);
    });
  });

  describe('project_unregister', () => {
    it('returns removed:true when project exists', async () => {
      const { ops, registry } = setup();
      registry._seed('x', 'X');
      const res = await executeOp(ops, 'project_unregister', { projectId: 'x' });
      expect((res.data as { removed: boolean }).removed).toBe(true);
    });

    it('returns removed:false when project missing', async () => {
      const { ops } = setup();
      const res = await executeOp(ops, 'project_unregister', { projectId: 'nope' });
      expect((res.data as { removed: boolean }).removed).toBe(false);
    });
  });

  describe('project rules', () => {
    it('adds and retrieves rules', async () => {
      const { ops, registry } = setup();
      registry._seed('p1', 'P1');

      await executeOp(ops, 'project_add_rule', {
        projectId: 'p1',
        category: 'behavior',
        text: 'Always use semantic tokens',
        priority: 5,
      });

      const res = await executeOp(ops, 'project_get_rules', { projectId: 'p1' });
      const data = res.data as { count: number; rules: Array<{ text: string }> };
      expect(data.count).toBe(1);
      expect(data.rules[0].text).toBe('Always use semantic tokens');
    });

    it('removes a rule by id', async () => {
      const { ops, registry } = setup();
      registry._seed('p1', 'P1');

      const addRes = await executeOp(ops, 'project_add_rule', {
        projectId: 'p1',
        category: 'convention',
        text: 'Use conventional commits',
        priority: 0,
      });
      const ruleId = (addRes.data as { rule: { id: string } }).rule.id;

      const removeRes = await executeOp(ops, 'project_remove_rule', { ruleId });
      expect((removeRes.data as { removed: boolean }).removed).toBe(true);

      const listRes = await executeOp(ops, 'project_get_rules', { projectId: 'p1' });
      expect((listRes.data as { count: number }).count).toBe(0);
    });

    it('list_rules returns all projects with rules', async () => {
      const { ops, registry } = setup();
      registry._seed('a', 'A');
      registry._seed('b', 'B');
      await executeOp(ops, 'project_add_rule', { projectId: 'a', category: 'behavior', text: 'r1', priority: 0 });

      const res = await executeOp(ops, 'project_list_rules');
      const data = res.data as { count: number; projects: Array<{ ruleCount: number }> };
      expect(data.count).toBe(2);
    });
  });

  describe('project links', () => {
    it('creates and retrieves links', async () => {
      const { ops, registry } = setup();
      registry._seed('a', 'A');
      registry._seed('b', 'B');

      await executeOp(ops, 'project_link', { sourceId: 'a', targetId: 'b', linkType: 'related' });

      const res = await executeOp(ops, 'project_get_links', { projectId: 'a' });
      expect((res.data as { count: number }).count).toBe(1);
    });

    it('unlinks projects', async () => {
      const { ops, registry } = setup();
      registry._seed('a', 'A');
      registry._seed('b', 'B');
      await executeOp(ops, 'project_link', { sourceId: 'a', targetId: 'b', linkType: 'parent' });

      const res = await executeOp(ops, 'project_unlink', { sourceId: 'a', targetId: 'b', linkType: 'parent' });
      expect((res.data as { removed: number }).removed).toBe(1);
    });

    it('gets linked projects with direction', async () => {
      const { ops, registry } = setup();
      registry._seed('a', 'A');
      registry._seed('b', 'B');
      await executeOp(ops, 'project_link', { sourceId: 'a', targetId: 'b', linkType: 'child' });

      const res = await executeOp(ops, 'project_linked_projects', { projectId: 'a' });
      const data = res.data as { count: number; linked: Array<{ direction: string }> };
      expect(data.count).toBe(1);
      expect(data.linked[0].direction).toBe('outgoing');
    });
  });

  describe('project_touch', () => {
    it('updates last accessed', async () => {
      const { ops, registry } = setup();
      registry._seed('t', 'T');
      const res = await executeOp(ops, 'project_touch', { projectId: 't' });
      expect((res.data as { touched: boolean }).touched).toBe(true);
    });
  });
});
