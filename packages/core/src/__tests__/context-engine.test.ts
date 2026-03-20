/**
 * Context Engine Tests — entity extraction, knowledge retrieval, confidence scoring.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Brain } from '../brain/brain.js';
import { BrainIntelligence } from '../brain/intelligence.js';
import { ContextEngine } from '../context/context-engine.js';

describe('ContextEngine', () => {
  let vault: Vault;
  let brain: Brain;
  let intelligence: BrainIntelligence;
  let engine: ContextEngine;

  beforeEach(() => {
    vault = new Vault(':memory:');
    brain = new Brain(vault);
    intelligence = new BrainIntelligence(vault, brain);
    engine = new ContextEngine(vault, brain, intelligence, null);
  });

  // ─── Entity Extraction ───────────────────────────────────────────

  describe('extractEntities', () => {
    test('extracts file paths', () => {
      const result = engine.extractEntities('Fix the bug in src/vault/vault.ts');
      const files = result.byType.file ?? [];
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.value.includes('vault.ts'))).toBe(true);
    });

    test('extracts function calls', () => {
      const result = engine.extractEntities('The search() method returns wrong results');
      const functions = result.byType.function ?? [];
      expect(functions.length).toBeGreaterThan(0);
      expect(functions.some((f) => f.value === 'search()')).toBe(true);
    });

    test('extracts domain keywords', () => {
      const result = engine.extractEntities('Improve accessibility and performance');
      const domains = result.byType.domain ?? [];
      expect(domains.length).toBe(2);
      expect(domains.some((d) => d.value === 'accessibility')).toBe(true);
      expect(domains.some((d) => d.value === 'performance')).toBe(true);
    });

    test('extracts action verbs', () => {
      const result = engine.extractEntities('Create a new component and test it');
      const actions = result.byType.action ?? [];
      expect(actions.some((a) => a.value === 'create')).toBe(true);
      expect(actions.some((a) => a.value === 'test')).toBe(true);
    });

    test('extracts technologies', () => {
      const result = engine.extractEntities('Build a React component with TypeScript');
      const techs = result.byType.technology ?? [];
      expect(techs.some((t) => t.value === 'react')).toBe(true);
      expect(techs.some((t) => t.value === 'typescript')).toBe(true);
    });

    test('deduplicates entities', () => {
      const result = engine.extractEntities('Fix the fix for the fix');
      const actions = result.byType.action ?? [];
      const fixActions = actions.filter((a) => a.value === 'fix');
      expect(fixActions.length).toBe(1);
    });

    test('filters stop patterns', () => {
      const result = engine.extractEntities('This is a real-time built-in feature');
      const patterns = result.byType.pattern ?? [];
      expect(patterns.some((p) => p.value === 'real-time')).toBe(false);
      expect(patterns.some((p) => p.value === 'built-in')).toBe(false);
    });

    test('returns empty for empty prompt', () => {
      const result = engine.extractEntities('');
      expect(result.entities.length).toBe(0);
    });

    test('groups entities by type', () => {
      const result = engine.extractEntities('Create a React component in src/app.tsx for security');
      expect(result.byType.action).toBeDefined();
      expect(result.byType.technology).toBeDefined();
      expect(result.byType.file).toBeDefined();
      expect(result.byType.domain).toBeDefined();
    });
  });

  // ─── Knowledge Retrieval ─────────────────────────────────────────

  describe('retrieveKnowledge', () => {
    test('retrieves from vault FTS', async () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'design',
          title: 'Button component pattern',
          severity: 'suggestion',
          description: 'Use semantic HTML for buttons',
          tags: ['design', 'component'],
        },
      ]);

      // Use single term for FTS5 compatibility
      const result = await engine.retrieveKnowledge('button');
      expect(result.vaultHits).toBeGreaterThan(0);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].source).toBe('vault');
    });

    test('returns empty when vault has no matches', async () => {
      const result = await engine.retrieveKnowledge('xyzzy nonexistent query');
      expect(result.items.length).toBe(0);
      expect(result.vaultHits).toBe(0);
    });

    test('filters by domain', async () => {
      vault.seed([
        {
          id: 'p1',
          type: 'pattern',
          domain: 'design',
          title: 'Design pattern one',
          severity: 'suggestion',
          description: 'A design domain pattern',
          tags: ['design'],
        },
        {
          id: 'p2',
          type: 'pattern',
          domain: 'security',
          title: 'Security pattern one',
          severity: 'warning',
          description: 'A security domain pattern',
          tags: ['security'],
        },
      ]);

      // Search for "pattern" (exists in both entries) filtered to design domain
      const result = await engine.retrieveKnowledge('pattern', 'design');
      expect(result.vaultHits).toBe(1);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].domain).toBe('design');
    });
  });

  // ─── Context Analysis ────────────────────────────────────────────

  describe('analyze', () => {
    test('returns full context analysis', async () => {
      vault.seed([
        {
          id: 'r1',
          type: 'rule',
          domain: 'accessibility',
          title: 'All buttons must have labels',
          severity: 'critical',
          description: 'Screen readers require button labels for navigation',
          tags: ['accessibility', 'button'],
        },
      ]);

      const result = await engine.analyze('Fix the accessibility issue with buttons');

      expect(result.prompt).toBe('Fix the accessibility issue with buttons');
      expect(result.entities.entities.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidenceLevel).toBeDefined();
      expect(result.detectedDomains).toContain('accessibility');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    test('detects domains from entities and knowledge', async () => {
      vault.seed([
        {
          id: 'r1',
          type: 'rule',
          domain: 'performance',
          title: 'Avoid N+1 queries',
          severity: 'warning',
          description: 'Batch database queries to avoid N+1 problems',
          tags: ['performance', 'database'],
        },
      ]);

      const result = await engine.analyze('Optimize the performance of database queries');
      expect(result.detectedDomains).toContain('performance');
    });

    test('low confidence for vague prompts', async () => {
      const result = await engine.analyze('do something');
      expect(result.confidenceLevel).toBe('low');
    });

    test('higher confidence with entities and knowledge', async () => {
      vault.seed([
        {
          id: 'r1',
          type: 'pattern',
          domain: 'testing',
          title: 'Unit test best practices',
          severity: 'suggestion',
          description: 'Write focused unit tests that test one thing',
          tags: ['testing'],
        },
      ]);

      const result = await engine.analyze(
        'Create unit tests for the search() function in src/vault/vault.ts with TypeScript',
      );
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.entities.entities.length).toBeGreaterThan(3);
    });

    test('includes processing time', async () => {
      const result = await engine.analyze('test query');
      expect(typeof result.processingTimeMs).toBe('number');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Configuration ───────────────────────────────────────────────

  describe('configuration', () => {
    test('respects custom config', async () => {
      const customEngine = new ContextEngine(vault, brain, intelligence, {
        vaultSearchLimit: 2,
        minScoreThreshold: 0.9,
      });

      vault.seed(
        Array.from({ length: 10 }, (_, i) => ({
          id: `entry-${i}`,
          type: 'pattern' as const,
          domain: 'general',
          title: `Pattern ${i} for testing`,
          severity: 'suggestion' as const,
          description: `Description for pattern ${i}`,
          tags: ['general'],
        })),
      );

      const result = await customEngine.retrieveKnowledge('pattern testing');
      // High threshold filters out low-score items
      expect(result.items.every((i) => i.score >= 0.9)).toBe(true);
    });
  });
});
