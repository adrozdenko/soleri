import { describe, it, expect } from 'vitest';
import {
  validatePlaybook,
  parsePlaybookFromEntry,
  type Playbook,
  type PlaybookStep,
} from './playbook.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

function makeStep(overrides: Partial<PlaybookStep> = {}, index = 1): PlaybookStep {
  return {
    order: index,
    title: `Step ${index}`,
    description: `Description for step ${index}`,
    ...overrides,
  };
}

function makePlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: 'pb-1',
    title: 'Test Playbook',
    domain: 'testing',
    description: 'A test playbook',
    steps: [makeStep({}, 1), makeStep({}, 2)],
    tags: ['test'],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<IntelligenceEntry> = {}): IntelligenceEntry {
  return {
    id: 'entry-1',
    type: 'playbook',
    domain: 'testing',
    title: 'Test Playbook',
    severity: 'suggestion',
    description: 'A test playbook entry',
    tags: ['test'],
    context: JSON.stringify({ steps: [makeStep({}, 1)] }),
    ...overrides,
  };
}

describe('validatePlaybook', () => {
  it('returns valid for a well-formed playbook', () => {
    const result = validatePlaybook(makePlaybook());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects empty title', () => {
    const result = validatePlaybook(makePlaybook({ title: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook title must not be empty');
  });

  it('rejects whitespace-only title', () => {
    const result = validatePlaybook(makePlaybook({ title: '   ' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook title must not be empty');
  });

  it('rejects empty steps array', () => {
    const result = validatePlaybook(makePlaybook({ steps: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook must have at least one step');
  });

  it('rejects out-of-order steps', () => {
    const steps = [makeStep({ order: 2 }, 1), makeStep({ order: 1 }, 2)];
    // Fix: steps[0] has order=2 but expected=1
    const result = validatePlaybook(makePlaybook({ steps }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Step 1 has order 2, expected 1');
  });

  it('rejects step with empty title', () => {
    const steps = [makeStep({ title: '' }, 1)];
    const result = validatePlaybook(makePlaybook({ steps }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Step 1 title must not be empty');
  });

  it('rejects step with empty description', () => {
    const steps = [makeStep({ description: '' }, 1)];
    const result = validatePlaybook(makePlaybook({ steps }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Step 1 description must not be empty');
  });

  it('collects multiple errors', () => {
    const steps = [makeStep({ title: '', description: '' }, 1)];
    const result = validatePlaybook(makePlaybook({ title: '', steps }));
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors).toContain('Playbook title must not be empty');
    expect(result.errors).toContain('Step 1 title must not be empty');
    expect(result.errors).toContain('Step 1 description must not be empty');
  });
});

describe('parsePlaybookFromEntry', () => {
  it('parses a valid playbook entry', () => {
    const playbook = parsePlaybookFromEntry(makeEntry());
    expect(playbook).not.toBeNull();
    expect(playbook!.id).toBe('entry-1');
    expect(playbook!.title).toBe('Test Playbook');
    expect(playbook!.steps).toHaveLength(1);
    expect(playbook!.steps[0].order).toBe(1);
  });

  it('returns null for non-playbook type', () => {
    const result = parsePlaybookFromEntry(makeEntry({ type: 'pattern' }));
    expect(result).toBeNull();
  });

  it('returns null for missing context', () => {
    const result = parsePlaybookFromEntry(makeEntry({ context: undefined }));
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON context', () => {
    const result = parsePlaybookFromEntry(makeEntry({ context: 'not-json' }));
    expect(result).toBeNull();
  });

  it('returns null when context has no steps array', () => {
    const result = parsePlaybookFromEntry(makeEntry({ context: JSON.stringify({ other: true }) }));
    expect(result).toBeNull();
  });

  it('returns null when steps is not an array', () => {
    const result = parsePlaybookFromEntry(
      makeEntry({ context: JSON.stringify({ steps: 'not-array' }) }),
    );
    expect(result).toBeNull();
  });

  it('sets createdAt and updatedAt to 0', () => {
    const playbook = parsePlaybookFromEntry(makeEntry());
    expect(playbook!.createdAt).toBe(0);
    expect(playbook!.updatedAt).toBe(0);
  });

  it('preserves domain and tags from the entry', () => {
    const playbook = parsePlaybookFromEntry(
      makeEntry({ domain: 'security', tags: ['sec', 'audit'] }),
    );
    expect(playbook!.domain).toBe('security');
    expect(playbook!.tags).toEqual(['sec', 'audit']);
  });
});
