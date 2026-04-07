import { describe, it, expect } from 'vitest';
import { createAgentRuntime, createSemanticFacades, createDomainFacades } from '@soleri/core';
import designPack from '@soleri/domain-design';
import componentPack from '@soleri/domain-component';
import designQaPack from '@soleri/domain-design-qa';
import codeReviewPack from '@soleri/domain-code-review';

describe('facade assembly with domain packs', () => {
  const runtime = createAgentRuntime({ agentId: 'test', vaultPath: ':memory:' });
  const packs = [designPack, componentPack, designQaPack, codeReviewPack];
  const semantic = createSemanticFacades(runtime, 'test');
  const domain = createDomainFacades(runtime, 'test', ['design'], packs);
  const all = [...semantic, ...domain];

  it('domain packs have correct names and non-empty ops', () => {
    expect(designPack.name).toBe('design');
    expect(componentPack.name).toBe('component');
    expect(designQaPack.name).toBe('design-qa');
    expect(codeReviewPack.name).toBe('code-review');

    for (const p of packs) {
      expect(p.ops.length).toBeGreaterThan(0);
      expect(p.domains.length).toBeGreaterThan(0);
    }
  });

  it('semantic facades include all 22 expected facades', () => {
    const semanticNames = semantic.map((f) => f.name);
    expect(semanticNames).toContain('test_vault');
    expect(semanticNames).toContain('test_plan');
    expect(semanticNames).toContain('test_brain');
    expect(semanticNames).toContain('test_memory');
    expect(semanticNames).toContain('test_admin');
    expect(semanticNames).toContain('test_curator');
    expect(semanticNames).toContain('test_loop');
    expect(semanticNames).toContain('test_orchestrate');
    expect(semanticNames).toContain('test_control');
    expect(semanticNames).toContain('test_context');
    expect(semanticNames).toContain('test_agency');
    expect(semanticNames).toContain('test_chat');
    expect(semanticNames).toContain('test_operator');
    expect(semanticNames).toContain('test_archive');
    expect(semanticNames).toContain('test_sync');
    expect(semanticNames).toContain('test_review');
    expect(semanticNames).toContain('test_intake');
    expect(semanticNames).toContain('test_links');
    expect(semanticNames).toContain('test_branching');
    expect(semanticNames).toContain('test_tier');
    expect(semanticNames).toContain('test_embedding');
    expect(semanticNames).toContain('test_dream');
    expect(semantic).toHaveLength(22);
  });

  it('domain facades include design domain and pack facades', () => {
    const domainNames = domain.map((f) => f.name);
    expect(domainNames).toContain('test_design');
    // Design pack contributes additional facades (design_rules, design_patterns)
    expect(domainNames).toContain('test_design_rules');
    expect(domainNames).toContain('test_design_patterns');
  });

  it('every facade has at least one op with a name and handler', () => {
    for (const f of all) {
      expect(f.ops.length).toBeGreaterThan(0);
      for (const op of f.ops) {
        expect(typeof op.name).toBe('string');
        expect(op.name.length).toBeGreaterThan(0);
        expect(typeof op.handler).toBe('function');
      }
    }
  });

  it('no duplicate facade names', () => {
    const names = all.map((f) => f.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('cleanup', () => {
    runtime.close();
  });
});
