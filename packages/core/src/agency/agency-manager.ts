/**
 * Agency Manager — proactive file watching, pattern surfacing, and warning detection.
 *
 * Orchestrates:
 * 1. File watcher (fs.watch with debouncing)
 * 2. Warning detectors (pluggable, domain-agnostic)
 * 3. Pattern surfacer (vault search on file changes)
 * 4. Clarifier (generate questions for ambiguous intent)
 *
 * Feature-flagged: disabled by default, opt-in via agency_enable.
 * Uses Node.js fs.watch — no dependencies.
 */

import { watch, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { FSWatcher } from 'node:fs';
import type { Vault } from '../vault/vault.js';
import type {
  AgencyConfig,
  AgencyStatus,
  FileChange,
  FileChangeListener,
  Warning,
  WarningDetector,
  SurfacedPattern,
  ClarificationQuestion,
  SuggestionRule,
  SuggestionContext,
  ProactiveSuggestion,
  RichClarificationQuestion,
  Notification,
} from './types.js';

// ─── Defaults ──────────────────────────────────────────────────────

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'];
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
];
const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_COOLDOWN_MS = 300_000; // 5 minutes
const DEFAULT_MIN_CONFIDENCE = 0.5;

// ─── Class ──────────────────────────────────────────────────────────

export class AgencyManager {
  private vault: Vault;
  private config: Required<AgencyConfig>;
  private watchers: FSWatcher[] = [];
  private detectors: WarningDetector[] = [];
  private changeListeners: FileChangeListener[] = [];
  private pendingWarnings: Warning[] = [];
  private surfacedPatterns: SurfacedPattern[] = [];
  private changesProcessed = 0;
  private cooldownMap = new Map<string, number>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Proactive intelligence (#211)
  private suggestionRules: SuggestionRule[] = [];
  private recentFiles: FileChange[] = [];
  private suppressedWarningIds = new Set<string>();
  private dismissedPatterns = new Map<string, number>(); // entryId → dismissedAt timestamp
  private dismissalTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private notificationQueue: Notification[] = [];

  constructor(vault: Vault, config?: AgencyConfig) {
    this.vault = vault;
    this.config = {
      enabled: config?.enabled ?? false,
      watchPaths: config?.watchPaths ?? ['.'],
      ignorePatterns: config?.ignorePatterns ?? DEFAULT_IGNORE,
      extensions: config?.extensions ?? DEFAULT_EXTENSIONS,
      debounceMs: config?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      minPatternConfidence: config?.minPatternConfidence ?? DEFAULT_MIN_CONFIDENCE,
      cooldownMs: config?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  enable(projectPath?: string): void {
    if (this.config.enabled) return;
    this.config.enabled = true;
    if (projectPath) this.startWatching(projectPath);
  }

  disable(): void {
    this.config.enabled = false;
    this.stopWatching();
  }

  getStatus(): AgencyStatus {
    return this.getFullStatus();
  }

  updateConfig(config: Partial<AgencyConfig>): void {
    Object.assign(this.config, config);
  }

  // ─── File Watching ──────────────────────────────────────────────

  startWatching(projectPath: string): void {
    this.stopWatching();
    for (const watchPath of this.config.watchPaths) {
      const fullPath = join(projectPath, watchPath);
      if (!existsSync(fullPath)) continue;

      try {
        const watcher = watch(fullPath, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          const filePath = join(fullPath, filename);
          if (this.shouldIgnore(filePath)) return;
          if (!this.hasValidExtension(filePath)) return;
          this.debounceChange(filePath);
        });
        this.watchers.push(watcher);
      } catch {
        // Directory may not support watching — skip
      }
    }
  }

  stopWatching(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  onFileChange(listener: FileChangeListener): void {
    this.changeListeners.push(listener);
  }

  // ─── Warning Detection ──────────────────────────────────────────

  registerDetector(detector: WarningDetector): void {
    this.detectors.push(detector);
  }

  scanFile(filePath: string): Warning[] {
    if (!existsSync(filePath)) return [];

    const ext = extname(filePath);
    const applicableDetectors = this.detectors.filter((d) => d.extensions.includes(ext));
    if (applicableDetectors.length === 0) return [];

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const warnings: Warning[] = [];
    for (const detector of applicableDetectors) {
      try {
        warnings.push(...detector.detect(filePath, content));
      } catch {
        // Detector failure is non-critical
      }
    }

    this.pendingWarnings.push(...warnings);
    return warnings;
  }

  getPendingWarnings(): Warning[] {
    return [...this.pendingWarnings];
  }

  clearWarnings(): void {
    this.pendingWarnings = [];
  }

  // ─── Pattern Surfacing ──────────────────────────────────────────

  surfacePatterns(filePath: string): SurfacedPattern[] {
    const now = Date.now();
    const lastSurfaced = this.cooldownMap.get(filePath);
    if (lastSurfaced && now - lastSurfaced < this.config.cooldownMs) return [];

    const ext = extname(filePath);
    const filename = filePath.split('/').pop() ?? '';

    // Build search query from file context
    const terms: string[] = [];
    if (ext === '.ts' || ext === '.tsx') terms.push('typescript');
    if (ext === '.css') terms.push('css', 'styling');
    if (ext === '.json') terms.push('configuration');
    if (filename.includes('test')) terms.push('testing');
    if (filename.includes('component')) terms.push('component');

    if (terms.length === 0) return [];

    const query = terms.join(' ');
    try {
      const results = this.vault.search(query, { limit: 5 });
      const patterns: SurfacedPattern[] = [];

      for (const r of results) {
        const relevance = r.score > 0 ? Math.min(1, r.score / (results[0]?.score || 1)) : 0;
        if (relevance < this.config.minPatternConfidence) continue;

        patterns.push({
          entryId: r.entry.id,
          title: r.entry.title,
          domain: r.entry.domain,
          relevance,
          trigger: filePath,
        });
      }

      if (patterns.length > 0) {
        this.cooldownMap.set(filePath, now);
        this.surfacedPatterns.push(...patterns);
      }

      return patterns;
    } catch {
      return [];
    }
  }

  getSurfacedPatterns(): SurfacedPattern[] {
    return [...this.surfacedPatterns];
  }

  clearSurfacedPatterns(): void {
    this.surfacedPatterns = [];
  }

  // ─── Clarification ──────────────────────────────────────────────

  generateClarification(prompt: string, confidence: number): ClarificationQuestion | null {
    if (confidence >= 0.7) return null; // High confidence — no need to clarify

    const words = prompt.toLowerCase().split(/\s+/);
    const hasAction = words.some((w) =>
      ['create', 'fix', 'build', 'add', 'remove', 'update', 'improve', 'deploy'].includes(w),
    );
    const hasTarget = words.length > 3;

    if (!hasAction && !hasTarget) {
      return {
        question: 'Could you clarify what you would like me to do? I need an action and a target.',
        reason: 'No clear action or target detected in the prompt.',
        options: [
          'Create something new',
          'Fix an existing issue',
          'Review or validate code',
          'Explore the codebase',
        ],
      };
    }

    if (!hasAction) {
      return {
        question: 'What action would you like me to take?',
        reason: 'The prompt describes a target but no clear action.',
        options: ['Build', 'Fix', 'Review', 'Improve', 'Deploy'],
      };
    }

    if (confidence < 0.3) {
      return {
        question: 'Could you provide more context about what you need?',
        reason: 'The prompt is too brief to determine intent reliably.',
      };
    }

    return null;
  }

  // ─── Private Helpers ────────────────────────────────────────────

  private debounceChange(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath);
        this.processChange(filePath);
      }, this.config.debounceMs),
    );
  }

  private processChange(filePath: string): void {
    this.changesProcessed++;

    const change: FileChange = {
      path: filePath,
      type: existsSync(filePath) ? 'modify' : 'delete',
      timestamp: Date.now(),
    };

    // Notify listeners
    for (const listener of this.changeListeners) {
      try {
        listener(change);
      } catch {
        // Listener failure is non-critical
      }
    }

    // Auto-scan for warnings if detectors are registered
    if (this.detectors.length > 0 && change.type !== 'delete') {
      this.scanFile(filePath);
    }

    // Auto-surface patterns
    this.surfacePatterns(filePath);
  }

  private shouldIgnore(filePath: string): boolean {
    return this.config.ignorePatterns.some((pattern) => filePath.includes(pattern));
  }

  private hasValidExtension(filePath: string): boolean {
    const ext = extname(filePath);
    return this.config.extensions.includes(ext);
  }

  // ─── Proactive Suggestions (#211) ──────────────────────────────────

  registerSuggestionRule(rule: SuggestionRule): void {
    this.suggestionRules.push(rule);
  }

  /**
   * Evaluate all suggestion rules and return triggered suggestions.
   */
  generateSuggestions(): ProactiveSuggestion[] {
    const context: SuggestionContext = {
      recentFiles: this.recentFiles.slice(-20),
      pendingWarnings: this.pendingWarnings,
      surfacedPatterns: this.surfacedPatterns,
      fileChangesProcessed: this.changesProcessed,
    };

    const suggestions: ProactiveSuggestion[] = [];
    for (const rule of this.suggestionRules) {
      try {
        if (rule.condition(context)) {
          suggestions.push(rule.generate(context));
        }
      } catch {
        // Rule failure is non-critical
      }
    }

    // Create notifications for suggestions
    for (const s of suggestions) {
      this.pushNotification('suggestion', s.title, s.description, s.priority);
    }

    return suggestions.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      return prio[a.priority] - prio[b.priority];
    });
  }

  // ─── Rich Clarification (#211) ─────────────────────────────────────

  generateRichClarification(prompt: string): RichClarificationQuestion[] {
    const questions: RichClarificationQuestion[] = [];

    // Ambiguous scope detection
    const scopeWords = ['everything', 'all', 'the whole', 'entire'];
    if (scopeWords.some((w) => prompt.toLowerCase().includes(w))) {
      questions.push({
        question: 'That sounds like a broad scope. Can you narrow it down?',
        reason: 'Broad requests often lead to unfocused work',
        urgency: 'recommended',
        options: [
          { label: 'Just the current file', description: 'Focus on what I have open' },
          { label: 'This module/directory', description: 'Scope to the current package' },
          {
            label: 'The full project',
            description: 'I really mean everything',
            implications: 'This may take significantly longer',
          },
        ],
      });
    }

    // Missing context detection
    const vagueVerbs = ['fix', 'improve', 'update', 'change'];
    const hasVagueVerb = vagueVerbs.some((v) => prompt.toLowerCase().startsWith(v));
    const isShort = prompt.split(/\s+/).length < 5;
    if (hasVagueVerb && isShort) {
      questions.push({
        question: 'Could you describe the specific problem or desired outcome?',
        reason: `"${prompt}" is ambiguous — different interpretations lead to different solutions`,
        urgency: 'blocking',
        options: [
          { label: "There's an error/bug", description: 'Something is broken' },
          { label: 'It works but needs improvement', description: 'Refactoring or enhancement' },
          { label: 'Add new behavior', description: 'Feature addition' },
        ],
      });
    }

    // Destructive operation detection
    const destructiveWords = ['delete', 'remove', 'drop', 'reset', 'wipe', 'purge'];
    if (destructiveWords.some((w) => prompt.toLowerCase().includes(w))) {
      questions.push({
        question: 'This sounds like a destructive operation. Are you sure?',
        reason: 'Destructive actions are hard to undo',
        urgency: 'blocking',
        options: [
          {
            label: 'Yes, proceed',
            description: 'I understand the consequences',
            recommended: false,
          },
          {
            label: 'Let me reconsider',
            description: 'Show me what would be affected first',
            recommended: true,
          },
        ],
      });
    }

    return questions;
  }

  // ─── Warning Suppression (#211) ────────────────────────────────────

  suppressWarning(warningId: string): void {
    this.suppressedWarningIds.add(warningId);
    this.pendingWarnings = this.pendingWarnings.filter((w) => w.id !== warningId);
  }

  unsuppressWarning(warningId: string): void {
    this.suppressedWarningIds.delete(warningId);
  }

  getSuppressedWarnings(): string[] {
    return [...this.suppressedWarningIds];
  }

  /**
   * Override getPendingWarnings to filter out suppressed.
   */
  getFilteredWarnings(): Warning[] {
    return this.pendingWarnings.filter((w) => !this.suppressedWarningIds.has(w.id));
  }

  // ─── Pattern Dismissal (#211) ──────────────────────────────────────

  dismissPattern(entryId: string): void {
    this.dismissedPatterns.set(entryId, Date.now());
    this.surfacedPatterns = this.surfacedPatterns.filter((p) => p.entryId !== entryId);
  }

  isDismissed(entryId: string): boolean {
    const dismissedAt = this.dismissedPatterns.get(entryId);
    if (!dismissedAt) return false;
    if (Date.now() - dismissedAt > this.dismissalTtlMs) {
      this.dismissedPatterns.delete(entryId);
      return false;
    }
    return true;
  }

  getActiveSurfacedPatterns(): SurfacedPattern[] {
    return this.surfacedPatterns.filter((p) => !this.isDismissed(p.entryId));
  }

  // ─── Notification Queue (#211) ─────────────────────────────────────

  pushNotification(
    type: Notification['type'],
    title: string,
    message: string,
    priority: Notification['priority'] = 'medium',
  ): void {
    this.notificationQueue.push({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      message,
      priority,
      createdAt: Date.now(),
    });
  }

  drainNotifications(): Notification[] {
    const notifications = [...this.notificationQueue];
    this.notificationQueue = [];
    return notifications.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 };
      return prio[a.priority] - prio[b.priority];
    });
  }

  getPendingNotificationCount(): number {
    return this.notificationQueue.length;
  }

  // ─── Extended Status (#211) ────────────────────────────────────────

  getFullStatus(): AgencyStatus {
    return {
      enabled: this.config.enabled,
      watching: this.watchers.length > 0,
      watchPaths: this.config.watchPaths,
      detectorCount: this.detectors.length,
      pendingWarnings: this.getFilteredWarnings().length,
      surfacedPatterns: this.getActiveSurfacedPatterns().length,
      fileChangesProcessed: this.changesProcessed,
      suggestionRuleCount: this.suggestionRules.length,
      suppressedWarnings: this.suppressedWarningIds.size,
      dismissedPatterns: this.dismissedPatterns.size,
      pendingNotifications: this.notificationQueue.length,
    };
  }
}
