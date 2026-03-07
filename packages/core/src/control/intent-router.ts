/**
 * IntentRouter — Keyword-based intent classification and operational mode management.
 *
 * Follows the Curator/BrainIntelligence pattern: separate class, own SQLite
 * tables, takes Vault as constructor dep. All methods synchronous (better-sqlite3).
 *
 * 10 default modes seeded on first use via INSERT OR IGNORE.
 * Agents can register custom modes at runtime.
 */

import type { Vault } from '../vault/vault.js';
import type { PersistenceProvider } from '../persistence/types.js';
import type {
  IntentType,
  OperationalMode,
  IntentClassification,
  ModeConfig,
  MorphResult,
} from './types.js';

// ─── Default Mode Definitions ───────────────────────────────────────

const DEFAULT_MODES: ModeConfig[] = [
  {
    mode: 'BUILD-MODE',
    intent: 'build',
    description: 'Creating new components, features, or scaffolding',
    behaviorRules: ['Focus on clean architecture', 'Follow existing patterns', 'Write tests'],
    keywords: ['build', 'create', 'add', 'implement', 'scaffold', 'generate', 'new', 'feature'],
  },
  {
    mode: 'FIX-MODE',
    intent: 'fix',
    description: 'Fixing bugs, errors, and broken behavior',
    behaviorRules: ['Identify root cause first', 'Verify fix with tests', 'Check for regressions'],
    keywords: ['fix', 'bug', 'broken', 'error', 'crash', 'issue', 'debug', 'repair', 'janky'],
  },
  {
    mode: 'VALIDATE-MODE',
    intent: 'validate',
    description: 'Validating, checking, verifying, and testing code',
    behaviorRules: ['Be thorough', 'Check edge cases', 'Report all findings'],
    keywords: ['validate', 'check', 'verify', 'test', 'lint', 'audit'],
  },
  {
    mode: 'DESIGN-MODE',
    intent: 'design',
    description: 'Visual design, styling, layout, and color decisions',
    behaviorRules: ['Use semantic tokens', 'Check contrast ratios', 'Follow design system'],
    keywords: ['design', 'style', 'layout', 'color', 'typography', 'spacing', 'visual', 'ui'],
  },
  {
    mode: 'IMPROVE-MODE',
    intent: 'improve',
    description: 'Refactoring, optimization, and code enhancement',
    behaviorRules: ['Measure before optimizing', 'Keep changes minimal', 'Preserve behavior'],
    keywords: ['improve', 'refactor', 'optimize', 'clean', 'enhance', 'simplify', 'faster'],
  },
  {
    mode: 'DELIVER-MODE',
    intent: 'deliver',
    description: 'Deploying, shipping, releasing, and publishing',
    behaviorRules: ['Run all checks first', 'Update changelog', 'Tag releases properly'],
    keywords: ['deploy', 'ship', 'release', 'publish', 'merge', 'pr', 'push', 'package'],
  },
  {
    mode: 'EXPLORE-MODE',
    intent: 'explore',
    description: 'Exploring, searching, and understanding the codebase',
    behaviorRules: ['Be thorough in search', 'Provide context', 'Map dependencies'],
    keywords: ['explore', 'search', 'find', 'show', 'list', 'explain'],
  },
  {
    mode: 'PLAN-MODE',
    intent: 'plan',
    description: 'Planning, architecting, and strategy development',
    behaviorRules: ['Consider trade-offs', 'Break into steps', 'Identify risks'],
    keywords: ['plan', 'architect', 'strategy', 'approach', 'roadmap'],
  },
  {
    mode: 'REVIEW-MODE',
    intent: 'review',
    description: 'Code review, feedback, and quality assessment',
    behaviorRules: ['Be constructive', 'Focus on high-impact issues', 'Suggest alternatives'],
    keywords: ['review', 'feedback', 'critique', 'assess', 'evaluate', 'quality'],
  },
  {
    mode: 'GENERAL-MODE',
    intent: 'general',
    description: 'General-purpose fallback mode',
    behaviorRules: ['Be helpful', 'Ask clarifying questions when needed'],
    keywords: [],
  },
];

// ─── Class ──────────────────────────────────────────────────────────

export class IntentRouter {
  private vault: Vault;
  private provider: PersistenceProvider;
  private currentMode: OperationalMode = 'GENERAL-MODE';

  constructor(vault: Vault) {
    this.vault = vault;
    this.provider = vault.getProvider();
    this.initializeTables();
    this.seedDefaultModes();
  }

  // ─── Table Initialization ───────────────────────────────────────────

  private initializeTables(): void {
    this.provider.execSql(`
      CREATE TABLE IF NOT EXISTS agent_modes (
        mode TEXT PRIMARY KEY,
        intent TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        behavior_rules TEXT NOT NULL DEFAULT '[]',
        keywords TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS agent_routing_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        intent TEXT NOT NULL,
        mode TEXT NOT NULL,
        confidence REAL NOT NULL,
        matched_keywords TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  private seedDefaultModes(): void {
    this.provider.transaction(() => {
      for (const m of DEFAULT_MODES) {
        this.provider.run(
          `INSERT OR IGNORE INTO agent_modes (mode, intent, description, behavior_rules, keywords)
           VALUES (?, ?, ?, ?, ?)`,
          [
            m.mode,
            m.intent,
            m.description,
            JSON.stringify(m.behaviorRules),
            JSON.stringify(m.keywords),
          ],
        );
      }
    });
  }

  // ─── Intent Classification ──────────────────────────────────────────

  routeIntent(prompt: string): IntentClassification {
    const tokens = new Set(prompt.toLowerCase().split(/\s+/).filter(Boolean));
    const modes = this.getModes();

    let bestMode: ModeConfig | null = null;
    let bestMatchCount = 0;
    let bestMatchedKeywords: string[] = [];

    for (const mode of modes) {
      if (mode.keywords.length === 0) continue;
      const matched = mode.keywords.filter((kw) => tokens.has(kw));
      if (matched.length > bestMatchCount) {
        bestMatchCount = matched.length;
        bestMode = mode;
        bestMatchedKeywords = matched;
      }
    }

    if (!bestMode || bestMatchCount === 0) {
      const classification: IntentClassification = {
        intent: 'general',
        mode: 'GENERAL-MODE',
        confidence: 0,
        method: 'keyword',
        matchedKeywords: [],
      };
      this.logRouting(prompt, classification);
      this.currentMode = 'GENERAL-MODE';
      return classification;
    }

    const confidence = Math.min(bestMatchCount / bestMode.keywords.length, 1.0);
    const classification: IntentClassification = {
      intent: bestMode.intent,
      mode: bestMode.mode,
      confidence,
      method: 'keyword',
      matchedKeywords: bestMatchedKeywords,
    };

    this.logRouting(prompt, classification);
    this.currentMode = bestMode.mode;
    return classification;
  }

  private logRouting(prompt: string, classification: IntentClassification): void {
    this.provider.run(
      `INSERT INTO agent_routing_log (prompt, intent, mode, confidence, matched_keywords)
       VALUES (?, ?, ?, ?, ?)`,
      [
        prompt,
        classification.intent,
        classification.mode,
        classification.confidence,
        JSON.stringify(classification.matchedKeywords),
      ],
    );
  }

  // ─── Mode Management ───────────────────────────────────────────────

  morph(mode: OperationalMode): MorphResult {
    const row = this.provider.get<ModeRow>('SELECT * FROM agent_modes WHERE mode = ?', [mode]);

    if (!row) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    const previousMode = this.currentMode;
    this.currentMode = mode;
    const behaviorRules = JSON.parse(row.behavior_rules) as string[];

    return { previousMode, currentMode: mode, behaviorRules };
  }

  getCurrentMode(): OperationalMode {
    return this.currentMode;
  }

  getBehaviorRules(mode?: OperationalMode): string[] {
    const target = mode ?? this.currentMode;
    const row = this.provider.get<{ behavior_rules: string }>(
      'SELECT behavior_rules FROM agent_modes WHERE mode = ?',
      [target],
    );

    if (!row) return [];
    return JSON.parse(row.behavior_rules) as string[];
  }

  getModes(): ModeConfig[] {
    const rows = this.provider.all<ModeRow>('SELECT * FROM agent_modes ORDER BY mode');
    return rows.map(rowToModeConfig);
  }

  registerMode(config: ModeConfig): void {
    this.provider.run(
      `INSERT OR REPLACE INTO agent_modes (mode, intent, description, behavior_rules, keywords)
       VALUES (?, ?, ?, ?, ?)`,
      [
        config.mode,
        config.intent,
        config.description,
        JSON.stringify(config.behaviorRules),
        JSON.stringify(config.keywords),
      ],
    );
  }

  updateModeRules(mode: OperationalMode, rules: string[]): void {
    const result = this.provider.run('UPDATE agent_modes SET behavior_rules = ? WHERE mode = ?', [
      JSON.stringify(rules),
      mode,
    ]);
    if (result.changes === 0) {
      throw new Error(`Unknown mode: ${mode}`);
    }
  }

  // ─── Analytics ──────────────────────────────────────────────────────

  getRoutingStats(): {
    totalRouted: number;
    byIntent: Record<string, number>;
    byMode: Record<string, number>;
  } {
    const total = this.provider.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM agent_routing_log',
    )!.count;

    const intentRows = this.provider.all<{ intent: string; count: number }>(
      'SELECT intent, COUNT(*) as count FROM agent_routing_log GROUP BY intent',
    );
    const byIntent: Record<string, number> = {};
    for (const row of intentRows) {
      byIntent[row.intent] = row.count;
    }

    const modeRows = this.provider.all<{ mode: string; count: number }>(
      'SELECT mode, COUNT(*) as count FROM agent_routing_log GROUP BY mode',
    );
    const byMode: Record<string, number> = {};
    for (const row of modeRows) {
      byMode[row.mode] = row.count;
    }

    return { totalRouted: total, byIntent, byMode };
  }
}

// ─── Internal Row Types ─────────────────────────────────────────────

interface ModeRow {
  mode: string;
  intent: string;
  description: string;
  behavior_rules: string;
  keywords: string;
}

// ─── Row Converters ─────────────────────────────────────────────────

function rowToModeConfig(row: ModeRow): ModeConfig {
  return {
    mode: row.mode as OperationalMode,
    intent: row.intent as IntentType,
    description: row.description,
    behaviorRules: JSON.parse(row.behavior_rules) as string[],
    keywords: JSON.parse(row.keywords) as string[],
  };
}
