/**
 * Knowledge Synthesizer — turn vault knowledge into structured content.
 *
 * Searches vault for relevant entries, builds context, calls LLM to synthesize
 * into one of 4 formats: brief, outline, talking-points, post-draft.
 *
 * Graceful degradation: if no LLM, returns raw entries without synthesis.
 */

import type { Brain } from './brain.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { RankedResult } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────

export type SynthesisFormat = 'brief' | 'outline' | 'talking-points' | 'post-draft';
export type Audience = 'technical' | 'executive' | 'general';

export interface SynthesisOptions {
  format: SynthesisFormat;
  maxEntries?: number;
  audience?: Audience;
}

export interface SynthesisResult {
  query: string;
  format: SynthesisFormat;
  content: string;
  sources: Array<{ id: string; title: string; score: number }>;
  coverage: number;
  gaps: string[];
  entriesConsulted: number;
}

// ─── Prompts ─────────────────────────────────────────────────────────

const FORMAT_PROMPTS: Record<SynthesisFormat, string> = {
  brief:
    'Produce a concise executive brief (5-10 bullet points). Start with a one-line summary. ' +
    'Group findings by theme. End with open questions or knowledge gaps.',
  outline:
    'Produce a structured article/document outline with numbered sections. ' +
    'Each section should reference which vault entries support it. ' +
    'Mark sections where knowledge is thin as [GAP].',
  'talking-points':
    'Produce bullet-point talking points for a presentation or discussion. ' +
    'Each point should be self-contained and quotable. ' +
    'Include a "Questions to anticipate" section at the end.',
  'post-draft':
    'Draft a short-form post (200-300 words) suitable for LinkedIn or a blog. ' +
    'Conversational tone, one key insight, actionable takeaway. ' +
    'End with a question to prompt engagement.',
};

const AUDIENCE_CONTEXT: Record<Audience, string> = {
  technical: 'The audience is software engineers and architects. Use precise technical language.',
  executive:
    'The audience is non-technical leadership. Focus on impact, decisions, and outcomes. Avoid jargon.',
  general: 'The audience is mixed. Be clear and accessible while maintaining accuracy.',
};

// ─── Class ───────────────────────────────────────────────────────────

export class KnowledgeSynthesizer {
  private brain: Brain;
  private llm: LLMClient | null;

  constructor(brain: Brain, llm: LLMClient | null) {
    this.brain = brain;
    this.llm = llm;
  }

  async synthesize(query: string, opts: SynthesisOptions): Promise<SynthesisResult> {
    const maxEntries = opts.maxEntries ?? 10;
    const audience = opts.audience ?? 'general';

    // 1. Search vault for relevant entries
    const results = await this.brain.intelligentSearch(query, { limit: maxEntries });

    const sources = results.map((r) => ({
      id: r.entry.id,
      title: r.entry.title,
      score: r.score,
    }));

    // Coverage: how many entries scored above 0.3 vs how many we asked for
    const strongMatches = results.filter((r) => r.score > 0.3).length;
    const coverage =
      maxEntries > 0 ? Math.min(Math.round((strongMatches / maxEntries) * 100), 100) : 0;

    // 2. If no LLM, return raw entries without synthesis
    if (!this.llm || results.length === 0) {
      return {
        query,
        format: opts.format,
        content:
          results.length === 0
            ? `No vault entries found for "${query}".`
            : formatRawEntries(results),
        sources,
        coverage,
        gaps: results.length === 0 ? [`No knowledge found for: ${query}`] : [],
        entriesConsulted: results.length,
      };
    }

    // 3. Build context from entries
    const context = buildContext(results);

    // 4. LLM synthesis call
    const systemPrompt = buildSystemPrompt(opts.format, audience);
    const userPrompt = buildUserPrompt(query, context, opts.format);

    let llmOutput: string;
    try {
      const result = await this.llm.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.3,
        maxTokens: 1500,
        caller: 'knowledge-synthesizer',
        task: 'synthesize',
      });
      llmOutput = result.text;
    } catch {
      // LLM failed — return raw entries
      return {
        query,
        format: opts.format,
        content: formatRawEntries(results),
        sources,
        coverage,
        gaps: [],
        entriesConsulted: results.length,
      };
    }

    // 5. Extract gaps from LLM output
    const gaps = extractGaps(llmOutput);

    return {
      query,
      format: opts.format,
      content: llmOutput,
      sources,
      coverage,
      gaps,
      entriesConsulted: results.length,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildContext(results: RankedResult[]): string {
  return results
    .map((r, i) => {
      const entry = r.entry;
      let text = `[${i + 1}] ${entry.title} (${entry.type}, ${entry.severity})\n`;
      text += `   ${entry.description}`;
      if (entry.why) text += `\n   Why: ${entry.why}`;
      if (entry.context) text += `\n   Context: ${entry.context}`;
      if (entry.tags.length > 0) text += `\n   Tags: ${entry.tags.join(', ')}`;
      return text;
    })
    .join('\n\n');
}

function buildSystemPrompt(format: SynthesisFormat, audience: Audience): string {
  return (
    'You are a knowledge synthesizer. You take structured vault entries (patterns, anti-patterns, rules) ' +
    'and produce clear, actionable content.\n\n' +
    FORMAT_PROMPTS[format] +
    '\n\n' +
    AUDIENCE_CONTEXT[audience] +
    '\n\n' +
    'Rules:\n' +
    '- Only use information from the provided vault entries. Do not invent facts.\n' +
    '- Reference entries by their [number] when making claims.\n' +
    "- If the entries don't cover an important subtopic, note it as a GAP.\n" +
    '- Be concise. Every sentence should earn its place.'
  );
}

function buildUserPrompt(query: string, context: string, format: SynthesisFormat): string {
  return (
    `Topic: ${query}\n\n` +
    `Format: ${format}\n\n` +
    `Vault entries:\n${context}\n\n` +
    'Synthesize the above entries into the requested format. ' +
    'Include a "Knowledge Gaps" section at the end listing topics not covered by the entries.'
  );
}

function formatRawEntries(results: RankedResult[]): string {
  if (results.length === 0) return 'No entries found.';
  return results
    .map(
      (r) =>
        `- **${r.entry.title}** (${r.entry.type}, score: ${r.score.toFixed(2)}): ${r.entry.description}`,
    )
    .join('\n');
}

function extractGaps(llmOutput: string): string[] {
  // Look for a "Knowledge Gaps" or "Gaps" or "[GAP]" section
  const gapSection = llmOutput.match(
    /(?:knowledge\s+gaps?|gaps?|open\s+questions?)[\s:]*\n([\s\S]*?)(?:\n##|\n\*\*|$)/i,
  );
  if (!gapSection) return [];

  return gapSection[1]
    .split('\n')
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 5);
}
