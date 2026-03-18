/**
 * Quality Gate — LLM-based entry quality evaluation.
 *
 * Evaluates vault entries on 5 criteria (novelty, actionability, specificity,
 * relevance, informationDensity). Entries scoring below threshold are rejected.
 *
 * Graceful degradation: returns ACCEPT when LLM is unavailable.
 */

import type { LLMClient } from '../llm/llm-client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Types ───────────────────────────────────────────────────────────

export type QualityVerdict = 'ACCEPT' | 'REJECT';

export interface QualityScores {
  novelty: number;
  actionability: number;
  specificity: number;
  relevance: number;
  informationDensity: number;
}

export interface QualityResult {
  evaluated: boolean;
  verdict: QualityVerdict;
  overallScore: number;
  scores: QualityScores;
  reasoning: string;
  rejectReasons?: string[];
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────

const REJECT_THRESHOLD = 50;
const CRITICAL_LOW = 15;

const QUALITY_PROMPT = `You are a strict knowledge base curator deciding whether an entry deserves to be in a high-quality vault.

Your job is to REJECT junk and keep the vault clean. Be ruthless but fair.

## Entry Under Review
- **Type:** {type}
- **Title:** {title}
- **Tags:** {tags}
- **Description:** {description}
{why}{example}{context}

## Scoring Criteria (each 0-100)

1. **novelty** — Is this genuinely new knowledge or a truism? ("Write clean code" = 5, "Use driver adapter pattern to avoid Prisma lock-in" = 90)
2. **actionability** — Can someone act on this? Vague advice = low, specific do/don't = high
3. **specificity** — Is this specific to a real context or generic fluff?
4. **relevance** — Does this belong in a technical knowledge vault?
5. **informationDensity** — Is there real substance or mostly filler?

## Verdict Rules
- Overall score = average of all 5 criteria
- **REJECT** if overall < ${REJECT_THRESHOLD}, or if ANY criterion scores <= ${CRITICAL_LOW}
- **ACCEPT** otherwise
- When in doubt, REJECT.

Respond with ONLY this JSON (no markdown fences):
{"verdict":"ACCEPT or REJECT","overallScore":0-100,"scores":{"novelty":N,"actionability":N,"specificity":N,"relevance":N,"informationDensity":N},"reasoning":"2-3 sentences","rejectReasons":["reason1"]}`;

// ─── Evaluate ────────────────────────────────────────────────────────

export async function evaluateQuality(
  entry: IntelligenceEntry,
  llm: LLMClient | null,
): Promise<QualityResult> {
  const fallback: QualityResult = {
    evaluated: false,
    verdict: 'ACCEPT',
    overallScore: 50,
    scores: {
      novelty: 50,
      actionability: 50,
      specificity: 50,
      relevance: 50,
      informationDensity: 50,
    },
    reasoning: 'LLM unavailable — defaulting to accept',
  };

  if (!llm) return fallback;

  const prompt = QUALITY_PROMPT.replace('{type}', entry.type)
    .replace('{title}', entry.title)
    .replace('{tags}', entry.tags.join(', ') || 'none')
    .replace('{description}', entry.description)
    .replace('{why}', entry.why ? `- **Why:** ${entry.why}\n` : '')
    .replace('{example}', entry.example ? `- **Example:** ${entry.example}\n` : '')
    .replace('{context}', entry.context ? `- **Context:** ${entry.context}\n` : '');

  try {
    const result = await llm.complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a knowledge quality evaluator. Respond only with JSON.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 500,
      caller: 'quality-gate',
      task: 'evaluate',
    });

    const parsed = JSON.parse(result.text) as {
      verdict: string;
      overallScore: number;
      scores: QualityScores;
      reasoning: string;
      rejectReasons?: string[];
    };

    return {
      evaluated: true,
      verdict: (parsed.verdict === 'REJECT' ? 'REJECT' : 'ACCEPT') as QualityVerdict,
      overallScore: parsed.overallScore ?? 50,
      scores: parsed.scores ?? fallback.scores,
      reasoning: parsed.reasoning ?? '',
      rejectReasons: parsed.rejectReasons,
    };
  } catch (err) {
    return { ...fallback, error: (err as Error).message };
  }
}
