import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacade,
  createDomainFacades,
  loadDomainPacksFromConfig,
} from '@soleri/core';
import type { AgentRuntime, IntelligenceEntry, OpDefinition, FacadeConfig } from '@soleri/core';
import { z } from 'zod';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PERSONA } from '../identity/persona.js';
import { activateAgent, deactivateAgent } from '../activation/activate.js';
import {
  injectClaudeMd,
  injectClaudeMdGlobal,
  hasAgentMarker,
  injectAgentsMd,
  injectAgentsMdGlobal,
  hasAgentMarkerInAgentsMd,
} from '../activation/inject-claude-md.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: overrides.id ?? 'test-1',
    type: overrides.type ?? 'pattern',
    domain: overrides.domain ?? 'testing',
    title: overrides.title ?? 'Test Pattern',
    severity: overrides.severity ?? 'warning',
    description: overrides.description ?? 'A test pattern.',
    tags: overrides.tags ?? ['testing'],
  };
}

describe('Facades', () => {
  let runtime: AgentRuntime;
  let plannerDir: string;

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'forge-planner-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'salvador',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  describe('salvador_design', () => {
    function buildDomainFacade(): FacadeConfig {
      return createDomainFacade(runtime, 'salvador', 'design');
    }

    it('should create facade with expected ops', () => {
      const facade = buildDomainFacade();
      expect(facade.name).toBe('salvador_design');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for design', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'design-gp1', domain: 'design', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === 'design')).toBe(true);
    });

    it('search should scope to design with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({
          id: 'design-s1',
          domain: 'design',
          title: 'Domain specific pattern',
          tags: ['find-me'],
        }),
        makeEntry({
          id: 'other-s1',
          domain: 'other',
          title: 'Other domain pattern',
          tags: ['nope'],
        }),
      ]);
      runtime.brain.rebuildVocabulary();
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{
        entry: IntelligenceEntry;
        score: number;
      }>;
      expect(results.every((r) => r.entry.domain === 'design')).toBe(true);
    });

    it('capture should add entry with design domain', async () => {
      const facade = buildDomainFacade();
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: 'design-cap1',
        type: 'pattern',
        title: 'Captured Pattern',
        severity: 'warning',
        description: 'A captured pattern.',
        tags: ['captured'],
      })) as { captured: boolean; governance?: { action: string } };
      expect(result.captured).toBe(true);
      const entry = runtime.vault.get('design-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('design');
    });

    it('get_entry should return specific entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'design-ge1', domain: 'design', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: 'design-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('design-ge1');
    });

    it('remove should delete entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'design-rm1', domain: 'design', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: 'design-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(runtime.vault.get('design-rm1')).toBeNull();
    });
  });

  describe('salvador_component', () => {
    function buildDomainFacade(): FacadeConfig {
      return createDomainFacade(runtime, 'salvador', 'component');
    }

    it('should create facade with expected ops', () => {
      const facade = buildDomainFacade();
      expect(facade.name).toBe('salvador_component');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for component', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'component-gp1', domain: 'component', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === 'component')).toBe(true);
    });

    it('search should scope to component with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({
          id: 'component-s1',
          domain: 'component',
          title: 'Domain specific pattern',
          tags: ['find-me'],
        }),
        makeEntry({
          id: 'other-s1',
          domain: 'other',
          title: 'Other domain pattern',
          tags: ['nope'],
        }),
      ]);
      runtime.brain.rebuildVocabulary();
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{
        entry: IntelligenceEntry;
        score: number;
      }>;
      expect(results.every((r) => r.entry.domain === 'component')).toBe(true);
    });

    it('capture should add entry with component domain', async () => {
      const facade = buildDomainFacade();
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: 'component-cap1',
        type: 'pattern',
        title: 'Captured Pattern',
        severity: 'warning',
        description: 'A captured pattern.',
        tags: ['captured'],
      })) as { captured: boolean; governance?: { action: string } };
      expect(result.captured).toBe(true);
      const entry = runtime.vault.get('component-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('component');
    });

    it('get_entry should return specific entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'component-ge1', domain: 'component', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: 'component-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('component-ge1');
    });

    it('remove should delete entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'component-rm1', domain: 'component', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: 'component-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(runtime.vault.get('component-rm1')).toBeNull();
    });
  });

  describe('salvador_figma', () => {
    function buildDomainFacade(): FacadeConfig {
      return createDomainFacade(runtime, 'salvador', 'figma');
    }

    it('should create facade with expected ops', () => {
      const facade = buildDomainFacade();
      expect(facade.name).toBe('salvador_figma');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for figma', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'figma-gp1', domain: 'figma', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === 'figma')).toBe(true);
    });

    it('search should scope to figma with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({
          id: 'figma-s1',
          domain: 'figma',
          title: 'Domain specific pattern',
          tags: ['find-me'],
        }),
        makeEntry({
          id: 'other-s1',
          domain: 'other',
          title: 'Other domain pattern',
          tags: ['nope'],
        }),
      ]);
      runtime.brain.rebuildVocabulary();
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{
        entry: IntelligenceEntry;
        score: number;
      }>;
      expect(results.every((r) => r.entry.domain === 'figma')).toBe(true);
    });

    it('capture should add entry with figma domain', async () => {
      const facade = buildDomainFacade();
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: 'figma-cap1',
        type: 'pattern',
        title: 'Captured Pattern',
        severity: 'warning',
        description: 'A captured pattern.',
        tags: ['captured'],
      })) as { captured: boolean; governance?: { action: string } };
      expect(result.captured).toBe(true);
      const entry = runtime.vault.get('figma-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('figma');
    });

    it('get_entry should return specific entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'figma-ge1', domain: 'figma', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: 'figma-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('figma-ge1');
    });

    it('remove should delete entry', async () => {
      runtime.vault.seed([makeEntry({ id: 'figma-rm1', domain: 'figma', tags: ['test'] })]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: 'figma-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(runtime.vault.get('figma-rm1')).toBeNull();
    });
  });

  describe('salvador_code_review', () => {
    function buildDomainFacade(): FacadeConfig {
      return createDomainFacade(runtime, 'salvador', 'code-review');
    }

    it('should create facade with expected ops', () => {
      const facade = buildDomainFacade();
      expect(facade.name).toBe('salvador_code_review');
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_patterns');
      expect(opNames).toContain('search');
      expect(opNames).toContain('get_entry');
      expect(opNames).toContain('capture');
      expect(opNames).toContain('remove');
    });

    it('get_patterns should return entries for code-review', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'code-review-gp1', domain: 'code-review', tags: ['test'] }),
        makeEntry({ id: 'other-gp1', domain: 'other-domain', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_patterns')!;
      const results = (await op.handler({})) as IntelligenceEntry[];
      expect(results.every((e) => e.domain === 'code-review')).toBe(true);
    });

    it('search should scope to code-review with ranked results', async () => {
      runtime.vault.seed([
        makeEntry({
          id: 'code-review-s1',
          domain: 'code-review',
          title: 'Domain specific pattern',
          tags: ['find-me'],
        }),
        makeEntry({
          id: 'other-s1',
          domain: 'other',
          title: 'Other domain pattern',
          tags: ['nope'],
        }),
      ]);
      runtime.brain.rebuildVocabulary();
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'search')!;
      const results = (await op.handler({ query: 'pattern' })) as Array<{
        entry: IntelligenceEntry;
        score: number;
      }>;
      expect(results.every((r) => r.entry.domain === 'code-review')).toBe(true);
    });

    it('capture should add entry with code-review domain', async () => {
      const facade = buildDomainFacade();
      const captureOp = facade.ops.find((o) => o.name === 'capture')!;
      const result = (await captureOp.handler({
        id: 'code-review-cap1',
        type: 'pattern',
        title: 'Captured Pattern',
        severity: 'warning',
        description: 'A captured pattern.',
        tags: ['captured'],
      })) as { captured: boolean; governance?: { action: string } };
      expect(result.captured).toBe(true);
      const entry = runtime.vault.get('code-review-cap1');
      expect(entry).not.toBeNull();
      expect(entry!.domain).toBe('code-review');
    });

    it('get_entry should return specific entry', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'code-review-ge1', domain: 'code-review', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'get_entry')!;
      const result = (await op.handler({ id: 'code-review-ge1' })) as IntelligenceEntry;
      expect(result.id).toBe('code-review-ge1');
    });

    it('remove should delete entry', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'code-review-rm1', domain: 'code-review', tags: ['test'] }),
      ]);
      const facade = buildDomainFacade();
      const op = facade.ops.find((o) => o.name === 'remove')!;
      const result = (await op.handler({ id: 'code-review-rm1' })) as { removed: boolean };
      expect(result.removed).toBe(true);
      expect(runtime.vault.get('code-review-rm1')).toBeNull();
    });
  });

  describe('domain pack: design', () => {
    it('should load and validate the domain pack', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design', package: '@soleri/domain-design' },
      ]);
      expect(packs.length).toBe(1);
      expect(packs[0].name).toBe('design');
      expect(packs[0].ops.length).toBeGreaterThan(0);
    });

    it('should register pack ops in domain facades', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design', package: '@soleri/domain-design' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['design'], packs);
      expect(facades.length).toBeGreaterThanOrEqual(1);
      // Pack ops should be present
      const allOps = facades.flatMap((f) => f.ops.map((o) => o.name));
      expect(allOps.length).toBeGreaterThan(5); // More than standard 5
    });

    it('pack custom ops should be callable', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design', package: '@soleri/domain-design' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['design'], packs);
      const facade = facades[0];
      // Test first custom op returns without error
      const firstOp = facade.ops[0];
      const result = await firstOp.handler({});
      expect(result).toBeDefined();
    });
  });

  describe('domain pack: component', () => {
    it('should load and validate the domain pack', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'component', package: '@soleri/domain-component' },
      ]);
      expect(packs.length).toBe(1);
      expect(packs[0].name).toBe('component');
      expect(packs[0].ops.length).toBeGreaterThan(0);
    });

    it('should register pack ops in domain facades', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'component', package: '@soleri/domain-component' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['component'], packs);
      expect(facades.length).toBeGreaterThanOrEqual(1);
      // Pack ops should be present
      const allOps = facades.flatMap((f) => f.ops.map((o) => o.name));
      expect(allOps.length).toBeGreaterThan(5); // More than standard 5
    });

    it('pack custom ops should be callable', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'component', package: '@soleri/domain-component' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['component'], packs);
      const facade = facades[0];
      // Test first custom op returns without error
      const firstOp = facade.ops[0];
      const result = await firstOp.handler({});
      expect(result).toBeDefined();
    });
  });

  describe('domain pack: design-qa', () => {
    it('should load and validate the domain pack', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design-qa', package: '@soleri/domain-design-qa' },
      ]);
      expect(packs.length).toBe(1);
      expect(packs[0].name).toBe('design-qa');
      expect(packs[0].ops.length).toBeGreaterThan(0);
    });

    it('should register pack ops in domain facades', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design-qa', package: '@soleri/domain-design-qa' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['design-qa'], packs);
      expect(facades.length).toBeGreaterThanOrEqual(1);
      // Pack ops should be present
      const allOps = facades.flatMap((f) => f.ops.map((o) => o.name));
      expect(allOps.length).toBeGreaterThan(5); // More than standard 5
    });

    it('pack custom ops should be callable', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'design-qa', package: '@soleri/domain-design-qa' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['design-qa'], packs);
      const facade = facades[0];
      // Test first custom op returns without error
      const firstOp = facade.ops[0];
      const result = await firstOp.handler({});
      expect(result).toBeDefined();
    });
  });

  describe('domain pack: code-review', () => {
    it('should load and validate the domain pack', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'code-review', package: '@soleri/domain-code-review' },
      ]);
      expect(packs.length).toBe(1);
      expect(packs[0].name).toBe('code-review');
      expect(packs[0].ops.length).toBeGreaterThan(0);
    });

    it('should register pack ops in domain facades', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'code-review', package: '@soleri/domain-code-review' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['code-review'], packs);
      expect(facades.length).toBeGreaterThanOrEqual(1);
      // Pack ops should be present
      const allOps = facades.flatMap((f) => f.ops.map((o) => o.name));
      expect(allOps.length).toBeGreaterThan(5); // More than standard 5
    });

    it('pack custom ops should be callable', async () => {
      const packs = await loadDomainPacksFromConfig([
        { name: 'code-review', package: '@soleri/domain-code-review' },
      ]);
      const facades = createDomainFacades(runtime, 'salvador', ['code-review'], packs);
      const facade = facades[0];
      // Test first custom op returns without error
      const firstOp = facade.ops[0];
      const result = await firstOp.handler({});
      expect(result).toBeDefined();
    });
  });

  // ─── Semantic Facades ────────────────────────────────────────
  describe('semantic facades', () => {
    function buildSemanticFacades(): FacadeConfig[] {
      return createSemanticFacades(runtime, 'salvador');
    }

    it('should create all expected semantic facades', () => {
      const facades = buildSemanticFacades();
      // At least the core 10 facades must exist; new ones may be added by @soleri/core
      expect(facades.length).toBeGreaterThanOrEqual(10);
      const names = facades.map((f) => f.name);
      expect(names).toContain('salvador_vault');
      expect(names).toContain('salvador_plan');
      expect(names).toContain('salvador_brain');
      expect(names).toContain('salvador_memory');
      expect(names).toContain('salvador_admin');
      expect(names).toContain('salvador_curator');
      expect(names).toContain('salvador_loop');
      expect(names).toContain('salvador_orchestrate');
      expect(names).toContain('salvador_control');
      expect(names).toContain('salvador_cognee');
    });

    it('total ops across all facades should meet minimum threshold', () => {
      const facades = buildSemanticFacades();
      const totalOps = facades.reduce((sum, f) => sum + f.ops.length, 0);
      // At least 209 ops (baseline); new ops may be added by @soleri/core
      expect(totalOps).toBeGreaterThanOrEqual(209);
    });
  });

  describe('salvador_vault', () => {
    function getFacade(): FacadeConfig {
      return createSemanticFacades(runtime, 'salvador').find((f) => f.name === 'salvador_vault')!;
    }

    it('should contain vault ops', () => {
      const opNames = getFacade().ops.map((o) => o.name);
      expect(opNames).toContain('search');
      expect(opNames).toContain('vault_stats');
      expect(opNames).toContain('list_all');
      expect(opNames).toContain('export');
      expect(opNames).toContain('vault_get');
      expect(opNames).toContain('vault_import');
      expect(opNames).toContain('capture_knowledge');
      expect(opNames).toContain('intake_ingest_book');
      // Zettelkasten linking ops
      expect(opNames).toContain('link_entries');
      expect(opNames).toContain('get_links');
      expect(opNames).toContain('traverse');
      expect(opNames).toContain('suggest_links');
      expect(opNames).toContain('get_orphans');
    });

    it('search should query across all domains', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      runtime = createAgentRuntime({
        agentId: 'salvador',
        vaultPath: ':memory:',
        plansPath: join(plannerDir, 'plans2.json'),
      });
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_vault',
      )!;
      const searchOp = facade.ops.find((o) => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'pattern' })) as Array<{
        entry: unknown;
        score: number;
      }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('vault_stats should return counts', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'vs1', domain: 'd1', tags: ['x'] }),
        makeEntry({ id: 'vs2', domain: 'd2', tags: ['y'] }),
      ]);
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_vault',
      )!;
      const statsOp = facade.ops.find((o) => o.name === 'vault_stats')!;
      const stats = (await statsOp.handler({})) as { totalEntries: number };
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('salvador_plan', () => {
    it('should contain planning ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_plan',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('create_plan');
      expect(opNames).toContain('get_plan');
      expect(opNames).toContain('approve_plan');
      expect(opNames).toContain('plan_iterate');
      expect(opNames).toContain('plan_grade');
    });

    it('create_plan should create a draft plan', async () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_plan',
      )!;
      const createOp = facade.ops.find((o) => o.name === 'create_plan')!;
      const result = (await createOp.handler({
        objective: 'Add caching',
        scope: 'api layer',
        tasks: [{ title: 'Add Redis', description: 'Set up Redis client' }],
      })) as { created: boolean; plan: { status: string } };
      expect(result.created).toBe(true);
      expect(result.plan.status).toBe('draft');
    });
  });

  describe('salvador_brain', () => {
    it('should contain brain ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_brain',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('brain_stats');
      expect(opNames).toContain('brain_strengths');
      expect(opNames).toContain('brain_build_intelligence');
      expect(opNames).toContain('brain_lifecycle');
      expect(opNames).toContain('brain_decay_report');
    });

    it('brain_stats should return intelligence stats', async () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_brain',
      )!;
      const statsOp = facade.ops.find((o) => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as { vocabularySize: number };
      expect(result.vocabularySize).toBe(0);
    });
  });

  describe('salvador_memory', () => {
    it('should contain memory ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_memory',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('memory_search');
      expect(opNames).toContain('memory_capture');
      expect(opNames).toContain('memory_promote_to_global');
    });
  });

  describe('salvador_admin', () => {
    it('should contain admin ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_admin',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('admin_health');
      expect(opNames).toContain('admin_tool_list');
      expect(opNames).toContain('llm_rotate');
      expect(opNames).toContain('render_prompt');
    });
  });

  describe('salvador_curator', () => {
    it('should contain curator ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_curator',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('curator_status');
      expect(opNames).toContain('curator_health_audit');
      expect(opNames).toContain('curator_hybrid_contradictions');
    });

    it('curator_status should return initialized', async () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_curator',
      )!;
      const statusOp = facade.ops.find((o) => o.name === 'curator_status')!;
      const result = (await statusOp.handler({})) as { initialized: boolean };
      expect(result.initialized).toBe(true);
    });
  });

  describe('salvador_loop', () => {
    it('should contain loop ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_loop',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('loop_start');
      expect(opNames).toContain('loop_iterate');
      expect(opNames).toContain('loop_cancel');
    });
  });

  describe('salvador_orchestrate', () => {
    it('should contain orchestrate ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_orchestrate',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('register');
      expect(opNames).toContain('orchestrate_plan');
      expect(opNames).toContain('project_get');
      expect(opNames).toContain('playbook_list');
    });
  });

  describe('salvador_control', () => {
    it('should contain control and governance ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_control',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('get_identity');
      expect(opNames).toContain('route_intent');
      expect(opNames).toContain('governance_policy');
      expect(opNames).toContain('governance_dashboard');
    });

    it('governance_policy should return default policy', async () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_control',
      )!;
      const policyOp = facade.ops.find((o) => o.name === 'governance_policy')!;
      const result = (await policyOp.handler({ action: 'get', projectPath: '/test' })) as {
        projectPath: string;
        quotas: { maxEntriesTotal: number };
      };
      expect(result.projectPath).toBe('/test');
      expect(result.quotas.maxEntriesTotal).toBe(500);
    });
  });

  describe('salvador_cognee', () => {
    it('should contain cognee ops', () => {
      const facade = createSemanticFacades(runtime, 'salvador').find(
        (f) => f.name === 'salvador_cognee',
      )!;
      const opNames = facade.ops.map((o) => o.name);
      expect(opNames).toContain('cognee_status');
      expect(opNames).toContain('cognee_search');
      expect(opNames).toContain('cognee_sync_status');
    });
  });

  describe('salvador_core (agent-specific)', () => {
    function buildAgentFacade(): FacadeConfig {
      const agentOps: OpDefinition[] = [
        {
          name: 'health',
          description: 'Health check',
          auth: 'read',
          handler: async () => {
            const stats = runtime.vault.stats();
            return {
              status: 'ok',
              agent: { name: PERSONA.name, role: PERSONA.role },
              vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
            };
          },
        },
        {
          name: 'identity',
          description: 'Agent identity',
          auth: 'read',
          handler: async () => PERSONA,
        },
        {
          name: 'activate',
          description: 'Activate agent',
          auth: 'read',
          schema: z.object({
            projectPath: z.string().optional().default('.'),
            deactivate: z.boolean().optional(),
          }),
          handler: async (params) => {
            if (params.deactivate) return deactivateAgent();
            return activateAgent(runtime, (params.projectPath as string) ?? '.');
          },
        },
        {
          name: 'inject_claude_md',
          description: 'Inject CLAUDE.md',
          auth: 'write',
          schema: z.object({
            projectPath: z.string().optional().default('.'),
            global: z.boolean().optional(),
          }),
          handler: async (params) => {
            if (params.global) return injectClaudeMdGlobal();
            return injectClaudeMd((params.projectPath as string) ?? '.');
          },
        },
        {
          name: 'inject_agents_md',
          description: 'Inject AGENTS.md',
          auth: 'write',
          schema: z.object({
            projectPath: z.string().optional().default('.'),
            global: z.boolean().optional(),
          }),
          handler: async (params) => {
            if (params.global) return injectAgentsMdGlobal();
            return injectAgentsMd((params.projectPath as string) ?? '.');
          },
        },
        {
          name: 'setup',
          description: 'Setup status',
          auth: 'read',
          schema: z.object({ projectPath: z.string().optional().default('.') }),
          handler: async (params) => {
            const { existsSync: exists } = await import('node:fs');
            const { join: joinPath } = await import('node:path');
            const { homedir } = await import('node:os');
            const pp = (params.projectPath as string) ?? '.';
            const projectClaudeMd = joinPath(pp, 'CLAUDE.md');
            const globalClaudeMd = joinPath(homedir(), '.claude', 'CLAUDE.md');
            const stats = runtime.vault.stats();
            const recommendations: string[] = [];
            if (!hasAgentMarker(globalClaudeMd) && !hasAgentMarker(projectClaudeMd)) {
              recommendations.push('No CLAUDE.md configured');
            }
            if (stats.totalEntries === 0) {
              recommendations.push('Vault is empty');
            }
            // Check hook status
            const { readdirSync } = await import('node:fs');
            const agentClaudeDir = joinPath(__dirname, '..', '.claude');
            const globalClaudeDir = joinPath(homedir(), '.claude');
            const hookStatus = {
              agent: [] as string[],
              global: [] as string[],
              missing: [] as string[],
            };
            if (exists(agentClaudeDir)) {
              try {
                const agentHooks = readdirSync(agentClaudeDir)
                  .filter((f: string) => f.startsWith('hookify.') && f.endsWith('.local.md'))
                  .map((f: string) => f.replace('hookify.', '').replace('.local.md', ''));
                hookStatus.agent = agentHooks;
                for (const hook of agentHooks) {
                  if (exists(joinPath(globalClaudeDir, `hookify.${hook}.local.md`))) {
                    hookStatus.global.push(hook);
                  } else {
                    hookStatus.missing.push(hook);
                  }
                }
              } catch {
                /* ignore */
              }
            }
            if (hookStatus.missing.length > 0) {
              recommendations.push(
                `${hookStatus.missing.length} hook(s) not installed globally — run scripts/setup.sh`,
              );
            }
            if (recommendations.length === 0) {
              recommendations.push('Salvador is fully set up and ready!');
            }
            return {
              agent: { name: PERSONA.name, role: PERSONA.role },
              claude_md: {
                project: {
                  exists: exists(projectClaudeMd),
                  has_agent_section: hasAgentMarker(projectClaudeMd),
                },
                global: {
                  exists: exists(globalClaudeMd),
                  has_agent_section: hasAgentMarker(globalClaudeMd),
                },
              },
              vault: { entries: stats.totalEntries, domains: Object.keys(stats.byDomain) },
              hooks: hookStatus,
              recommendations,
            };
          },
        },
      ];
      return {
        name: 'salvador_core',
        description: 'Agent-specific operations',
        ops: agentOps,
      };
    }

    it('agent ops should not appear in semantic facades', () => {
      const facades = createSemanticFacades(runtime, 'salvador');
      const allOps = facades.flatMap((f) => f.ops.map((o) => o.name));
      expect(allOps).not.toContain('health');
      expect(allOps).not.toContain('identity');
      expect(allOps).not.toContain('activate');
      expect(allOps).not.toContain('inject_claude_md');
      expect(allOps).not.toContain('inject_agents_md');
      expect(allOps).not.toContain('setup');
    });

    it('health should return ok status', async () => {
      const facade = buildAgentFacade();
      const healthOp = facade.ops.find((o) => o.name === 'health')!;
      const health = (await healthOp.handler({})) as { status: string };
      expect(health.status).toBe('ok');
    });

    it('identity should return persona', async () => {
      const facade = buildAgentFacade();
      const identityOp = facade.ops.find((o) => o.name === 'identity')!;
      const persona = (await identityOp.handler({})) as { name: string; role: string };
      expect(persona.name).toBe('Salvador');
      expect(persona.role).toBe('Design System Intelligence');
    });

    it('activate should return persona and setup status', async () => {
      const facade = buildAgentFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        activated: boolean;
        origin: { name: string; role: string };
      };
      expect(result.activated).toBe(true);
      expect(result.origin.name).toBe('Salvador');
    });

    it('activate with deactivate flag should return deactivation', async () => {
      const facade = buildAgentFacade();
      const activateOp = facade.ops.find((o) => o.name === 'activate')!;
      const result = (await activateOp.handler({ deactivate: true })) as {
        deactivated: boolean;
        message: string;
      };
      expect(result.deactivated).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('inject_claude_md should create CLAUDE.md in temp dir', async () => {
      const tempDir = join(tmpdir(), 'forge-inject-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      try {
        const facade = buildAgentFacade();
        const injectOp = facade.ops.find((o) => o.name === 'inject_claude_md')!;
        const result = (await injectOp.handler({ projectPath: tempDir })) as {
          injected: boolean;
          path: string;
          action: string;
        };
        expect(result.injected).toBe(true);
        expect(result.action).toBe('created');
        expect(existsSync(result.path)).toBe(true);
        const content = readFileSync(result.path, 'utf-8');
        expect(content).toContain('salvador:mode');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('inject_agents_md should create AGENTS.md in temp dir', async () => {
      const tempDir = join(tmpdir(), 'forge-inject-agents-test-' + Date.now());
      mkdirSync(tempDir, { recursive: true });
      try {
        const facade = buildAgentFacade();
        const injectOp = facade.ops.find((o) => o.name === 'inject_agents_md')!;
        const result = (await injectOp.handler({ projectPath: tempDir })) as {
          injected: boolean;
          path: string;
          action: string;
        };
        expect(result.injected).toBe(true);
        expect(result.action).toBe('created');
        expect(existsSync(result.path)).toBe(true);
        const content = readFileSync(result.path, 'utf-8');
        expect(content).toContain('salvador:mode');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('setup should return project and global CLAUDE.md status', async () => {
      const facade = buildAgentFacade();
      const setupOp = facade.ops.find((o) => o.name === 'setup')!;
      const result = (await setupOp.handler({ projectPath: '/tmp/nonexistent-test' })) as {
        agent: { name: string };
        claude_md: {
          project: { exists: boolean; has_agent_section: boolean };
          global: { exists: boolean; has_agent_section: boolean };
        };
        vault: { entries: number };
        hooks: { agent: string[]; global: string[]; missing: string[] };
        recommendations: string[];
      };
      expect(result.agent.name).toBe('Salvador');
      expect(result.vault.entries).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
