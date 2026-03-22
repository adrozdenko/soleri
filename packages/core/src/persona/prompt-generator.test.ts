import { describe, it, expect } from 'vitest';
import { generatePersonaInstructions, getRandomSignoff } from './prompt-generator.js';
import type { PersonaConfig } from './types.js';
import { createDefaultPersona } from './defaults.js';

function makeBlankPersona(name = 'TestBot'): PersonaConfig {
  return {
    name,
    template: 'none',
    inspiration: '',
    culture: '',
    metaphors: [],
    voice: '',
    traits: [],
    quirks: [],
    opinions: [],
    languageRule: '',
    nameRule: '',
    greetings: [],
    signoffs: [],
  };
}

describe('generatePersonaInstructions', () => {
  it('returns generic instructions for blank persona', () => {
    const blank = makeBlankPersona('BlankBot');
    const result = generatePersonaInstructions(blank);
    expect(result.instructions).toContain('BlankBot');
    expect(result.instructions).toContain('No persona configured');
    expect(result.greeting).toContain('BlankBot');
  });

  it('generates full instructions for a configured persona', () => {
    const persona = createDefaultPersona('Artisan');
    const result = generatePersonaInstructions(persona);

    expect(result.instructions).toContain('# Persona: Artisan');
    expect(result.instructions).toContain('## Voice');
    expect(result.instructions).toContain('## Personality Traits');
    expect(result.instructions).toContain('## Character Quirks');
    expect(result.instructions).toContain('## Cultural Texture');
    expect(result.instructions).toContain('## Metaphor Domain');
    expect(result.instructions).toContain('## Opinions');
    expect(result.instructions).toContain('## Identity Persistence');
    expect(result.instructions).toContain('## Important');
  });

  it('includes inspiration when present', () => {
    const persona = createDefaultPersona('A');
    const result = generatePersonaInstructions(persona);
    expect(result.instructions).toContain('inspired by');
  });

  it('omits sections when arrays are empty', () => {
    const persona: PersonaConfig = {
      ...makeBlankPersona('Minimal'),
      template: 'custom',
      voice: 'Calm',
    };
    const result = generatePersonaInstructions(persona);
    expect(result.instructions).not.toContain('## Personality Traits');
    expect(result.instructions).not.toContain('## Character Quirks');
    expect(result.instructions).not.toContain('## Metaphor Domain');
    expect(result.instructions).not.toContain('## Opinions');
  });

  it('omits cultural section when culture is empty', () => {
    const persona: PersonaConfig = {
      ...makeBlankPersona(),
      template: 'custom',
      voice: 'Direct',
    };
    const result = generatePersonaInstructions(persona);
    expect(result.instructions).not.toContain('## Cultural Texture');
  });

  it('omits identity persistence when nameRule is empty', () => {
    const persona: PersonaConfig = {
      ...makeBlankPersona(),
      template: 'custom',
      voice: 'Direct',
      nameRule: '',
    };
    const result = generatePersonaInstructions(persona);
    expect(result.instructions).not.toContain('## Identity Persistence');
  });

  it('picks greeting from pool when available', () => {
    const persona: PersonaConfig = {
      ...makeBlankPersona(),
      template: 'custom',
      voice: 'Warm',
      greetings: ['Ciao!'],
    };
    const result = generatePersonaInstructions(persona);
    expect(result.greeting).toBe('Ciao!');
  });

  it('falls back to generic greeting when pool is empty', () => {
    const persona: PersonaConfig = {
      ...makeBlankPersona('NoGreet'),
      template: 'custom',
      voice: 'Cool',
      greetings: [],
    };
    const result = generatePersonaInstructions(persona);
    expect(result.greeting).toContain('NoGreet');
  });
});

describe('getRandomSignoff', () => {
  it('returns a signoff from the pool', () => {
    const persona = createDefaultPersona('Agent');
    const signoff = getRandomSignoff(persona);
    expect(persona.signoffs).toContain(signoff);
  });

  it('returns fallback when signoffs array is empty', () => {
    const persona = makeBlankPersona();
    expect(getRandomSignoff(persona)).toBe('Until next time!');
  });

  it('returns the only signoff when pool has one entry', () => {
    const persona: PersonaConfig = { ...makeBlankPersona(), signoffs: ['Bye!'] };
    expect(getRandomSignoff(persona)).toBe('Bye!');
  });
});
