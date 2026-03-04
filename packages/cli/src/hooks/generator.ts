/**
 * Hook file generator — writes and removes editor hook files.
 */
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getEditorFiles, SUPPORTED_EDITORS, type EditorId } from './templates.js';

/**
 * Install editor hooks for the given editor.
 * Returns list of files written.
 */
export function installHooks(editor: EditorId, agentPath: string): string[] {
  const files = getEditorFiles(editor, agentPath);
  const written: string[] = [];

  const overwritten: string[] = [];
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(agentPath, relPath);
    if (existsSync(absPath)) overwritten.push(relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, 'utf-8');
    written.push(relPath);
  }
  if (overwritten.length > 0) {
    console.warn(`Warning: overwritten existing file(s): ${overwritten.join(', ')}`);
  }

  return written;
}

/**
 * Remove editor hooks for the given editor.
 * Returns list of files removed.
 */
export function removeHooks(editor: EditorId, agentPath: string): string[] {
  const files = getEditorFiles(editor, agentPath);
  const removed: string[] = [];

  for (const relPath of Object.keys(files)) {
    const absPath = join(agentPath, relPath);
    if (existsSync(absPath)) {
      unlinkSync(absPath);
      removed.push(relPath);
    }
  }

  return removed;
}

/**
 * Detect which editors have hooks installed.
 */
export function detectInstalledHooks(agentPath: string): EditorId[] {
  const installed: EditorId[] = [];

  for (const editor of SUPPORTED_EDITORS) {
    const files = getEditorFiles(editor, agentPath);
    const allExist = Object.keys(files).every((relPath) => existsSync(join(agentPath, relPath)));
    if (allExist) {
      installed.push(editor);
    }
  }

  return installed;
}
