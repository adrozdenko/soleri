/**
 * Scope detector — classifies knowledge entries into agent/project/team tiers.
 *
 * Uses weighted signal heuristics from content, category, tags, and title
 * to determine where an entry should live:
 * - agent: personal preferences, local config, workflow habits
 * - project: repo-specific patterns, architecture decisions, internal APIs
 * - team: universal patterns, language best practices, design principles
 */

export type ScopeTier = 'agent' | 'project' | 'team';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScopeSignal {
  tier: ScopeTier;
  source: 'content' | 'category' | 'tags' | 'title';
  indicator: string;
  weight: number;
}

export interface ScopeDetectionResult {
  tier: ScopeTier;
  confidence: ConfidenceLevel;
  reason: string;
  signals: ScopeSignal[];
}

export interface ScopeInput {
  title: string;
  description: string;
  category?: string;
  tags?: string[];
}

// ─── Signal patterns ─────────────────────────────────────────────────

const TEAM_CONTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; desc: string }> = [
  { pattern: /accessibility|a11y|aria-|screen\s+reader/i, weight: 0.85, desc: 'accessibility' },
  { pattern: /design\s+system|semantic\s+token/i, weight: 0.8, desc: 'design system' },
  { pattern: /contrast\s+ratio|wcag/i, weight: 0.85, desc: 'WCAG guidelines' },
  {
    pattern: /clean\s+code|solid\s+principle|dry|kiss/i,
    weight: 0.7,
    desc: 'clean code principles',
  },
  { pattern: /security|xss|csrf|injection|sanitiz/i, weight: 0.75, desc: 'security patterns' },
  { pattern: /performance|lazy\s+load|memoiz/i, weight: 0.6, desc: 'performance patterns' },
  { pattern: /type\s+safety|type\s+guard/i, weight: 0.55, desc: 'type safety' },
  { pattern: /error\s+handling|error\s+boundary/i, weight: 0.6, desc: 'error handling' },
  { pattern: /touch\s+target|tap\s+target|fitts/i, weight: 0.8, desc: 'UX touch targets' },
  { pattern: /focus\s+(ring|state|indicator)/i, weight: 0.8, desc: 'focus states' },
  { pattern: /best\s+practice|anti.?pattern/i, weight: 0.65, desc: 'best practice' },
];

const PROJECT_CONTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; desc: string }> = [
  { pattern: /@[\w-]+\/[\w-]+/, weight: 0.9, desc: 'scoped package (@org/pkg)' },
  { pattern: /packages\/[\w/-]+/, weight: 0.8, desc: 'monorepo path' },
  { pattern: /src\/[\w/-]+\.(ts|js|tsx|jsx)/, weight: 0.7, desc: 'project file path' },
  {
    pattern: /our\s+(project|codebase|team|repo)/i,
    weight: 0.75,
    desc: 'project-specific language',
  },
  { pattern: /this\s+(project|codebase|repository)/i, weight: 0.8, desc: 'explicit project ref' },
  { pattern: /internal\s+(api|service)/i, weight: 0.7, desc: 'internal service' },
  { pattern: /\.config\.(ts|js|mjs)/i, weight: 0.5, desc: 'config file reference' },
  { pattern: /localhost|127\.0\.0\.1/i, weight: 0.6, desc: 'local dev reference' },
];

const AGENT_CONTENT_PATTERNS: Array<{ pattern: RegExp; weight: number; desc: string }> = [
  { pattern: /I\s+prefer|my\s+workflow|my\s+setup/i, weight: 0.8, desc: 'personal preference' },
  { pattern: /~\/|\/Users\/|\/home\//i, weight: 0.7, desc: 'home directory path' },
  { pattern: /my\s+(editor|IDE|terminal|shell)/i, weight: 0.75, desc: 'personal tooling' },
  { pattern: /alias(es)?|shortcut/i, weight: 0.6, desc: 'personal aliases' },
  { pattern: /habit|routine|always\s+do/i, weight: 0.55, desc: 'personal habit' },
];

const TEAM_CATEGORIES = new Set([
  'styling',
  'accessibility',
  'performance',
  'security',
  'design',
  'methodology',
]);
const PROJECT_CATEGORIES = new Set([
  'monorepo',
  'prisma',
  'infrastructure',
  'deployment',
  'config',
]);

const TEAM_TAGS = new Set([
  'universal',
  'best-practice',
  'a11y',
  'accessibility',
  'wcag',
  'security',
  'performance',
  'clean-code',
  'design-system',
  'pattern',
  'principle',
]);
const PROJECT_TAGS = new Set([
  'project-specific',
  'internal',
  'monorepo',
  'infrastructure',
  'deployment',
]);
const AGENT_TAGS = new Set(['personal', 'preference', 'workflow', 'habit', 'local']);

// ─── Analysis functions ──────────────────────────────────────────────

function analyzeContent(text: string): ScopeSignal[] {
  const signals: ScopeSignal[] = [];

  for (const { pattern, weight, desc } of TEAM_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ tier: 'team', source: 'content', indicator: desc, weight });
    }
  }
  for (const { pattern, weight, desc } of PROJECT_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ tier: 'project', source: 'content', indicator: desc, weight });
    }
  }
  for (const { pattern, weight, desc } of AGENT_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      signals.push({ tier: 'agent', source: 'content', indicator: desc, weight });
    }
  }

  return signals;
}

function analyzeCategory(category: string): ScopeSignal[] {
  const norm = category.toLowerCase();
  if (TEAM_CATEGORIES.has(norm)) {
    return [{ tier: 'team', source: 'category', indicator: `category "${category}"`, weight: 0.7 }];
  }
  if (PROJECT_CATEGORIES.has(norm)) {
    return [
      { tier: 'project', source: 'category', indicator: `category "${category}"`, weight: 0.6 },
    ];
  }
  return [];
}

function analyzeTags(tags: string[]): ScopeSignal[] {
  const signals: ScopeSignal[] = [];
  for (const tag of tags) {
    const norm = tag.toLowerCase();
    if (TEAM_TAGS.has(norm)) {
      signals.push({ tier: 'team', source: 'tags', indicator: `tag "${tag}"`, weight: 0.8 });
    } else if (PROJECT_TAGS.has(norm)) {
      signals.push({ tier: 'project', source: 'tags', indicator: `tag "${tag}"`, weight: 0.8 });
    } else if (AGENT_TAGS.has(norm)) {
      signals.push({ tier: 'agent', source: 'tags', indicator: `tag "${tag}"`, weight: 0.8 });
    }
  }
  return signals;
}

function computeConfidence(scores: Record<ScopeTier, number>, winner: ScopeTier): ConfidenceLevel {
  const winScore = scores[winner];
  const others = Object.entries(scores)
    .filter(([t]) => t !== winner)
    .map(([, v]) => v);
  const runnerUp = Math.max(...others, 0);

  if (winScore === 0) return 'LOW';
  if (runnerUp === 0 && winScore >= 0.5) return 'HIGH';
  const ratio = winScore / (winScore + runnerUp);
  if (ratio >= 0.7 && winScore >= 1.0) return 'HIGH';
  if (ratio >= 0.55) return 'MEDIUM';
  return 'LOW';
}

// ─── Public API ──────────────────────────────────────────────────────

export function detectScope(input: ScopeInput): ScopeDetectionResult {
  const signals: ScopeSignal[] = [];
  const fullText = `${input.title} ${input.description}`;

  signals.push(...analyzeContent(fullText));
  if (input.category) signals.push(...analyzeCategory(input.category));
  if (input.tags?.length) signals.push(...analyzeTags(input.tags));

  const scores: Record<ScopeTier, number> = { agent: 0, project: 0, team: 0 };
  for (const s of signals) {
    scores[s.tier] += s.weight;
  }

  // Default to agent when no signals
  let winner: ScopeTier = 'agent';
  let maxScore = 0;
  for (const [tier, score] of Object.entries(scores) as Array<[ScopeTier, number]>) {
    if (score > maxScore) {
      maxScore = score;
      winner = tier;
    }
  }

  const confidence = computeConfidence(scores, winner);
  const topSignals = signals
    .filter((s) => s.tier === winner)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const reason =
    topSignals.length > 0
      ? topSignals.map((s) => s.indicator).join('; ')
      : 'No clear signals — defaulting to agent tier';

  return { tier: winner, confidence, reason, signals };
}
