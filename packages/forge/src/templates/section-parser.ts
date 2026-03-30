/**
 * Section parser for marker-delimited engine rules content.
 *
 * Extracts `<!-- soleri:xxx -->` sections from the engine rules markdown,
 * enabling selective inclusion of feature modules.
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

const SECTION_MARKER_RE = /^<!-- (soleri:[a-z-]+) -->$/;
const CLOSING_MARKER_RE = /^<!-- \/soleri:engine-rules -->$/;

/**
 * Parse marker-delimited sections from engine rules content.
 * Single pass — splits on `<!-- soleri:xxx -->` markers.
 *
 * Section markers look like `<!-- soleri:response-integrity -->` (no closing slash).
 * The outer `<!-- soleri:engine-rules -->` / `<!-- /soleri:engine-rules -->` wrapper
 * is NOT treated as a section marker.
 */
export function parseSections(content: string): ParsedContent {
  const lines = content.split('\n');

  // First pass: find all marker positions and their preceding headings
  const markers: Array<{
    marker: string;
    markerLine: number;
    headingLine: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_MARKER_RE);
    if (match && match[1] !== 'soleri:engine-rules') {
      // Walk backward to find the preceding ## heading (skip empty lines)
      let headingLine = i;
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].startsWith('## ')) {
          headingLine = j;
          break;
        }
        if (lines[j].trim() !== '') break;
      }
      markers.push({ marker: match[1], markerLine: i, headingLine });
    }
  }

  // Find closing marker position
  let closingLine = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (CLOSING_MARKER_RE.test(lines[i])) {
      closingLine = i;
      break;
    }
  }

  // Extract preamble: everything before the first section's heading
  const firstSectionStart = markers.length > 0 ? markers[0].headingLine : closingLine;
  const preamble = lines.slice(0, firstSectionStart).join('\n');

  // Extract sections
  const sections: ParsedSection[] = [];
  for (let s = 0; s < markers.length; s++) {
    const startLine = markers[s].headingLine;
    let endLine: number;

    if (s + 1 < markers.length) {
      // End is one line before the next section's heading start
      endLine = markers[s + 1].headingLine - 1;
    } else {
      // Last section ends one line before the closing marker
      endLine = closingLine - 1;
    }

    const sectionLines = lines.slice(startLine, endLine + 1);
    // Ensure trailing blank line separator
    const sectionContent = sectionLines.join('\n');

    sections.push({
      marker: markers[s].marker,
      content: sectionContent,
    });
  }

  // Closing: from closing marker line to end
  const closing = lines.slice(closingLine).join('\n');

  return { preamble, sections, closing };
}

/**
 * Rebuild content from parsed sections, including only allowed markers.
 * Core sections and preamble are always included.
 */
export function filterSections(parsed: ParsedContent, allowedMarkers: Set<string>): string {
  const parts: string[] = [parsed.preamble];

  for (const section of parsed.sections) {
    if (allowedMarkers.has(section.marker)) {
      let sectionText = section.content;
      // Ensure blank line separator after each included section
      if (!sectionText.endsWith('\n')) {
        sectionText += '\n';
      }
      parts.push(sectionText);
    }
  }

  parts.push(parsed.closing);
  return parts.join('\n');
}
