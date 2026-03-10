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
    return {
      enabled: this.config.enabled,
      watching: this.watchers.length > 0,
      watchPaths: this.config.watchPaths,
      detectorCount: this.detectors.length,
      pendingWarnings: this.pendingWarnings.length,
      surfacedPatterns: this.surfacedPatterns.length,
      fileChangesProcessed: this.changesProcessed,
    };
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
}
