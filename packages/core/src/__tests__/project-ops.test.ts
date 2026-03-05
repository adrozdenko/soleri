import { describe, it, expect, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createProjectOps } from '../runtime/project-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { OpDefinition } from '../facades/types.js';

describe('createProjectOps', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  afterEach(() => {
    runtime?.close();
  });

  function setup() {
    runtime = createAgentRuntime({
      agentId: 'test-project',
      vaultPath: ':memory:',
    });
    ops = createProjectOps(runtime);
  }

  it('should return 12 ops', () => {
    setup();
    expect(ops).toHaveLength(12);
    const names = ops.map((o) => o.name);
    expect(names).toEqual([
      'project_get',
      'project_list',
      'project_unregister',
      'project_get_rules',
      'project_list_rules',
      'project_add_rule',
      'project_remove_rule',
      'project_link',
      'project_unlink',
      'project_get_links',
      'project_linked_projects',
      'project_touch',
    ]);
  });

  // ─── Register + Get round-trip ─────────────────────────────────

  describe('register + project_get round-trip', () => {
    it('should register a project and retrieve it by ID', async () => {
      setup();
      const registered = runtime.projectRegistry.register('/tmp/my-project', 'My Project');
      const result = (await findOp('project_get').handler({
        projectId: registered.id,
      })) as { found: boolean; project: { id: string; path: string; name: string } };

      expect(result.found).toBe(true);
      expect(result.project.path).toBe('/tmp/my-project');
      expect(result.project.name).toBe('My Project');
    });

    it('should return found=false for unknown ID', async () => {
      setup();
      const result = (await findOp('project_get').handler({
        projectId: 'nonexistent',
      })) as { found: boolean; project: null };

      expect(result.found).toBe(false);
      expect(result.project).toBeNull();
    });
  });

  // ─── project_list ──────────────────────────────────────────────

  describe('project_list', () => {
    it('should list all registered projects', async () => {
      setup();
      runtime.projectRegistry.register('/tmp/alpha', 'Alpha');
      runtime.projectRegistry.register('/tmp/beta', 'Beta');

      const result = (await findOp('project_list').handler({})) as {
        count: number;
        projects: Array<{ path: string; name: string }>;
      };

      expect(result.count).toBe(2);
      const paths = result.projects.map((p) => p.path);
      expect(paths).toContain('/tmp/alpha');
      expect(paths).toContain('/tmp/beta');
    });

    it('should return empty list when no projects registered', async () => {
      setup();
      const result = (await findOp('project_list').handler({})) as {
        count: number;
        projects: unknown[];
      };
      expect(result.count).toBe(0);
      expect(result.projects).toEqual([]);
    });
  });

  // ─── project_unregister ────────────────────────────────────────

  describe('project_unregister', () => {
    it('should unregister a project', async () => {
      setup();
      const registered = runtime.projectRegistry.register('/tmp/to-remove');

      const result = (await findOp('project_unregister').handler({
        projectId: registered.id,
      })) as { removed: boolean };

      expect(result.removed).toBe(true);

      // Verify it is gone
      const getResult = (await findOp('project_get').handler({
        projectId: registered.id,
      })) as { found: boolean };
      expect(getResult.found).toBe(false);
    });

    it('should return removed=false for unknown project', async () => {
      setup();
      const result = (await findOp('project_unregister').handler({
        projectId: 'nonexistent',
      })) as { removed: boolean };
      expect(result.removed).toBe(false);
    });
  });

  // ─── Rules CRUD ────────────────────────────────────────────────

  describe('project_add_rule + project_get_rules', () => {
    it('should add and retrieve rules for a project', async () => {
      setup();
      const project = runtime.projectRegistry.register('/tmp/rules-project');

      const addResult = (await findOp('project_add_rule').handler({
        projectId: project.id,
        category: 'behavior',
        text: 'Always use semantic tokens',
        priority: 10,
      })) as { added: boolean; rule: { id: string; category: string; text: string; priority: number } };

      expect(addResult.added).toBe(true);
      expect(addResult.rule.category).toBe('behavior');
      expect(addResult.rule.text).toBe('Always use semantic tokens');
      expect(addResult.rule.priority).toBe(10);

      const rulesResult = (await findOp('project_get_rules').handler({
        projectId: project.id,
      })) as { count: number; rules: Array<{ text: string }> };

      expect(rulesResult.count).toBe(1);
      expect(rulesResult.rules[0].text).toBe('Always use semantic tokens');
    });
  });

  describe('project_remove_rule', () => {
    it('should remove a rule', async () => {
      setup();
      const project = runtime.projectRegistry.register('/tmp/rm-rule');
      const rule = runtime.projectRegistry.addRule(project.id, {
        category: 'restriction',
        text: 'No inline styles',
        priority: 5,
      });

      const result = (await findOp('project_remove_rule').handler({
        ruleId: rule.id,
      })) as { removed: boolean };

      expect(result.removed).toBe(true);

      // Verify rule is gone
      const rulesResult = (await findOp('project_get_rules').handler({
        projectId: project.id,
      })) as { count: number };
      expect(rulesResult.count).toBe(0);
    });

    it('should return removed=false for unknown rule', async () => {
      setup();
      const result = (await findOp('project_remove_rule').handler({
        ruleId: 'nonexistent-rule',
      })) as { removed: boolean };
      expect(result.removed).toBe(false);
    });
  });

  describe('project_list_rules', () => {
    it('should list all projects with their rules', async () => {
      setup();
      const p1 = runtime.projectRegistry.register('/tmp/p1', 'P1');
      const p2 = runtime.projectRegistry.register('/tmp/p2', 'P2');
      runtime.projectRegistry.addRule(p1.id, { category: 'behavior', text: 'Rule A', priority: 0 });
      runtime.projectRegistry.addRule(p1.id, { category: 'convention', text: 'Rule B', priority: 1 });
      runtime.projectRegistry.addRule(p2.id, { category: 'preference', text: 'Rule C', priority: 0 });

      const result = (await findOp('project_list_rules').handler({})) as {
        count: number;
        projects: Array<{ project: { id: string }; ruleCount: number; rules: unknown[] }>;
      };

      expect(result.count).toBe(2);
      const p1Entry = result.projects.find((p) => p.project.id === p1.id);
      expect(p1Entry?.ruleCount).toBe(2);
      const p2Entry = result.projects.find((p) => p.project.id === p2.id);
      expect(p2Entry?.ruleCount).toBe(1);
    });
  });

  // ─── Links ─────────────────────────────────────────────────────

  describe('project_link + project_unlink', () => {
    it('should link and unlink two projects', async () => {
      setup();
      const p1 = runtime.projectRegistry.register('/tmp/link-a', 'Link A');
      const p2 = runtime.projectRegistry.register('/tmp/link-b', 'Link B');

      const linkResult = (await findOp('project_link').handler({
        sourceId: p1.id,
        targetId: p2.id,
        linkType: 'related',
      })) as { linked: boolean; link: { sourceProjectId: string; targetProjectId: string; linkType: string } };

      expect(linkResult.linked).toBe(true);
      expect(linkResult.link.sourceProjectId).toBe(p1.id);
      expect(linkResult.link.targetProjectId).toBe(p2.id);
      expect(linkResult.link.linkType).toBe('related');

      const unlinkResult = (await findOp('project_unlink').handler({
        sourceId: p1.id,
        targetId: p2.id,
        linkType: 'related',
      })) as { removed: number };

      expect(unlinkResult.removed).toBe(1);
    });

    it('should unlink all types when linkType is omitted', async () => {
      setup();
      const p1 = runtime.projectRegistry.register('/tmp/unlink-a');
      const p2 = runtime.projectRegistry.register('/tmp/unlink-b');

      runtime.projectRegistry.link(p1.id, p2.id, 'related');
      runtime.projectRegistry.link(p1.id, p2.id, 'parent');

      const result = (await findOp('project_unlink').handler({
        sourceId: p1.id,
        targetId: p2.id,
      })) as { removed: number };

      expect(result.removed).toBe(2);
    });
  });

  describe('project_get_links', () => {
    it('should get all links for a project', async () => {
      setup();
      const p1 = runtime.projectRegistry.register('/tmp/gl-a');
      const p2 = runtime.projectRegistry.register('/tmp/gl-b');
      const p3 = runtime.projectRegistry.register('/tmp/gl-c');

      runtime.projectRegistry.link(p1.id, p2.id, 'related');
      runtime.projectRegistry.link(p3.id, p1.id, 'parent');

      const result = (await findOp('project_get_links').handler({
        projectId: p1.id,
      })) as { count: number; links: Array<{ sourceProjectId: string; targetProjectId: string }> };

      expect(result.count).toBe(2);
    });
  });

  describe('project_linked_projects', () => {
    it('should return linked projects with direction info', async () => {
      setup();
      const p1 = runtime.projectRegistry.register('/tmp/lp-a', 'LP-A');
      const p2 = runtime.projectRegistry.register('/tmp/lp-b', 'LP-B');
      const p3 = runtime.projectRegistry.register('/tmp/lp-c', 'LP-C');

      runtime.projectRegistry.link(p1.id, p2.id, 'related');
      runtime.projectRegistry.link(p3.id, p1.id, 'fork');

      const result = (await findOp('project_linked_projects').handler({
        projectId: p1.id,
      })) as {
        count: number;
        linked: Array<{
          project: { id: string; name: string };
          linkType: string;
          direction: 'outgoing' | 'incoming';
        }>;
      };

      expect(result.count).toBe(2);

      const outgoing = result.linked.find((l) => l.direction === 'outgoing');
      expect(outgoing?.project.name).toBe('LP-B');
      expect(outgoing?.linkType).toBe('related');

      const incoming = result.linked.find((l) => l.direction === 'incoming');
      expect(incoming?.project.name).toBe('LP-C');
      expect(incoming?.linkType).toBe('fork');
    });
  });

  // ─── project_touch ─────────────────────────────────────────────

  describe('project_touch', () => {
    it('should update last accessed timestamp', async () => {
      setup();
      const project = runtime.projectRegistry.register('/tmp/touch-project');
      const originalTs = project.lastAccessedAt;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      const result = (await findOp('project_touch').handler({
        projectId: project.id,
      })) as { touched: boolean };

      expect(result.touched).toBe(true);

      const updated = runtime.projectRegistry.get(project.id);
      expect(updated!.lastAccessedAt).toBeGreaterThan(originalTs);
    });
  });

  // ─── Auth levels ───────────────────────────────────────────────

  describe('auth levels', () => {
    it('should use read auth for read ops', () => {
      setup();
      const readOps = [
        'project_get',
        'project_list',
        'project_get_rules',
        'project_list_rules',
        'project_get_links',
        'project_linked_projects',
      ];
      for (const name of readOps) {
        expect(findOp(name).auth).toBe('read');
      }
    });

    it('should use write auth for mutation ops', () => {
      setup();
      const writeOps = [
        'project_unregister',
        'project_add_rule',
        'project_remove_rule',
        'project_link',
        'project_unlink',
        'project_touch',
      ];
      for (const name of writeOps) {
        expect(findOp(name).auth).toBe('write');
      }
    });
  });
});
