import type { PersonaConfig } from './types.js';
import { createDefaultPersona, PERSONA_TEMPLATES } from './defaults.js';

/**
 * Load persona from agent config, falling back to default Italian Craftsperson.
 *
 * Handles three cases:
 * 1. Full persona: block in agent.yaml → use as-is
 * 2. Template reference only → expand from built-in templates
 * 3. No persona block at all → create default with agent name
 */
export function loadPersona(agentName: string, rawPersona?: Partial<PersonaConfig>): PersonaConfig {
  // No persona config at all → full default
  if (!rawPersona) {
    return createDefaultPersona(agentName);
  }

  // Has a template reference → expand from built-in, merge overrides
  const templateId = rawPersona.template ?? 'italian-craftsperson';
  const template = PERSONA_TEMPLATES[templateId];

  if (template) {
    return {
      ...template,
      name: rawPersona.name ?? agentName,
      ...stripUndefined(rawPersona),
      // Preserve history if present
      history: rawPersona.history ?? [],
    };
  }

  // Custom template or full config — fill in any gaps from default
  const defaults = createDefaultPersona(rawPersona.name ?? agentName);
  return {
    ...defaults,
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
