import { describe, it, expect } from 'vitest';
import { chainToCapability } from './chain-mapping.js';

describe('chainToCapability', () => {
  it('maps vault-search to vault.search', () => {
    expect(chainToCapability('vault-search')).toBe('vault.search');
  });

  it('maps vault-search-antipatterns to vault.search', () => {
    expect(chainToCapability('vault-search-antipatterns')).toBe('vault.search');
  });

  it('maps memory-search to memory.search', () => {
    expect(chainToCapability('memory-search')).toBe('memory.search');
  });

  it('maps brain-recommend to brain.recommend', () => {
    expect(chainToCapability('brain-recommend')).toBe('brain.recommend');
  });

  it('maps brain-strengths to brain.strengths', () => {
    expect(chainToCapability('brain-strengths')).toBe('brain.strengths');
  });

  it('maps component chains correctly', () => {
    expect(chainToCapability('component-search')).toBe('component.search');
    expect(chainToCapability('component-workflow')).toBe('component.workflow');
    expect(chainToCapability('validate-component')).toBe('component.validate');
  });

  it('maps design chains correctly', () => {
    expect(chainToCapability('contrast-check')).toBe('color.validate');
    expect(chainToCapability('validate-tokens')).toBe('token.check');
    expect(chainToCapability('design-rules-check')).toBe('design.rules');
    expect(chainToCapability('recommend-design-system')).toBe('design.recommend');
    expect(chainToCapability('recommend-palette')).toBe('design.palette');
    expect(chainToCapability('recommend-style')).toBe('design.style');
    expect(chainToCapability('recommend-typography')).toBe('design.typography');
    expect(chainToCapability('get-stack-guidelines')).toBe('stack.guidelines');
  });

  it('maps architecture and cognee chains', () => {
    expect(chainToCapability('architecture-search')).toBe('architecture.search');
    expect(chainToCapability('cognee-design-search')).toBe('cognee.search');
  });

  it('maps planning chains', () => {
    expect(chainToCapability('plan-create')).toBe('plan.create');
  });

  it('maps review and quality chains', () => {
    expect(chainToCapability('review-report')).toBe('review.report');
    expect(chainToCapability('accessibility-audit')).toBe('a11y.audit');
    expect(chainToCapability('performance-audit')).toBe('perf.audit');
    expect(chainToCapability('test-coverage-check')).toBe('test.coverage');
    expect(chainToCapability('error-pattern-search')).toBe('debug.patterns');
    expect(chainToCapability('delivery-checklist')).toBe('deliver.checklist');
    expect(chainToCapability('playbook-search')).toBe('vault.playbook');
  });

  it('returns undefined for unknown chain names', () => {
    expect(chainToCapability('nonexistent-chain')).toBeUndefined();
    expect(chainToCapability('')).toBeUndefined();
    expect(chainToCapability('random-thing')).toBeUndefined();
  });
});
