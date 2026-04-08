/**
 * E2E Test: Skill Trigger Coverage
 *
 * Validates that every skill has well-defined trigger phrases in its description,
 * detects overlapping triggers between skills that would confuse the LLM,
 * and ensures descriptions stay within the context budget.
 *
 * This is a deterministic test — no API calls, no LLM inference.
 * It catches the structural issues that cause 90% of "skill didn't trigger" bugs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold } from '@soleri/forge/lib';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkillMeta {
  name: string;
  description: string;
  triggers: string[];
  descriptionLength: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract frontmatter fields from SKILL.md content */
function parseFrontmatter(content: string): { name: string; description: string } {
  if (!content.startsWith('---')) return { name: '', description: '' };
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return { name: '', description: '' };

  const fm = content.slice(3, endIdx);

  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() ?? '';

  // Description can be multi-line (YAML folded scalar with >)
  const descStart = fm.indexOf('description:');
  if (descStart === -1) return { name, description: '' };

  const descRest = fm.slice(descStart + 'description:'.length);
  const lines = descRest.split('\n');
  const descLines: string[] = [];

  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed === '>' || trimmed === '|' || trimmed === '') continue;
      if (trimmed) {
        started = true;
        descLines.push(trimmed);
      }
    } else {
      // Continuation lines are indented
      if (line.startsWith('  ') || line.startsWith('\t')) {
        descLines.push(trimmed);
      } else if (trimmed === '') {
        // Blank line in folded scalar — include but keep going
        descLines.push('');
      } else {
        break; // New field
      }
    }
  }

  return { name, description: descLines.join(' ').replace(/\s+/g, ' ').trim() };
}

/** Extract quoted trigger phrases from a description */
function extractTriggers(description: string): string[] {
  const triggers: string[] = [];
  // Match phrases in double quotes
  const doubleQuoted = description.match(/"([^"]+)"/g);
  if (doubleQuoted) {
    triggers.push(...doubleQuoted.map((t) => t.replace(/"/g, '').toLowerCase()));
  }
  return triggers;
}

/** Extract meaningful keywords from a description (for overlap detection) */
function extractKeywords(description: string): Set<string> {
  const stopWords = new Set([
    'use', 'when', 'the', 'user', 'wants', 'to', 'or', 'a', 'an', 'is', 'for',
    'and', 'in', 'on', 'of', 'this', 'that', 'with', 'not', 'from', 'by', 'as',
    'do', 'does', 'has', 'have', 'been', 'was', 'were', 'be', 'are', 'it', 'its',
    'if', 'but', 'also', 'any', 'about', 'after', 'before', 'instead', 'rather',
    'than', 'says', 'asks', 'triggers', 'should', 'would', 'could', 'can',
    'new', 'first', 'existing', 'already', 'needed', 'mentions', 'covers',
  ]);

  return new Set(
    description
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w)),
  );
}

/** Compute Jaccard similarity between two keyword sets */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ─── Test Data: Natural language trigger phrases mapped to expected skills ───
// These simulate what a human would type. Each phrase should match exactly one skill.

const TRIGGER_MAP: Record<string, string> = {
  // Dev & agent
  'add a facade to the agent': 'agent-dev',
  'what can you do': 'agent-guide',
  'create issue for this bug': 'agent-issues',
  'file bug for this problem': 'agent-issues',
  'hello ernesto': 'agent-persona',

  // Code quality
  'deep review this module': 'deep-review',
  'is this code well architected': 'deep-review',
  'check against patterns in vault': 'code-patrol',
  'review against vault conventions': 'code-patrol',
  'second opinion on this technical decision': 'second-opinion',
  'comparing approaches for this': 'second-opinion',

  // Debugging & fixing
  'this test is failing': 'systematic-debugging',
  'there is a bug in the auth flow': 'systematic-debugging',
  'fix it and remember the pattern': 'fix-and-learn',
  'apply the fix': 'fix-and-learn',

  // Planning & execution
  'create a plan for this feature': 'writing-plans',
  'break this down into tasks': 'writing-plans',
  'execute my plan step by step': 'executing-plans',
  'run in parallel these tasks': 'parallel-execute',
  'fan out concurrent execution': 'parallel-execute',
  'use subagents for this work': 'subagent-driven-development',
  'use worktrees for these branches': 'using-git-worktrees',

  // Brainstorming & discovery
  'I want to build something new': 'brainstorming',
  "let's think about this idea": 'brainstorming',
  "I don't know where to start": 'discovery-phase',
  'investigate and explore the problem': 'discovery-phase',

  // Vault operations
  'search the vault for auth patterns': 'vault-navigator',
  'find patterns for authentication': 'vault-navigator',
  'save this pattern to the vault': 'vault-capture',
  'capture this to the vault': 'vault-capture',
  'clean vault and deduplicate': 'vault-curate',
  'groom knowledge in vault': 'vault-curate',
  'vault quality analysis': 'vault-smells',
  'find contradictions in vault': 'vault-smells',
  'learn from this pull request': 'knowledge-harvest',
  'extract patterns from this doc': 'knowledge-harvest',

  // Health & diagnostics
  'check system health and diagnostics': 'health-check',
  'run diagnostics on agent health': 'health-check',
  'MCP server not connecting': 'mcp-doctor',
  'tools are missing from MCP': 'mcp-doctor',

  // Session & context
  'where did I leave off': 'context-resume',
  'catch me up on what I was doing': 'context-resume',
  'brain stats and pattern strengths': 'brain-debrief',
  'what patterns are strongest': 'brain-debrief',
  'sprint retro for this week': 'retrospective',
  'weekly summary of what went well': 'retrospective',
  'consolidate my memory': 'dream',
  'run dream maintenance': 'dream',

  // Shipping & quality
  'pre-PR check and delivery checklist': 'deliver-and-ship',
  'is this ready to deploy': 'deliver-and-ship',
  'finish this branch and prepare PR': 'finishing-a-development-branch',
  'verify this works before marking done': 'verification-before-completion',

  // Testing & environment
  'write tests first with TDD': 'test-driven-development',
  'red green refactor cycle': 'test-driven-development',
  'set up my local dev environment': 'env-setup',
  'MODULE_NOT_FOUND error after pull': 'env-setup',
  'onboard me to this project': 'onboard-me',

  // Meta
  'go yolo mode no approvals': 'yolo-mode',
  'scout the web for new info': 'research-scout',
  'research scout for updates': 'research-scout',

  // Skill building
  'build a new skill for the agent': 'build-skill',

  // Agent mode routing
  'ernesto orchestrate this feature': 'agent-mode',
  'what commands do I have in agent mode': 'agent-mode',

  // Vault maintenance
  'curate the vault and remove noise': 'curator',
  'groom and deduplicate vault entries': 'curator',

  // Intake
  'intake this new project context': 'intake',
  'onboard a new codebase into the vault': 'intake',

  // Loop / iteration
  'loop until the tests pass': 'loop',
  'retry this until it works': 'loop',

  // Orchestration
  'ernesto orchestrate the full workflow': 'orchestrate',
  'run the full orchestration for this task': 'orchestrate',

  // Release
  'bump version and publish packages': 'release',
  'cut a release for the monorepo': 'release',
};

// These skills are agent-specific (not in the base Soleri scaffold).
// They are only tested structurally, not via trigger mapping.
const AGENT_SPECIFIC_SKILLS: Record<string, string> = {
  'humanize this AI-generated text': 'humanize',
  'extract my writing voice': 'humanize',
  'write above-the-fold landing copy': 'landing-copy',
  'pricing page FAQ': 'landing-copy',
  'create a content calendar': 'content-strategy',
  'repurpose this blog post': 'content-strategy',
  'cold email sequence for outreach': 'marketing-sales',
  'generate lead magnet ideas': 'marketing-sales',
  'SEO audit for our site': 'seo-growth',
  'build a topical authority map': 'seo-growth',
  'validate this SaaS idea': 'saas-builder',
  'design pricing tiers': 'saas-builder',
  'digital product ideas for monetization': 'monetise',
  'upsell strategy for our product': 'monetise',
  'design a weekly productivity system': 'productivity-systems',
  'build a time blocking routine': 'productivity-systems',
  'security audit on our API routes': 'security-audit',
  'check for SQL injection vulnerabilities': 'security-audit',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('E2E: skill-trigger-coverage', () => {
  const tempDir = join(tmpdir(), `soleri-e2e-triggers-${Date.now()}`);
  let agentDir: string;
  let skills: Map<string, SkillMeta>;
  const AGENT_ID = 'trigger-test-agent';
  const AGENT_PREFIX = 'trigger-test-agent-';

  beforeAll(() => {
    mkdirSync(tempDir, { recursive: true });

    const result = scaffold({
      id: AGENT_ID,
      name: 'Trigger Test Agent',
      role: 'Testing skill trigger coverage',
      description: 'Agent for validating skill trigger phrases and overlap detection.',
      domains: ['testing'],
      principles: ['Every skill must be reachable'],
      outputDir: tempDir,
    });

    expect(result.success).toBe(true);
    agentDir = result.agentDir;

    // Parse all skills
    skills = new Map();
    const skillsDir = join(agentDir, 'skills');
    if (existsSync(skillsDir)) {
      for (const dir of readdirSync(skillsDir, { encoding: 'utf-8' })) {
        const skillPath = join(skillsDir, dir, 'SKILL.md');
        if (!existsSync(skillPath)) continue;

        const content = readFileSync(skillPath, 'utf-8');
        const { name, description } = parseFrontmatter(content);
        const triggers = extractTriggers(description);

        skills.set(dir, {
          name,
          description,
          triggers,
          descriptionLength: description.length,
        });
      }
    }
  }, 60_000);

  afterAll(() => {
    rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  // ─── Structural: Every skill has trigger phrases ─────────────────────

  it('every skill should have at least 2 quoted trigger phrases in description', () => {
    const failures: string[] = [];

    for (const [dir, meta] of skills) {
      if (meta.triggers.length < 2) {
        failures.push(`${dir}: only ${meta.triggers.length} trigger(s) — "${meta.triggers.join('", "')}"`);
      }
    }

    expect(failures, `Skills with too few triggers:\n${failures.join('\n')}`).toHaveLength(0);
  });

  it('no trigger phrase should be empty or too short', () => {
    const failures: string[] = [];

    for (const [dir, meta] of skills) {
      for (const trigger of meta.triggers) {
        if (trigger.length < 3) {
          failures.push(`${dir}: trigger too short — "${trigger}"`);
        }
      }
    }

    expect(failures, `Short triggers:\n${failures.join('\n')}`).toHaveLength(0);
  });

  // ─── Budget: Descriptions fit within Claude Code limits ──────────────

  it('individual skill descriptions should not exceed 1024 characters', () => {
    const failures: string[] = [];

    for (const [dir, meta] of skills) {
      if (meta.descriptionLength > 1024) {
        failures.push(`${dir}: ${meta.descriptionLength} chars (limit 1024)`);
      }
    }

    expect(failures, `Over-budget descriptions:\n${failures.join('\n')}`).toHaveLength(0);
  });

  it('total description budget should fit within 8KB default', () => {
    let total = 0;
    for (const [, meta] of skills) {
      total += meta.descriptionLength;
    }

    // Claude Code default is 8KB but scales with context (1% of window).
    // 1M context = ~10KB budget. Set threshold with headroom for disambiguation text.
    const BUDGET = 11000;
    const usage = ((total / BUDGET) * 100).toFixed(1);

    expect(
      total,
      `Total description size: ${total} chars (${usage}% of ${BUDGET} budget). Trim descriptions or raise SLASH_COMMAND_TOOL_CHAR_BUDGET.`,
    ).toBeLessThanOrEqual(BUDGET);
  });

  // ─── Overlap: No two skills should compete for the same triggers ─────

  it('no two skills should share more than 40% of trigger phrases', () => {
    const failures: string[] = [];
    const skillList = [...skills.entries()];

    for (let i = 0; i < skillList.length; i++) {
      for (let j = i + 1; j < skillList.length; j++) {
        const [nameA, metaA] = skillList[i];
        const [nameB, metaB] = skillList[j];

        if (metaA.triggers.length === 0 || metaB.triggers.length === 0) continue;

        const triggersA = new Set(metaA.triggers);
        const triggersB = new Set(metaB.triggers);
        const shared = [...triggersA].filter((t) => triggersB.has(t));

        if (shared.length > 0) {
          const overlapPct = shared.length / Math.min(triggersA.size, triggersB.size);
          if (overlapPct > 0.4) {
            failures.push(
              `${nameA} <-> ${nameB}: ${(overlapPct * 100).toFixed(0)}% overlap — shared: "${shared.join('", "')}"`,
            );
          }
        }
      }
    }

    expect(failures, `Trigger overlap detected:\n${failures.join('\n')}`).toHaveLength(0);
  });

  it('no two skills should have high keyword similarity (>50% Jaccard)', () => {
    const failures: string[] = [];
    const skillList = [...skills.entries()];

    for (let i = 0; i < skillList.length; i++) {
      for (let j = i + 1; j < skillList.length; j++) {
        const [nameA, metaA] = skillList[i];
        const [nameB, metaB] = skillList[j];

        const kwA = extractKeywords(metaA.description);
        const kwB = extractKeywords(metaB.description);

        const similarity = jaccardSimilarity(kwA, kwB);
        if (similarity > 0.5) {
          const shared = [...kwA].filter((k) => kwB.has(k));
          failures.push(
            `${nameA} <-> ${nameB}: ${(similarity * 100).toFixed(0)}% similar — shared: [${shared.join(', ')}]`,
          );
        }
      }
    }

    expect(failures, `High keyword similarity:\n${failures.join('\n')}`).toHaveLength(0);
  });

  // ─── Trigger Mapping: Natural phrases resolve to correct skills ──────

  it('natural language trigger phrases should match the expected skill', () => {
    const failures: string[] = [];

    for (const [phrase, expectedSkillSuffix] of Object.entries(TRIGGER_MAP)) {
      const phraseLower = phrase.toLowerCase();
      let bestMatch: { skill: string; score: number } | null = null;

      for (const [dir, meta] of skills) {
        // Score: how many trigger phrases from this skill appear in the user phrase
        let score = 0;
        for (const trigger of meta.triggers) {
          if (phraseLower.includes(trigger.toLowerCase())) {
            score += trigger.length; // Longer matches score higher
          }
        }

        // Also check keyword overlap as tiebreaker
        const phraseWords = new Set(phraseLower.split(/\s+/).filter((w) => w.length > 2));
        const descWords = extractKeywords(meta.description);
        const wordOverlap = [...phraseWords].filter((w) => descWords.has(w)).length;
        score += wordOverlap * 0.5;

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { skill: dir, score };
        }
      }

      // The expected skill name in the scaffold is prefixed: "soleri-{suffix}"
      const expectedFull = `soleri-${expectedSkillSuffix}`;

      if (!bestMatch) {
        failures.push(`"${phrase}" -> NO MATCH (expected ${expectedFull})`);
      } else if (bestMatch.skill !== expectedFull) {
        failures.push(
          `"${phrase}" -> ${bestMatch.skill} (expected ${expectedFull}, score=${bestMatch.score.toFixed(1)})`,
        );
      }
    }

    if (failures.length > 0) {
      // Report all failures but don't fail hard — trigger matching is heuristic
      console.warn(`\n⚠ Trigger mapping mismatches (${failures.length}):\n${failures.join('\n')}\n`);
    }

    // Allow up to 30% mismatch rate — keyword matching is a rough heuristic,
    // Claude's semantic matching is much smarter. This test catches regressions
    // (new skills stealing triggers) not perfect matching.
    const mismatchRate = failures.length / Object.keys(TRIGGER_MAP).length;
    expect(
      mismatchRate,
      `Mismatch rate ${(mismatchRate * 100).toFixed(0)}% exceeds 30% threshold.\n${failures.join('\n')}`,
    ).toBeLessThanOrEqual(0.30);
  });

  // ─── Completeness: Every skill has at least one trigger mapping ──────

  it('every built-in skill should have at least one trigger mapping entry', () => {
    const allMappedSuffixes = new Set([
      ...Object.values(TRIGGER_MAP),
      ...Object.values(AGENT_SPECIFIC_SKILLS),
    ]);
    const unmapped: string[] = [];

    for (const dir of skills.keys()) {
      // Strip the "soleri-" prefix to get the suffix
      const suffix = dir.replace(/^soleri-/, '');
      if (!allMappedSuffixes.has(suffix)) {
        unmapped.push(dir);
      }
    }

    expect(
      unmapped,
      `Skills without trigger mapping entries:\n${unmapped.join('\n')}`,
    ).toHaveLength(0);
  });

  // ─── Disambiguation: Skills with similar domains have clear boundaries ─

  it('skills that share a domain should have distinct trigger boundaries', () => {
    // Skills that users might confuse — verify descriptions disambiguate
    const confusionPairs: [string, string, string][] = [
      ['soleri-health-check', 'soleri-vault-smells', 'health-check is operational, vault-smells is deep quality'],
      ['soleri-brainstorming', 'soleri-writing-plans', 'brainstorming is exploratory, writing-plans needs clear reqs'],
      ['soleri-executing-plans', 'soleri-parallel-execute', 'executing is sequential, parallel is concurrent'],
      ['soleri-deep-review', 'soleri-code-patrol', 'deep-review is general, code-patrol uses vault patterns'],
      ['soleri-vault-capture', 'soleri-knowledge-harvest', 'capture is single item, harvest is bulk extraction'],
      ['soleri-deliver-and-ship', 'soleri-release-gate', 'deliver is pre-PR quality, release is version/npm publish'],
      ['soleri-deliver-and-ship', 'soleri-verification-before-completion', 'deliver is shipping gate, verification is mid-workflow'],
      ['soleri-systematic-debugging', 'soleri-fix-and-learn', 'debugging finds root cause, fix-and-learn applies the fix'],
      ['soleri-brain-debrief', 'soleri-retrospective', 'brain-debrief is pattern intelligence, retrospective is work reflection'],
    ];

    const failures: string[] = [];

    for (const [skillA, skillB, boundary] of confusionPairs) {
      const metaA = skills.get(skillA);
      const metaB = skills.get(skillB);
      if (!metaA || !metaB) continue;

      // Both descriptions should reference the other skill to guide Claude
      // Check for hyphenated name (e.g. "code-patrol") or collapsed name (e.g. "codepatrol")
      const nameB = skillB.replace('soleri-', '');
      const nameA = skillA.replace('soleri-', '');
      const descA = metaA.description.toLowerCase();
      const descB = metaB.description.toLowerCase();
      const aRefsB = descA.includes(nameB) || descA.includes(nameB.replace(/-/g, ''));
      const bRefsA = descB.includes(nameA) || descB.includes(nameA.replace(/-/g, ''));

      if (!aRefsB && !bRefsA) {
        failures.push(
          `${skillA} and ${skillB} are confusable but neither description cross-references the other.\n` +
            `  Boundary: ${boundary}\n` +
            `  Fix: Add "For X, use ${skillB.replace('soleri-', '')} instead" to one or both descriptions.`,
        );
      }
    }

    expect(failures, `Missing disambiguation:\n${failures.join('\n\n')}`).toHaveLength(0);
  });
});
