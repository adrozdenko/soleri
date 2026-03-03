export function generateIntelligenceLoader(): string {
  return `import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { IntelligenceBundle, IntelligenceEntry } from './types.js';

export function loadIntelligenceData(dataDir: string): IntelligenceEntry[] {
  const entries: IntelligenceEntry[] = [];
  let files: string[];
  try {
    files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  } catch {
    console.warn('Intelligence data directory not found: ' + dataDir);
    return entries;
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(dataDir, file), 'utf-8');
      const bundle = JSON.parse(raw) as IntelligenceBundle;
      if (!bundle.entries || !Array.isArray(bundle.entries)) continue;
      for (const entry of bundle.entries) {
        if (validateEntry(entry)) entries.push(entry);
      }
    } catch (err) {
      console.warn('Failed to load ' + file + ': ' + (err instanceof Error ? err.message : err));
    }
  }
  return entries;
}

function validateEntry(entry: IntelligenceEntry): boolean {
  return (
    typeof entry.id === 'string' && entry.id.length > 0 &&
    ['pattern', 'anti-pattern', 'rule'].includes(entry.type) &&
    typeof entry.title === 'string' && entry.title.length > 0 &&
    typeof entry.description === 'string' && entry.description.length > 0 &&
    ['critical', 'warning', 'suggestion'].includes(entry.severity) &&
    Array.isArray(entry.tags)
  );
}
`;
}
