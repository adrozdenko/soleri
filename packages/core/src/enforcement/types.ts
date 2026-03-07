/**
 * Host-agnostic enforcement declarations.
 *
 * Agents declare rules abstractly; host adapters translate
 * to platform-specific enforcement (Claude Code hooks, Cursor rules, etc.)
 */

/** When the rule should trigger */
export type EnforcementTrigger =
  | 'pre-tool-use' // Before a tool executes (e.g., PreToolUse hook)
  | 'post-tool-use' // After a tool executes
  | 'pre-commit' // Before git commit
  | 'pre-compact' // Before context compaction
  | 'session-start' // On session initialization
  | 'on-save'; // On file save

/** What happens when a rule matches */
export type EnforcementAction = 'block' | 'warn' | 'suggest';

/** A single enforcement rule declared by the agent */
export interface EnforcementRule {
  id: string;
  description: string;
  trigger: EnforcementTrigger;
  /** Regex pattern to match (in file content, tool args, etc.) */
  pattern?: string;
  /** Context filter — only applies when this context is active */
  context?: string;
  /** What to do on match */
  action: EnforcementAction;
  /** Message shown to user/LLM when triggered */
  message: string;
  /** Whether this rule is enabled (default: true) */
  enabled?: boolean;
}

/** Complete enforcement config for an agent */
export interface EnforcementConfig {
  rules: EnforcementRule[];
}

/** Result of translating rules for a specific host */
export interface HostAdapterResult {
  host: string;
  files: Array<{ path: string; content: string }>;
  skipped: Array<{ ruleId: string; reason: string }>;
}

/** Host adapter interface — translates abstract rules to host-specific config */
export interface HostAdapter {
  readonly host: string;
  /** Check if this adapter supports a given trigger type */
  supports(trigger: EnforcementTrigger): boolean;
  /** Translate rules to host-specific config files */
  translate(config: EnforcementConfig): HostAdapterResult;
}
