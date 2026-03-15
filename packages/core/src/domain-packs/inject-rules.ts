/**
 * Domain-level CLAUDE.md injection for domain packs.
 *
 * Each pack can inject behavioral rules under its own marker:
 *   <!-- domain:packName --> ... <!-- /domain:packName -->
 *
 * Injection is idempotent — existing content between markers is replaced.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OPEN_MARKER = (name: string) => `<!-- domain:${name} -->`;
const CLOSE_MARKER = (name: string) => `<!-- /domain:${name} -->`;

/**
 * Inject domain rules into a CLAUDE.md file.
 *
 * @param filePath - Path to CLAUDE.md
 * @param packName - Domain pack name (used in markers)
 * @param rulesContent - Markdown content to inject
 */
export function injectDomainRules(filePath: string, packName: string, rulesContent: string): void {
  if (!rulesContent || rulesContent.trim().length === 0) return;

  const open = OPEN_MARKER(packName);
  const close = CLOSE_MARKER(packName);
  const block = `${open}\n${rulesContent.trim()}\n${close}`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, block + '\n', 'utf-8');
    return;
  }

  let content = readFileSync(filePath, 'utf-8');

  // Replace existing block if present (idempotent)
  const openIdx = content.indexOf(open);
  const closeIdx = content.indexOf(close);

  if (openIdx !== -1 && closeIdx !== -1) {
    const before = content.slice(0, openIdx);
    const after = content.slice(closeIdx + close.length);
    content = before + block + after;
  } else {
    // Append at end
    content = content.trimEnd() + '\n\n' + block + '\n';
  }

  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Remove domain rules from a CLAUDE.md file.
 *
 * @param filePath - Path to CLAUDE.md
 * @param packName - Domain pack name
 */
export function removeDomainRules(filePath: string, packName: string): void {
  if (!existsSync(filePath)) return;

  const open = OPEN_MARKER(packName);
  const close = CLOSE_MARKER(packName);

  let content = readFileSync(filePath, 'utf-8');
  const openIdx = content.indexOf(open);
  const closeIdx = content.indexOf(close);

  if (openIdx !== -1 && closeIdx !== -1) {
    const before = content.slice(0, openIdx);
    const after = content.slice(closeIdx + close.length);
    content = (before + after).replace(/\n{3,}/g, '\n\n');
    writeFileSync(filePath, content, 'utf-8');
  }
}
