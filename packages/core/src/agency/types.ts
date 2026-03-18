/**
 * Agency mode types — proactive file watching, pattern surfacing, warning detection.
 */

// ─── File Watching ──────────────────────────────────────────────────

export type ChangeType = 'create' | 'modify' | 'delete';

export interface FileChange {
  path: string;
  type: ChangeType;
  timestamp: number;
}

export type FileChangeListener = (change: FileChange) => void;

// ─── Warning Detection ──────────────────────────────────────────────

export type WarningSeverity = 'critical' | 'warning' | 'info';

export interface Warning {
  id: string;
  file: string;
  line?: number;
  severity: WarningSeverity;
  category: string;
  message: string;
  suggestion?: string;
}

/**
 * Pluggable warning detector. Agents define their own domain-specific detectors.
 */
export interface WarningDetector {
  /** Unique name for this detector. */
  name: string;
  /** File extensions this detector applies to (e.g., ['.ts', '.tsx']). */
  extensions: string[];
  /** Detect warnings in file content. */
  detect(filePath: string, content: string): Warning[];
}

// ─── Pattern Surfacing ──────────────────────────────────────────────

export interface SurfacedPattern {
  entryId: string;
  title: string;
  domain: string;
  relevance: number;
  trigger: string;
}

// ─── Clarification ──────────────────────────────────────────────────

export interface ClarificationQuestion {
  question: string;
  reason: string;
  options?: string[];
}

// ─── Agency Config ──────────────────────────────────────────────────

export interface AgencyConfig {
  /** Enable/disable agency mode. Default: false. */
  enabled?: boolean;
  /** Directories to watch (relative to project root). Default: ['.'] */
  watchPaths?: string[];
  /** Glob patterns to ignore. Default: common ignores. */
  ignorePatterns?: string[];
  /** File extensions to watch. Default: ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'] */
  extensions?: string[];
  /** Debounce interval in ms for file change batching. Default: 300. */
  debounceMs?: number;
  /** Minimum confidence to surface a pattern. Default: 0.5. */
  minPatternConfidence?: number;
  /** Cooldown per file path (ms) before re-surfacing. Default: 300000 (5 min). */
  cooldownMs?: number;
}

export interface AgencyStatus {
  enabled: boolean;
  watching: boolean;
  watchPaths: string[];
  detectorCount: number;
  pendingWarnings: number;
  surfacedPatterns: number;
  fileChangesProcessed: number;
  suggestionRuleCount: number;
  suppressedWarnings: number;
  dismissedPatterns: number;
  pendingNotifications: number;
}

// ─── Proactive Suggestions (#211) ────────────────────────────────────

export interface SuggestionRule {
  /** Unique name for this rule. */
  name: string;
  /** Human description of what this rule detects. */
  description: string;
  /** Condition: returns true if this rule should fire. */
  condition(context: SuggestionContext): boolean;
  /** Generate a suggestion when condition is true. */
  generate(context: SuggestionContext): ProactiveSuggestion;
}

export interface SuggestionContext {
  recentFiles: FileChange[];
  pendingWarnings: Warning[];
  surfacedPatterns: SurfacedPattern[];
  fileChangesProcessed: number;
}

export interface ProactiveSuggestion {
  rule: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action?: string;
}

// ─── Rich Clarification (#211) ───────────────────────────────────────

export type ClarificationUrgency = 'blocking' | 'recommended' | 'optional';

export interface ClarificationOption {
  label: string;
  description?: string;
  implications?: string;
  recommended?: boolean;
}

export interface RichClarificationQuestion {
  question: string;
  reason: string;
  urgency: ClarificationUrgency;
  options?: ClarificationOption[];
}

// ─── Notifications (#211) ────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'suggestion' | 'warning' | 'pattern';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
}
