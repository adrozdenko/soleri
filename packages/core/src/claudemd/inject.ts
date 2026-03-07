/**
 * CLAUDE.md injection — marker-based write with diff detection and user-safe zones.
 *
 * Improvements over Salvador:
 * - Diff-before-write: skips I/O if content unchanged
 * - User-safe zones: `<!-- user:custom -->` blocks inside markers survive regeneration
 * - Versioned markers: `<!-- agent:mode v1 -->` for future migration
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { OPEN_MARKER, CLOSE_MARKER, USER_ZONE_OPEN, USER_ZONE_CLOSE } from './compose.js';
import type { InjectionResult, RemovalResult } from './types.js';

/** Legacy marker patterns to detect and migrate */
const LEGACY_MARKERS = [
  '<!-- agent:mode -->', // v0 (no version)
  '<!-- salvador:mode -->', // pre-Soleri
];

/**
 * Extract user-safe zone content from an existing agent block.
 * Returns the content between `<!-- user:custom -->` markers, or null.
 */
export function extractUserZone(content: string): string | null {
  const openIdx = content.indexOf(USER_ZONE_OPEN);
  const closeIdx = content.indexOf(USER_ZONE_CLOSE);
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return null;
  const inner = content.slice(openIdx + USER_ZONE_OPEN.length, closeIdx).trim();
  return inner || null;
}

/**
 * Preserve user-safe zone content when regenerating.
 * Replaces the empty user zone in `newBlock` with the saved content.
 */
function preserveUserZone(newBlock: string, savedZone: string | null): string {
  if (!savedZone) return newBlock;
  const emptyZone = `${USER_ZONE_OPEN}\n\n${USER_ZONE_CLOSE}`;
  const filledZone = `${USER_ZONE_OPEN}\n${savedZone}\n${USER_ZONE_CLOSE}`;
  return newBlock.replace(emptyZone, filledZone);
}

/**
 * Find the agent block boundaries in content.
 * Handles current and legacy markers.
 */
function findBlock(
  content: string,
): { openIdx: number; closeIdx: number; closeLen: number } | null {
  // Current markers
  const openIdx = content.indexOf(OPEN_MARKER);
  if (openIdx !== -1) {
    const closeIdx = content.indexOf(CLOSE_MARKER, openIdx);
    if (closeIdx > openIdx) {
      return { openIdx, closeIdx, closeLen: CLOSE_MARKER.length };
    }
  }

  // Legacy markers
  for (const legacy of LEGACY_MARKERS) {
    const legacyOpen = content.indexOf(legacy);
    if (legacyOpen === -1) continue;
    const legacyCloseTag = legacy.replace('<!-- ', '<!-- /');
    const legacyClose = content.indexOf(legacyCloseTag, legacyOpen);
    if (legacyClose > legacyOpen) {
      return { openIdx: legacyOpen, closeIdx: legacyClose, closeLen: legacyCloseTag.length };
    }
  }

  return null;
}

/**
 * Inject an agent block into a CLAUDE.md file.
 *
 * - If markers exist: replace (preserving user-safe zones), skip if unchanged
 * - If legacy markers: migrate
 * - If no markers: append
 */
export function injectCLAUDEmd(filePath: string, block: string): InjectionResult {
  try {
    // New file
    if (!existsSync(filePath)) {
      writeFileSync(filePath, block + '\n', 'utf-8');
      return { success: true, action: 'injected', message: 'Created file with agent block' };
    }

    const content = readFileSync(filePath, 'utf-8');
    const bounds = findBlock(content);

    if (bounds) {
      // Extract user zone from existing block before replacing
      const existingBlock = content.slice(bounds.openIdx, bounds.closeIdx + bounds.closeLen);
      const userZone = extractUserZone(existingBlock);
      const finalBlock = preserveUserZone(block, userZone);

      // Diff check — skip write if identical
      if (existingBlock === finalBlock) {
        return {
          success: true,
          action: 'skipped',
          message: 'Content unchanged — no write needed',
          diffDetected: false,
        };
      }

      const before = content.slice(0, bounds.openIdx);
      const after = content.slice(bounds.closeIdx + bounds.closeLen);
      writeFileSync(filePath, before + finalBlock + after, 'utf-8');
      return {
        success: true,
        action: 'replaced',
        message: 'Replaced agent block (diff detected)',
        diffDetected: true,
      };
    }

    // No markers — append
    writeFileSync(filePath, content.trimEnd() + '\n\n' + block + '\n', 'utf-8');
    return { success: true, action: 'injected', message: 'Appended agent block' };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: `Injection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Remove the agent block from a CLAUDE.md file.
 */
export function removeCLAUDEmd(filePath: string): RemovalResult {
  try {
    if (!existsSync(filePath)) {
      return { success: true, action: 'not_present', message: 'File does not exist' };
    }

    const content = readFileSync(filePath, 'utf-8');
    const bounds = findBlock(content);

    if (!bounds) {
      return { success: true, action: 'not_present', message: 'No agent block found' };
    }

    const before = content.slice(0, bounds.openIdx).trimEnd();
    const after = content.slice(bounds.closeIdx + bounds.closeLen).trimStart();
    writeFileSync(filePath, after ? before + '\n\n' + after : before + '\n', 'utf-8');
    return { success: true, action: 'removed', message: 'Removed agent block' };
  } catch (err) {
    return {
      success: false,
      action: 'error',
      message: `Removal failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check if an agent block is present in a CLAUDE.md file.
 */
export function hasCLAUDEmdBlock(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return findBlock(content) !== null;
  } catch {
    return false;
  }
}
