/**
 * Context Engine — colocated contract tests.
 *
 * All external dependencies (Vault, Brain, BrainIntelligence) are mocked.
 * No real DB or network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextEngine } from './context-engine.js';
import type { Vault } from '../vault/vault.js';
import type { Brain } from '../brain/brain.js';
import type { BrainIntelligence } from '../brain/intelligence.js';

// ─── Mock Factories ─────────────────────────────────────────────────

function createMockVault(overrides?: Partial<Vault>): Vault {
  return {
    search: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as Vault;
}

function createMockBrain(): Brain {
  return {} as unknown as Brain;
}

function createMockIntelligence(overrides?: Partial<BrainIntelligence>): BrainIntelligence {
  return {
    recommend: vi.fn().mockReturnValue([]),
    ...overrides,
  } as unknown as BrainIntelligence;
}

function makeVaultResult(id: string, title: string, score: number, domain: string, tags: string[] = []) {
  return {
    entry: { id, title, domain, tags, type: 'pattern', severity: 'suggestion', description: '' },
    score,
  };
}

function makeBrainRecommendation(pattern: string, domain: string, strength: number) {
  return {
    pattern,
    domain,
    strength,
    usageScore: 50,
    spreadScore: 50,
    successScore: 50,
    recencyScore: 50,
    usageCount: 5,
    uniqueContexts: 3,
    successRate: 0.8,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ContextEngine', () => {
  let vault: Vault;
  let brain: Brain;
  let intelligence: BrainIntelligence;
  let engine: ContextEngine;

  beforeEach(() => {
    vault = createMockVault();
    brain = createMockBrain();
    intelligence = createMockIntelligence();
    engine = new ContextEngine(vault, brain, intelligence);
  });

  // ─── Contract: Entity Extraction ────────────────────────────────

  describe('extractEntities', () => {
    it('returns entities and byType grouping for a rich prompt', () => {
      const result = engine.extractEntities('Fix the bug in src/vault/vault.ts');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('byType');
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('extracts file paths with correct type and position', () => {
      const result = engine.extractEntities('Check src/app.tsx for errors');
      const files = result.byType.file ?? [];
      expect(files.length).toBeGreaterThan(0);
      const appFile = files.find((f) => f.value.includes('app.tsx'));
      expect(appFile).toBeDefined();
      expect(appFile!.type).toBe('file');
      expect(appFile!.confidence).toBe(0.8);
      expect(typeof appFile!.start).toBe('number');
      expect(typeof appFile!.end).toBe('number');
    });

    it('extracts function calls', () => {
      const result = engine.extractEntities('Call search() and then render()');
      const fns = result.byType.function ?? [];
      expect(fns.some((f) => f.value === 'search()')).toBe(true);
      expect(fns.some((f) => f.value === 'render()')).toBe(true);
    });

    it('extracts domain keywords case-insensitively', () => {
      const result = engine.extractEntities('Improve Accessibility and PERFORMANCE');
      const domains = result.byType.domain ?? [];
      expect(domains.some((d) => d.value === 'accessibility')).toBe(true);
      expect(domains.some((d) => d.value === 'performance')).toBe(true);
    });

    it('extracts action verbs', () => {
      const result = engine.extractEntities('Create and deploy the service');
      const actions = result.byType.action ?? [];
      expect(actions.some((a) => a.value === 'create')).toBe(true);
      expect(actions.some((a) => a.value === 'deploy')).toBe(true);
    });

    it('extracts technology mentions', () => {
      const result = engine.extractEntities('Use React with TypeScript and Docker');
      const techs = result.byType.technology ?? [];
      expect(techs.some((t) => t.value === 'react')).toBe(true);
      expect(techs.some((t) => t.value === 'typescript')).toBe(true);
      expect(techs.some((t) => t.value === 'docker')).toBe(true);
    });

    it('extracts kebab-case patterns but filters stop words', () => {
      const result = engine.extractEntities('Use the token-migration pattern, not built-in or real-time');
      const patterns = result.byType.pattern ?? [];
      expect(patterns.some((p) => p.value === 'token-migration')).toBe(true);
      expect(patterns.some((p) => p.value === 'real-time')).toBe(false);
      expect(patterns.some((p) => p.value === 'built-in')).toBe(false);
    });

    it('deduplicates identical entities of the same type', () => {
      const result = engine.extractEntities('fix the fix and fix again');
      const actions = result.byType.action ?? [];
      expect(actions.filter((a) => a.value === 'fix').length).toBe(1);
    });

    it('returns empty result for empty string', () => {
      const result = engine.extractEntities('');
      expect(result.entities).toEqual([]);
      expect(result.byType).toEqual({});
    });

    it('returns empty result for whitespace-only input', () => {
      const result = engine.extractEntities('   \n\t  ');
      expect(result.entities.length).toBe(0);
    });

    it('handles prompts with only stop patterns', () => {
      const result = engine.extractEntities('real-time built-in end-to-end');
      const patterns = result.byType.pattern ?? [];
      expect(patterns.length).toBe(0);
    });

    it('entities have confidence values between 0 and 1', () => {
      const result = engine.extractEntities('Create a React component in src/app.tsx for security');
      for (const entity of result.entities) {
        expect(entity.confidence).toBeGreaterThanOrEqual(0);
        expect(entity.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('all entity values are lowercased', () => {
      const result = engine.extractEntities('Build React TypeScript Docker');
      for (const entity of result.entities) {
        expect(entity.value).toBe(entity.value.toLowerCase());
      }
    });
  });

  // ─── Contract: Knowledge Retrieval ──────────────────────────────

  describe('retrieveKnowledge', () => {
    it('returns vault results with enriched scores', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Button pattern', 10, 'design', ['button', 'component']),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.retrieveKnowledge('button component');
      expect(result.vaultHits).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].source).toBe('vault');
      expect(result.items[0].id).toBe('v1');
      expect(result.items[0].score).toBeGreaterThan(0);
      expect(result.items[0].score).toBeLessThanOrEqual(1);
    });

    it('returns brain recommendations normalized to 0-1', async () => {
      const mockRecommend = vi.fn().mockReturnValue([
        makeBrainRecommendation('semantic-tokens', 'design', 80),
      ]);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.retrieveKnowledge('design tokens');
      expect(result.brainHits).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].source).toBe('brain');
      expect(result.items[0].score).toBe(0.8);
    });

    it('combines vault and brain results sorted by score descending', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Low relevance', 2, 'general'),
      ]);
      const mockRecommend = vi.fn().mockReturnValue([
        makeBrainRecommendation('high-relevance', 'design', 95),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.retrieveKnowledge('test query');
      expect(result.items[0].source).toBe('brain');
      expect(result.items[0].score).toBeGreaterThan(result.items[1].score);
    });

    it('filters items below minScoreThreshold', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Irrelevant entry', 1, 'misc'),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence, { minScoreThreshold: 0.99 });

      const result = await engine.retrieveKnowledge('xyz');
      expect(result.vaultHits).toBe(1);
      expect(result.items.length).toBe(0);
    });

    it('returns empty when vault and brain have no matches', async () => {
      const result = await engine.retrieveKnowledge('nonexistent query');
      expect(result.items).toEqual([]);
      expect(result.vaultHits).toBe(0);
      expect(result.brainHits).toBe(0);
      expect(result.cogneeHits).toBe(0);
    });

    it('passes domain filter to vault search', async () => {
      const mockSearch = vi.fn().mockReturnValue([]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      await engine.retrieveKnowledge('test', 'security');
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ domain: 'security' }));
    });

    it('passes domain to brain recommendations', async () => {
      const mockRecommend = vi.fn().mockReturnValue([]);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence);

      await engine.retrieveKnowledge('test', 'design');
      expect(mockRecommend).toHaveBeenCalledWith(expect.objectContaining({ domain: 'design' }));
    });

    it('gracefully handles vault search throwing', async () => {
      const mockSearch = vi.fn().mockImplementation(() => { throw new Error('DB error'); });
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.retrieveKnowledge('test');
      expect(result.vaultHits).toBe(0);
      expect(result.items.length).toBe(0);
    });

    it('gracefully handles brain recommend throwing', async () => {
      const mockRecommend = vi.fn().mockImplementation(() => { throw new Error('Brain error'); });
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.retrieveKnowledge('test');
      expect(result.brainHits).toBe(0);
    });

    it('respects vaultSearchLimit config', async () => {
      const mockSearch = vi.fn().mockReturnValue([]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence, { vaultSearchLimit: 3 });

      await engine.retrieveKnowledge('test');
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 3 }));
    });

    it('respects brainRecommendLimit config', async () => {
      const mockRecommend = vi.fn().mockReturnValue([]);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence, { brainRecommendLimit: 2 });

      await engine.retrieveKnowledge('test');
      expect(mockRecommend).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
    });
  });

  // ─── Contract: Context Analysis ─────────────────────────────────

  describe('analyze', () => {
    it('returns complete ContextAnalysis shape', async () => {
      const result = await engine.analyze('Fix accessibility in src/app.tsx');
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('knowledge');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('confidenceLevel');
      expect(result).toHaveProperty('detectedDomains');
      expect(result).toHaveProperty('processingTimeMs');
    });

    it('preserves the original prompt', async () => {
      const prompt = 'Build a dashboard with React';
      const result = await engine.analyze(prompt);
      expect(result.prompt).toBe(prompt);
    });

    it('confidence is between 0 and 1', async () => {
      const result = await engine.analyze('Create React TypeScript component in src/app.tsx for security');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('assigns low confidence for vague prompts with no knowledge', async () => {
      const result = await engine.analyze('do something');
      expect(result.confidenceLevel).toBe('low');
      expect(result.confidence).toBeLessThan(0.45);
    });

    it('assigns higher confidence when entities and knowledge are present', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Unit test best practices', 10, 'testing', ['testing']),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.analyze('Create unit tests for the search() function in src/vault.ts with TypeScript');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    it('detects domains from extracted entities', async () => {
      const result = await engine.analyze('Improve accessibility and security');
      expect(result.detectedDomains).toContain('accessibility');
      expect(result.detectedDomains).toContain('security');
    });

    it('detects domains from knowledge items', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Perf guide', 10, 'performance', ['performance']),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.analyze('make it faster');
      expect(result.detectedDomains).toContain('performance');
    });

    it('deduplicates domains from entities and knowledge', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'A11y rules', 10, 'accessibility', ['a11y']),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      const result = await engine.analyze('Fix accessibility issues');
      const a11yCount = result.detectedDomains.filter((d) => d === 'accessibility').length;
      expect(a11yCount).toBeLessThanOrEqual(1);
    });

    it('processing time is a non-negative number', async () => {
      const result = await engine.analyze('any prompt');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTimeMs).toBe('number');
    });

    it('returns empty domains for generic prompts with no knowledge', async () => {
      const result = await engine.analyze('hello world');
      expect(result.detectedDomains.length).toBe(0);
    });

    it('handles empty string prompt', async () => {
      const result = await engine.analyze('');
      expect(result.prompt).toBe('');
      expect(result.entities.entities).toEqual([]);
      expect(result.confidenceLevel).toBe('low');
    });
  });

  // ─── Contract: Confidence Scoring ───────────────────────────────

  describe('confidence scoring', () => {
    it('action verbs boost confidence', async () => {
      const noAction = await engine.analyze('the component');
      const withAction = await engine.analyze('create the component');
      expect(withAction.confidence).toBeGreaterThan(noAction.confidence);
    });

    it('more entities increase confidence up to a cap', async () => {
      const few = await engine.analyze('fix it');
      const many = await engine.analyze('fix the React TypeScript component in src/app.tsx for accessibility and deploy');
      expect(many.confidence).toBeGreaterThan(few.confidence);
    });

    it('source diversity bonus applies when multiple sources return results', async () => {
      const mockSearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Pattern one', 10, 'design', ['design']),
      ]);
      const mockRecommend = vi.fn().mockReturnValue([
        makeBrainRecommendation('some-pattern', 'design', 70),
      ]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      const multiEngine = new ContextEngine(vault, brain, intelligence);

      const vaultOnlySearch = vi.fn().mockReturnValue([
        makeVaultResult('v1', 'Pattern one', 10, 'design', ['design']),
      ]);
      const emptyRecommend = vi.fn().mockReturnValue([]);
      const vaultOnlyVault = createMockVault({ search: vaultOnlySearch } as unknown as Partial<Vault>);
      const emptyIntel = createMockIntelligence({ recommend: emptyRecommend } as unknown as Partial<BrainIntelligence>);
      const singleEngine = new ContextEngine(vaultOnlyVault, brain, emptyIntel);

      const multi = await multiEngine.analyze('design patterns');
      const single = await singleEngine.analyze('design patterns');
      expect(multi.confidence).toBeGreaterThanOrEqual(single.confidence);
    });

    it('confidence level thresholds: high >= 0.75, medium >= 0.45, low < 0.45', async () => {
      // Low: no entities, no knowledge
      const low = await engine.analyze('hmm');
      expect(low.confidenceLevel).toBe('low');
      expect(low.confidence).toBeLessThan(0.45);

      // Construct a scenario with enough signals for medium (action + 6 entities = 0.2 + 0.4 cap = 0.6)
      const medium = await engine.analyze('create a React TypeScript component in src/app.tsx for security');
      expect(medium.confidence).toBeGreaterThanOrEqual(0.45);
      expect(['medium', 'high']).toContain(medium.confidenceLevel);
    });
  });

  // ─── Contract: Configuration ────────────────────────────────────

  describe('configuration', () => {
    it('applies default config when none provided', async () => {
      const mockSearch = vi.fn().mockReturnValue([]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      engine = new ContextEngine(vault, brain, intelligence);

      await engine.retrieveKnowledge('test');
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 10 }));
    });

    it('overrides individual config values while keeping defaults for others', async () => {
      const mockSearch = vi.fn().mockReturnValue([]);
      const mockRecommend = vi.fn().mockReturnValue([]);
      vault = createMockVault({ search: mockSearch } as unknown as Partial<Vault>);
      intelligence = createMockIntelligence({ recommend: mockRecommend } as unknown as Partial<BrainIntelligence>);
      engine = new ContextEngine(vault, brain, intelligence, { vaultSearchLimit: 5 });

      await engine.retrieveKnowledge('test');
      expect(mockSearch).toHaveBeenCalledWith('test', expect.objectContaining({ limit: 5 }));
      expect(mockRecommend).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    });
  });
});
