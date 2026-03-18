/**
 * Classifier — LLM-based auto-categorization for vault entries.
 *
 * Suggests category, severity, and additional tags based on entry content.
 * Graceful degradation: returns empty suggestions when LLM is unavailable.
 */

import type { LLMClient } from '../llm/llm-client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface ClassificationResult {
  classified: boolean;
  suggestedDomain: string | null;
  suggestedSeverity: string | null;
  suggestedTags: string[];
  confidence: number;
  error?: string;
}

// ─── Classify ────────────────────────────────────────────────────────

const CLASSIFY_PROMPT = `Classify this knowledge entry. Suggest the best domain, severity, and 3-5 tags.

**Title:** {title}
**Type:** {type}
**Current tags:** {tags}
**Description:** {description}

Respond with ONLY this JSON (no markdown fences):
{"domain":"string","severity":"critical|warning|suggestion","tags":["tag1","tag2","tag3"],"confidence":0.0-1.0}

Rules:
- domain: a single word (e.g., architecture, testing, security, design, performance, accessibility)
- severity: critical = must-know, warning = important, suggestion = nice-to-know
- tags: lowercase, hyphenated, specific and useful for search
- confidence: how sure you are about this classification (0.0-1.0)`;

export async function classifyEntry(
  entry: IntelligenceEntry,
  llm: LLMClient | null,
): Promise<ClassificationResult> {
  const fallback: ClassificationResult = {
    classified: false,
    suggestedDomain: null,
    suggestedSeverity: null,
    suggestedTags: [],
    confidence: 0,
  };

  if (!llm) return fallback;

  const prompt = CLASSIFY_PROMPT.replace('{title}', entry.title)
    .replace('{type}', entry.type)
    .replace('{tags}', entry.tags.join(', ') || 'none')
    .replace('{description}', entry.description);

  try {
    const result = await llm.complete({
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a knowledge classifier. Respond only with JSON.',
      userPrompt: prompt,
      temperature: 0.1,
      maxTokens: 300,
      caller: 'classifier',
      task: 'classify',
    });

    const parsed = JSON.parse(result.text) as {
      domain: string;
      severity: string;
      tags: string[];
      confidence: number;
    };

    return {
      classified: true,
      suggestedDomain: parsed.domain ?? null,
      suggestedSeverity: parsed.severity ?? null,
      suggestedTags: parsed.tags ?? [],
      confidence: parsed.confidence ?? 0.5,
    };
  } catch (err) {
    return { ...fallback, error: (err as Error).message };
  }
}
