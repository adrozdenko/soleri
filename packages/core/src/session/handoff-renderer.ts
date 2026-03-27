/**
 * Handoff Renderer — converts a HandoffNote into markdown for injection
 * into the next session's context.
 *
 * Omits empty sections gracefully.
 */

import type { HandoffNote } from './compaction-policy.js';

/**
 * Render a HandoffNote as markdown.
 *
 * Sections:
 * - Session Handoff (header)
 * - Rotated At
 * - Reason
 * - In Progress
 * - Key Decisions
 * - Files Modified
 *
 * Empty sections are omitted entirely.
 */
export function renderHandoff(note: HandoffNote): string {
  const lines: string[] = ['# Session Handoff', ''];

  lines.push(`**Rotated:** ${note.rotatedAt}`);
  lines.push(`**Reason:** ${note.reason}`);
  lines.push('');

  if (note.inProgress) {
    lines.push('## In Progress');
    lines.push('');
    lines.push(note.inProgress);
    lines.push('');
  }

  if (note.keyDecisions.length > 0) {
    lines.push('## Key Decisions');
    lines.push('');
    for (const decision of note.keyDecisions) {
      lines.push(`- ${decision}`);
    }
    lines.push('');
  }

  if (note.filesModified.length > 0) {
    lines.push('## Files Modified');
    lines.push('');
    for (const file of note.filesModified) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
