/**
 * Section parser for marker-delimited engine rules content.
 *
 * Extracts `<!-- soleri:xxx -->` sections from the engine rules markdown,
 * enabling selective inclusion of feature modules.
 *
 * Single-pass: splits on `## ` headings, maps chunks to markers, filters.
 */

export interface ParsedSection {
  /** e.g. 'soleri:response-integrity' */
  marker: string;
  /** Full text including heading and marker comment */
  content: string;
}

export interface ParsedContent {
  /** Everything before the first section */
  preamble: string;
  /** Ordered list of parsed sections */
  sections: ParsedSection[];
  /** Closing marker line and anything after */
  closing: string;
}

const SECTION_MARKER_RE = /<!-- (soleri:[a-z-]+) -->/;
const CLOSING_MARKER = '<!-- /soleri:engine-rules -->';

/**
 * Parse marker-delimited sections from engine rules content.
 *
 * Strategy: split on `## ` heading boundaries, then classify each chunk
 * as preamble, section (has a marker), or closing (has closing marker).
 */
export function parseSections(content: string): ParsedContent {
  // Split at each `## ` heading — lookahead preserves the heading in the chunk
  const chunks = content.split(/(?=^## )/m);

  let preamble = '';
  const sections: ParsedSection[] = [];
  let closing = '';
  let foundFirstSection = false;

  for (const chunk of chunks) {
    // Check if this chunk contains the closing marker
    const closingIdx = chunk.indexOf(CLOSING_MARKER);
    if (closingIdx !== -1) {
      // Content before closing marker belongs to last section or preamble
      const beforeClosing = chunk.slice(0, closingIdx);
      const afterClosing = chunk.slice(closingIdx);

      if (beforeClosing.trim()) {
        const markerMatch = beforeClosing.match(SECTION_MARKER_RE);
        if (markerMatch && markerMatch[1] !== 'soleri:engine-rules') {
          sections.push({ marker: markerMatch[1], content: beforeClosing });
          foundFirstSection = true;
        } else if (!foundFirstSection) {
          preamble += beforeClosing;
        }
      }
      closing = afterClosing;
      continue;
    }

    // Check if chunk has a section marker
    const markerMatch = chunk.match(SECTION_MARKER_RE);
    if (markerMatch && markerMatch[1] !== 'soleri:engine-rules') {
      sections.push({ marker: markerMatch[1], content: chunk });
      foundFirstSection = true;
    } else {
      // No marker — this is preamble (before first section)
      if (!foundFirstSection) {
        preamble += chunk;
      }
    }
  }

  return { preamble, sections, closing };
}

/**
 * Rebuild content from parsed sections, including only allowed markers.
 */
export function filterSections(parsed: ParsedContent, allowedMarkers: Set<string>): string {
  const parts: string[] = [parsed.preamble];

  for (const section of parsed.sections) {
    if (allowedMarkers.has(section.marker)) {
      let text = section.content;
      if (!text.endsWith('\n')) text += '\n';
      parts.push(text);
    }
  }

  parts.push(parsed.closing);
  return parts.join('\n');
}
