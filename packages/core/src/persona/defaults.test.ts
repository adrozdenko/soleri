import { describe, it, expect } from 'vitest';
import {
  ITALIAN_CRAFTSPERSON,
  NEUTRAL_PERSONA,
  PERSONA_TEMPLATES,
  createDefaultPersona,
} from './defaults.js';

describe('ITALIAN_CRAFTSPERSON', () => {
  it('uses italian-craftsperson template id', () => {
    expect(ITALIAN_CRAFTSPERSON.template).toBe('italian-craftsperson');
  });

  it('has non-empty voice, culture, and inspiration', () => {
    expect(ITALIAN_CRAFTSPERSON.voice.length).toBeGreaterThan(0);
    expect(ITALIAN_CRAFTSPERSON.culture).toBe('Italian');
    expect(ITALIAN_CRAFTSPERSON.inspiration.length).toBeGreaterThan(0);
  });

  it('provides greetings and signoffs pools', () => {
    expect(ITALIAN_CRAFTSPERSON.greetings.length).toBeGreaterThan(0);
    expect(ITALIAN_CRAFTSPERSON.signoffs.length).toBeGreaterThan(0);
  });

  it('includes expected trait and quirk arrays', () => {
    expect(ITALIAN_CRAFTSPERSON.traits.length).toBeGreaterThan(0);
    expect(ITALIAN_CRAFTSPERSON.quirks.length).toBeGreaterThan(0);
    expect(ITALIAN_CRAFTSPERSON.metaphors.length).toBeGreaterThan(0);
    expect(ITALIAN_CRAFTSPERSON.opinions.length).toBeGreaterThan(0);
  });
});

describe('NEUTRAL_PERSONA', () => {
  it('uses neutral-custom template id', () => {
    expect(NEUTRAL_PERSONA.template).toBe('neutral-custom');
  });

  it('has non-empty voice and inspiration', () => {
    expect(NEUTRAL_PERSONA.voice.length).toBeGreaterThan(0);
    expect(NEUTRAL_PERSONA.inspiration.length).toBeGreaterThan(0);
  });

  it('has no cultural flavor', () => {
    expect(NEUTRAL_PERSONA.culture).toBe('');
  });

  it('has all arrays populated with minimum counts', () => {
    expect(NEUTRAL_PERSONA.traits.length).toBeGreaterThanOrEqual(3);
    expect(NEUTRAL_PERSONA.quirks.length).toBeGreaterThanOrEqual(3);
    expect(NEUTRAL_PERSONA.opinions.length).toBeGreaterThanOrEqual(3);
    expect(NEUTRAL_PERSONA.metaphors.length).toBeGreaterThanOrEqual(3);
    expect(NEUTRAL_PERSONA.greetings.length).toBeGreaterThanOrEqual(2);
    expect(NEUTRAL_PERSONA.signoffs.length).toBeGreaterThanOrEqual(2);
  });

  it('has non-empty language and name rules', () => {
    expect(NEUTRAL_PERSONA.languageRule.length).toBeGreaterThan(0);
    expect(NEUTRAL_PERSONA.nameRule.length).toBeGreaterThan(0);
  });
});

describe('PERSONA_TEMPLATES', () => {
  it('contains italian-craftsperson entry', () => {
    expect(PERSONA_TEMPLATES['italian-craftsperson']).toBe(ITALIAN_CRAFTSPERSON);
  });

  it('contains neutral-custom entry', () => {
    expect(PERSONA_TEMPLATES['neutral-custom']).toBe(NEUTRAL_PERSONA);
  });

  it('does not include name or history in template entries', () => {
    for (const tmpl of Object.values(PERSONA_TEMPLATES)) {
      expect(tmpl).not.toHaveProperty('name');
      expect(tmpl).not.toHaveProperty('history');
    }
  });
});

describe('createDefaultPersona', () => {
  it('creates a full PersonaConfig with given name', () => {
    const p = createDefaultPersona('TestAgent');
    expect(p.name).toBe('TestAgent');
    expect(p.template).toBe('italian-craftsperson');
    expect(p.voice).toBe(ITALIAN_CRAFTSPERSON.voice);
  });

  it('spreads all template fields into the result', () => {
    const p = createDefaultPersona('A');
    expect(p.traits).toEqual(ITALIAN_CRAFTSPERSON.traits);
    expect(p.greetings).toEqual(ITALIAN_CRAFTSPERSON.greetings);
    expect(p.culture).toBe(ITALIAN_CRAFTSPERSON.culture);
  });
});
