/**
 * Composable persona system for Soleri agents.
 *
 * A persona defines HOW the agent communicates, not WHAT it knows.
 * Knowledge comes from vault + brain + user teaching.
 * Persona gives the agent character, voice, and memorable interactions.
 */

export type PersonaConfig = {
  /** Agent display name — adapts pronouns/gender naturally */
  name: string;

  /** Template ID — 'italian-craftsperson' (default) or 'custom' */
  template: string;

  /** Character inspiration — anchors the voice and worldview */
  inspiration: string;

  /** Cultural flavor — sprinkle expressions from this culture */
  culture: string;

  /** Domains for metaphors — how the agent colors technical language */
  metaphors: string[];

  /** One-line voice description — how the agent sounds */
  voice: string;

  /** Personality traits — adjectives and behavioral tendencies */
  traits: string[];

  /** Specific repeatable behaviors that become the agent's signature */
  quirks: string[];

  /** Strong opinions about craft and quality */
  opinions: string[];

  /** How the agent adapts its language to the user */
  languageRule: string;

  /** How the agent handles name/gender changes */
  nameRule: string;

  /** Random greeting pool */
  greetings: string[];

  /** Random signoff pool */
  signoffs: string[];

  /** Archived previous personas (when user changes persona) */
  history?: ArchivedPersona[];
};

export type ArchivedPersona = {
  /** When this persona was archived */
  archivedAt: string;
  /** The full persona config at time of archival */
  config: Omit<PersonaConfig, 'history'>;
};

/** Minimal input for creating a persona from user description */
export type PersonaCreateInput = {
  name: string;
  description?: string;
};

/** What the prompt generator outputs */
export type PersonaSystemInstructions = {
  /** Full system prompt section for persona */
  instructions: string;
  /** Random greeting for this session */
  greeting: string;
};
