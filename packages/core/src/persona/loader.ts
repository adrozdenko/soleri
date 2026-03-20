import type { PersonaConfig } from './types.js';
import { PERSONA_TEMPLATES } from './defaults.js';

/** A blank persona — agent works without character until user configures one */
const BLANK_PERSONA: Omit<PersonaConfig, 'name' | 'history'> = {
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

/**
 * Load persona from agent config.
 *
 * - Full persona: block in agent.yaml → use as-is
 * - Template reference → expand from built-in templates
 * - No persona block → blank persona (user prompted on activate)
 */
export function loadPersona(agentName: string, rawPersona?: Partial<PersonaConfig>): PersonaConfig {
  // No persona config at all → blank (user will be prompted)
  if (!rawPersona) {
    return { ...BLANK_PERSONA, name: agentName };
  }

  // Has a template reference → expand from built-in
  const templateId = rawPersona.template ?? 'none';
  const template = PERSONA_TEMPLATES[templateId];

  if (template) {
    return {
      ...template,
      name: rawPersona.name ?? agentName,
      ...stripUndefined(rawPersona),
      history: rawPersona.history ?? [],
    };
  }

  // Custom template or full config — fill in gaps from blank
  return {
    ...BLANK_PERSONA,
    name: rawPersona.name ?? agentName,
    ...stripUndefined(rawPersona),
    history: rawPersona.history ?? [],
  };
}

/** Remove undefined keys so spread doesn't overwrite template values */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}
