import { describe, it, expect } from 'vitest';
import { loadPersona } from './loader.js';
import { ITALIAN_CRAFTSPERSON } from './defaults.js';

describe('loadPersona', () => {
  it('returns blank persona when no config provided', () => {
    const p = loadPersona('MyAgent');
    expect(p.name).toBe('MyAgent');
    expect(p.template).toBe('none');
    expect(p.voice).toBe('');
    expect(p.traits).toEqual([]);
    expect(p.greetings).toEqual([]);
  });

  it('expands built-in template when template id matches', () => {
    const p = loadPersona('Atlas', { template: 'italian-craftsperson' });
    expect(p.name).toBe('Atlas');
    expect(p.template).toBe('italian-craftsperson');
    expect(p.voice).toBe(ITALIAN_CRAFTSPERSON.voice);
    expect(p.traits).toEqual(ITALIAN_CRAFTSPERSON.traits);
  });

  it('uses rawPersona.name over agentName when provided', () => {
    const p = loadPersona('FallbackName', { name: 'Custom', template: 'italian-craftsperson' });
    expect(p.name).toBe('Custom');
  });

  it('falls back to agentName when rawPersona.name is missing', () => {
    const p = loadPersona('AgentX', { template: 'italian-craftsperson' });
    expect(p.name).toBe('AgentX');
  });

  it('allows overriding specific template fields', () => {
    const p = loadPersona('Agent', {
      template: 'italian-craftsperson',
      voice: 'Custom voice',
    });
    expect(p.voice).toBe('Custom voice');
    expect(p.traits).toEqual(ITALIAN_CRAFTSPERSON.traits);
  });

  it('uses blank persona base for unknown template', () => {
    const p = loadPersona('Agent', { template: 'unknown-template', voice: 'My voice' });
    expect(p.template).toBe('unknown-template');
    expect(p.voice).toBe('My voice');
    expect(p.traits).toEqual([]);
  });

  it('initializes history to empty array when not provided', () => {
    const p = loadPersona('Agent', { template: 'italian-craftsperson' });
    expect(p.history).toEqual([]);
  });

  it('preserves provided history', () => {
    const history = [{ archivedAt: '2024-01-01', config: { name: 'Old' } as never }];
    const p = loadPersona('Agent', { template: 'italian-craftsperson', history });
    expect(p.history).toBe(history);
  });

  it('does not override template with undefined rawPersona fields', () => {
    const p = loadPersona('Agent', {
      template: 'italian-craftsperson',
      culture: undefined,
    });
    expect(p.culture).toBe('Italian');
  });
});
