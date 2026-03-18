// ─── Content Classifier — LLM-based knowledge extraction ────────────────────
//
// Takes a text chunk and uses an LLM to classify it into structured
// knowledge items. Graceful degradation: returns [] on any error.

import type { LLMClient } from '../llm/llm-client.js';
import type { ClassifiedItem, KnowledgeType } from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

export const VALID_TYPES: KnowledgeType[] = [
  'pattern',
  'anti-pattern',
  'principle',
  'concept',
  'reference',
  'workflow',
  'idea',
  'roadmap',
];

const VALID_SEVERITIES = ['critical', 'warning', 'suggestion'] as const;
type Severity = (typeof VALID_SEVERITIES)[number];

export const CLASSIFICATION_PROMPT = `You are a knowledge extraction engine. Your job is to analyze a text chunk and extract structured knowledge items from it.

For each distinct piece of knowledge you identify, produce an object with these fields:
- type: one of ${JSON.stringify(VALID_TYPES)}
- title: concise title, max 80 characters
- description: 2-3 sentence summary of the knowledge
- tags: 3-5 lowercase single-word or hyphenated tags
- severity: one of "critical", "warning", "suggestion"

Rules:
- Extract ALL meaningful knowledge items from the text.
- Each item must be self-contained and independently useful.
- Use "critical" for must-know items, "warning" for important gotchas, "suggestion" for nice-to-know.
- Tags should be specific and useful for search.
- Respond with a pure JSON array of objects. No markdown fences, no explanation, no wrapping.
- If the text contains no extractable knowledge, respond with an empty array: []`;

// =============================================================================
// CLASSIFIER
// =============================================================================

/**
 * Classify a text chunk into structured knowledge items using an LLM.
 *
 * @param llm      - LLMClient instance
 * @param chunkText - The text to classify
 * @param citation  - Source citation (e.g. "book.pdf, pages 12-15")
 * @returns Classified items, or [] on any error
 */
export async function classifyChunk(
  llm: LLMClient,
  chunkText: string,
  citation: string,
): Promise<ClassifiedItem[]> {
  try {
    const result = await llm.complete({
      systemPrompt: CLASSIFICATION_PROMPT,
      userPrompt: chunkText,
      maxTokens: 4096,
      temperature: 0.3,
      caller: 'intake',
      task: 'classify',
    });

    const raw = parseJsonResponse(result.text);
    if (!Array.isArray(raw)) return [];

    return raw
      .map((item: unknown) => sanitizeItem(item, citation))
      .filter((item): item is ClassifiedItem => item !== null);
  } catch {
    // Graceful degradation — never throw
    return [];
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parse a JSON response, handling potential markdown fences the LLM
 * might include despite instructions.
 */
function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();

  // Strip markdown fences if present (defensive)
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  const jsonStr = fenceMatch ? fenceMatch[1] : trimmed;

  return JSON.parse(jsonStr);
}

/**
 * Validate and sanitize a single classified item.
 * Returns null if the item is not salvageable.
 */
function sanitizeItem(raw: unknown, citation: string): ClassifiedItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  // Type — must be a valid KnowledgeType
  const type = typeof obj.type === 'string' ? obj.type : '';
  if (!VALID_TYPES.includes(type as KnowledgeType)) return null;

  // Title — required, truncate to 80 chars
  const title = typeof obj.title === 'string' ? obj.title.slice(0, 80).trim() : '';
  if (!title) return null;

  // Description — required
  const description = typeof obj.description === 'string' ? obj.description.trim() : '';
  if (!description) return null;

  // Tags — must be array of strings, cap at 5
  const tags = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t.length > 0)
        .slice(0, 5)
    : [];

  // Severity — default to 'suggestion' if invalid
  const severity: Severity = VALID_SEVERITIES.includes(obj.severity as Severity)
    ? (obj.severity as Severity)
    : 'suggestion';

  return {
    type: type as KnowledgeType,
    title,
    description,
    tags,
    severity,
    citation,
  };
}
