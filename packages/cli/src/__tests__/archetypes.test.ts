import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../prompts/archetypes.js';
import {
  CORE_SKILLS,
  SKILL_CATEGORIES,
  DOMAIN_OPTIONS,
  PRINCIPLE_CATEGORIES,
} from '../prompts/playbook.js';

const allDomainValues = DOMAIN_OPTIONS.map((d) => d.value);
const allPrincipleValues = PRINCIPLE_CATEGORIES.flatMap((c) => c.options.map((o) => o.value));
const allOptionalSkillValues = SKILL_CATEGORIES.flatMap((c) => c.options.map((o) => o.value));

describe('Archetypes', () => {
  it('should have unique values', () => {
    const values = ARCHETYPES.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('should all have tier field', () => {
    for (const a of ARCHETYPES) {
      expect(a.tier).toMatch(/^(free|premium)$/);
    }
  });

  it('should have at least 9 archetypes', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(9);
  });

  it('should reference only valid domains', () => {
    for (const a of ARCHETYPES) {
      for (const d of a.defaults.domains) {
        expect(allDomainValues).toContain(d);
      }
    }
  });

  it('should reference only valid principles', () => {
    for (const a of ARCHETYPES) {
      for (const pr of a.defaults.principles) {
        expect(allPrincipleValues).toContain(pr);
      }
    }
  });

  it('should not include core skills in archetype skills', () => {
    const coreSet = new Set<string>(CORE_SKILLS);
    for (const a of ARCHETYPES) {
      for (const s of a.defaults.skills) {
        expect(coreSet.has(s)).toBe(false);
      }
    }
  });

  it('should reference only valid optional skills', () => {
    for (const a of ARCHETYPES) {
      for (const s of a.defaults.skills) {
        expect(allOptionalSkillValues).toContain(s);
      }
    }
  });

  it('should include Accessibility Guardian', () => {
    expect(ARCHETYPES.find((a) => a.value === 'accessibility-guardian')).toBeDefined();
  });

  it('should include Documentation Writer', () => {
    expect(ARCHETYPES.find((a) => a.value === 'documentation-writer')).toBeDefined();
  });
});

describe('Core Skills', () => {
  it('should include writing-plans and executing-plans', () => {
    expect(CORE_SKILLS).toContain('writing-plans');
    expect(CORE_SKILLS).toContain('executing-plans');
  });

  it('should not appear in optional skill categories', () => {
    const coreSet = new Set<string>(CORE_SKILLS);
    for (const s of allOptionalSkillValues) {
      expect(coreSet.has(s)).toBe(false);
    }
  });
});
