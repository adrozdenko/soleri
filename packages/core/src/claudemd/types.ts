/**
 * Types for CLAUDE.md auto-composition and injection.
 */

/** Agent metadata for CLAUDE.md generation */
export interface AgentMeta {
  id: string;
  name: string;
  activationPhrase: string;
  deactivationPhrase: string;
  activateCommand: string;
  deactivateCommand: string;
  /** Global instruction sections (priority-sorted, lower = higher) */
  globalInstructions?: GlobalInstruction[];
}

/** A standalone section in CLAUDE.md not tied to a facade */
export interface GlobalInstruction {
  heading: string;
  content: string;
  priority?: number;
}

/** Facade instructions for CLAUDE.md behavioral rules */
export interface FacadeInstructions {
  heading: string;
  rules?: string[];
  templates?: Record<string, string>;
  priority?: number;
  keyOps?: string[];
}

/** Result of an injection or removal operation */
export interface InjectionResult {
  success: boolean;
  action: 'injected' | 'replaced' | 'skipped' | 'error';
  message: string;
  diffDetected?: boolean;
}

export interface RemovalResult {
  success: boolean;
  action: 'removed' | 'not_present' | 'error';
  message: string;
}
