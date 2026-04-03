/**
 * Text Ingester — ingest articles, transcripts, and plain text into the vault.
 *
 * Reuses existing content-classifier (LLM extraction) and dedup-gate (TF-IDF).
 * No new dependencies — fetch() is built-in, HTML stripping is regex-based.
 */

import type { Vault } from '../vault/vault.js';
import type { LLMClient } from '../llm/llm-client.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import type { ClassifiedItem } from './types.js';
import { classifyChunk } from './content-classifier.js';
import { dedupItems } from './dedup-gate.js';
import { normalizeTags as normalizeTagsCanonical } from '../vault/tag-normalizer.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface IngestSource {
  type: 'article' | 'transcript' | 'notes' | 'documentation';
  title: string;
  url?: string;
  author?: string;
}

export interface IngestOptions {
  domain?: string;
  tags?: string[];
  /** Max chars per chunk for LLM classification. Default 4000. */
  chunkSize?: number;
  /** Canonical tag list for normalization. If omitted, no canonical normalization. */
  canonicalTags?: string[];
  /** Tag constraint mode. Default: 'suggest'. */
  tagConstraintMode?: 'enforce' | 'suggest' | 'off';
  /** Metadata tag prefixes exempt from canonical normalization. Default: ['source:']. */
  metadataTagPrefixes?: string[];
}

export interface IngestResult {
  source: IngestSource;
  ingested: number;
  duplicates: number;
  entries: Array<{ id: string; title: string; type: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 4000;
const FETCH_TIMEOUT_MS = 15000;

// ─── Class ───────────────────────────────────────────────────────────

export class TextIngester {
  private vault: Vault;
  private llm: LLMClient | null;

  constructor(vault: Vault, llm: LLMClient | null) {
    this.vault = vault;
    this.llm = llm;
  }

  /**
   * Ingest a URL — fetch, strip HTML, classify, dedup, store.
   */
  async ingestUrl(url: string, opts?: IngestOptions): Promise<IngestResult> {
    if (!this.llm) {
      return { source: { type: 'article', title: url }, ingested: 0, duplicates: 0, entries: [] };
    }

    let text: string;
    let title = url;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Soleri/1.0 (knowledge ingestion)' },
      });
      if (!response.ok) {
        return { source: { type: 'article', title }, ingested: 0, duplicates: 0, entries: [] };
      }
      const html = await response.text();
      title = extractTitle(html) ?? url;
      text = stripHtml(html);
    } catch {
      return { source: { type: 'article', title }, ingested: 0, duplicates: 0, entries: [] };
    }

    if (text.length < 50) {
      return { source: { type: 'article', title }, ingested: 0, duplicates: 0, entries: [] };
    }

    const source: IngestSource = { type: 'article', title, url };
    return this.ingestText(text, source, opts);
  }

  /**
   * Ingest raw text — classify, dedup, store.
   */
  async ingestText(
    text: string,
    source: IngestSource,
    opts?: IngestOptions,
  ): Promise<IngestResult> {
    if (!this.llm) {
      return { source, ingested: 0, duplicates: 0, entries: [] };
    }

    const chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const chunks = splitIntoChunks(text, chunkSize);
    const domain = opts?.domain ?? 'general';
    const extraTags = opts?.tags ?? [];

    // Classify all chunks
    const allItems: ClassifiedItem[] = [];
    for (const chunk of chunks) {
      // oxlint-disable-next-line eslint(no-await-in-loop)
      const items = await classifyChunk(
        this.llm,
        chunk,
        `${source.type}: ${source.title}`,
        opts?.canonicalTags,
      );
      allItems.push(...items);
    }

    if (allItems.length === 0) {
      return { source, ingested: 0, duplicates: 0, entries: [] };
    }

    // Dedup against vault
    const dedupResults = dedupItems(allItems, this.vault);
    const unique = dedupResults.filter((r) => !r.isDuplicate).map((r) => r.item);
    const duplicateCount = dedupResults.filter((r) => r.isDuplicate).length;

    // Build source attribution for context field
    const attribution = buildAttribution(source);

    // Metadata tags use 'source:' prefix so they're exempt from canonical normalization
    const metadataTags = [`source:ingested`, `source:${source.type}`];

    // Apply canonical tag normalization if configured
    const canonicalTags = opts?.canonicalTags;
    const tagMode = opts?.tagConstraintMode ?? 'suggest';
    const metaPrefixes = opts?.metadataTagPrefixes ?? ['source:'];

    // Store in vault
    const entries: IntelligenceEntry[] = unique.map((item, i) => {
      const rawTags = [...(item.tags ?? []), ...extraTags];
      const normalizedTags =
        canonicalTags && tagMode !== 'off'
          ? normalizeTagsCanonical(rawTags, canonicalTags, tagMode, metaPrefixes)
          : rawTags;

      return {
        id: `ingest-${source.type}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        type: mapType(item.type),
        domain,
        title: item.title,
        description: item.description,
        severity: mapSeverity(item.severity),
        tags: [...normalizedTags, ...metadataTags],
        context: attribution,
        origin: 'user' as const,
      };
    });

    if (entries.length > 0) {
      this.vault.seed(entries);
    }

    return {
      source,
      ingested: entries.length,
      duplicates: duplicateCount,
      entries: entries.map((e) => ({ id: e.id, title: e.title, type: e.type })),
    };
  }

  /**
   * Ingest multiple items in sequence.
   */
  async ingestBatch(
    items: Array<{ text: string; source: IngestSource; opts?: IngestOptions }>,
  ): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const item of items) {
      // oxlint-disable-next-line eslint(no-await-in-loop)
      const result = await this.ingestText(item.text, item.source, item.opts);
      results.push(result);
    }
    return results;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return (
    html
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Remove nav, header, footer, aside
      .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, '')
      // Remove all HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (match) {
    return match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  }
  return null;
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    // Try to break at a sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + chunkSize * 0.5) {
        end = lastPeriod + 2;
      }
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter((c) => c.length > 0);
}

function buildAttribution(source: IngestSource): string {
  const parts = [`Source: ${source.type}`];
  if (source.title) parts.push(`Title: ${source.title}`);
  if (source.url) parts.push(`URL: ${source.url}`);
  if (source.author) parts.push(`Author: ${source.author}`);
  return parts.join(' | ');
}

function mapType(type: string): IntelligenceEntry['type'] {
  if (type === 'pattern') return 'pattern';
  if (type === 'anti-pattern') return 'anti-pattern';
  return 'rule';
}

function mapSeverity(severity: string | undefined): IntelligenceEntry['severity'] {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'suggestion';
}
