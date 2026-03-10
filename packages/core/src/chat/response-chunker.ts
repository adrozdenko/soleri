/**
 * Response Chunker — splits long agent responses for chat platforms.
 *
 * Two capabilities:
 * 1. Markdown → HTML conversion (for Telegram-style HTML parse mode)
 * 2. Smart chunking at natural boundaries (paragraphs, sentences, words)
 *
 * Ported from Salvador's response-chunker.ts with improvements:
 * - Cleaner code block protection (no sentinel characters)
 * - Supports multiple output formats (HTML, Markdown passthrough, plain)
 * - Better heading handling
 */

import type { ChunkConfig, MarkupFormat } from './types.js';

const DEFAULT_MAX_CHUNK_SIZE = 4000;

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Convert Markdown to the target format and split into chunks.
 */
export function chunkResponse(text: string, config?: ChunkConfig): string[] {
  const maxSize = config?.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const format = config?.format ?? 'html';

  const converted = convertMarkup(text, format);

  if (converted.length <= maxSize) return [converted];

  return splitAtBoundaries(converted, maxSize);
}

/**
 * Convert Markdown to the target markup format.
 */
export function convertMarkup(text: string, format: MarkupFormat): string {
  switch (format) {
    case 'html':
      return markdownToHtml(text);
    case 'plain':
      return markdownToPlain(text);
    case 'markdown':
    default:
      return text;
  }
}

// ─── Markdown → HTML ────────────────────────────────────────────────

/**
 * Convert Markdown to Telegram-compatible HTML.
 *
 * Handles: headings, bold, italic, strikethrough, code, links,
 * blockquotes, lists, and fenced code blocks.
 */
export function markdownToHtml(text: string): string {
  // Protect fenced code blocks first
  const codeBlocks: string[] = [];
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
    return `<<CODEBLOCK_${codeBlocks.length - 1}>>`;
  });

  // Inline code
  processed = processed.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`);

  // Headings → bold
  processed = processed.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Bold + italic
  processed = processed.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  // Bold
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // Italic
  processed = processed.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<i>$1</i>');
  // Strikethrough
  processed = processed.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  processed = processed.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  processed = processed.replace(/<\/blockquote>\n<blockquote>/g, '\n');

  // Unordered lists
  processed = processed.replace(/^[-*]\s+(.+)$/gm, '• $1');
  // Ordered lists
  processed = processed.replace(/^\d+\.\s+(.+)$/gm, '• $1');

  // Horizontal rules
  processed = processed.replace(/^---+$/gm, '─'.repeat(20));

  // Restore code blocks
  processed = processed.replace(/<<CODEBLOCK_(\d+)>>/g, (_m, i) => codeBlocks[Number(i)]);

  return processed.trim();
}

// ─── Markdown → Plain ───────────────────────────────────────────────

function markdownToPlain(text: string): string {
  let plain = text;

  // Remove fenced code block markers (keep content)
  plain = plain.replace(/```\w*\n?/g, '');

  // Remove inline formatting
  plain = plain.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  plain = plain.replace(/\*\*(.+?)\*\*/g, '$1');
  plain = plain.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '$1');
  plain = plain.replace(/~~(.+?)~~/g, '$1');
  plain = plain.replace(/`([^`]+)`/g, '$1');

  // Headings → plain text
  plain = plain.replace(/^#{1,6}\s+/gm, '');

  // Links → text (URL)
  plain = plain.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // Blockquotes
  plain = plain.replace(/^>\s?/gm, '');

  // Lists
  plain = plain.replace(/^[-*]\s+/gm, '• ');

  return plain.trim();
}

// ─── Chunking ───────────────────────────────────────────────────────

function splitAtBoundaries(text: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxSize) {
    const cutPoint = findCutPoint(remaining, maxSize);
    chunks.push(remaining.slice(0, cutPoint).trimEnd());
    remaining = remaining.slice(cutPoint).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining.trimEnd());
  }

  return chunks;
}

/**
 * Find the best cut point, prioritizing natural boundaries:
 * 1. Paragraph break (double newline)
 * 2. Line break
 * 3. Sentence boundary (. ! ?)
 * 4. Word boundary (space)
 * 5. Hard cut at maxSize
 */
function findCutPoint(text: string, maxSize: number): number {
  const window = text.slice(0, maxSize);

  // Try paragraph break (must be at least 30% into the chunk to be useful)
  const minUseful = Math.floor(maxSize * 0.3);
  const paragraphBreak = window.lastIndexOf('\n\n');
  if (paragraphBreak >= minUseful) return paragraphBreak + 2;

  // Try line break
  const lineBreak = window.lastIndexOf('\n');
  if (lineBreak >= minUseful) return lineBreak + 1;

  // Try sentence boundary
  const sentenceEnd = findLastSentenceEnd(window, minUseful);
  if (sentenceEnd > 0) return sentenceEnd;

  // Try word boundary
  const spaceBreak = window.lastIndexOf(' ');
  if (spaceBreak >= minUseful) return spaceBreak + 1;

  // Hard cut
  return maxSize;
}

function findLastSentenceEnd(text: string, minPos: number): number {
  // Look for ". " or "! " or "? " from the end
  for (let i = text.length - 1; i >= minPos; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && i + 1 < text.length && text[i + 1] === ' ') {
      return i + 2;
    }
  }
  return -1;
}

// ─── Helpers ────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
