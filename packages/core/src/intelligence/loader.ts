import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { IntelligenceBundle, IntelligenceEntry } from './types.js';

export function loadIntelligenceData(dataDir: string): IntelligenceEntry[] {
  const entries: IntelligenceEntry[] = [];
  let files: string[];
  try {
    files = readdirSync(dataDir).filter((f) => f.endsWith('.json') && f !== 'soleri-pack.json');
  } catch {
    console.warn('Intelligence data directory not found: ' + dataDir);
    return entries;
  }

  const packDomain = readPackDomain(dataDir);

  for (const file of files) {
    try {
      const raw = readFileSync(join(dataDir, file), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const bundle = toBundleEnvelope(parsed, file, dataDir, packDomain);
      if (!bundle) continue;
      for (const entry of bundle.entries) {
        if (validateEntry(entry)) entries.push(entry);
      }
    } catch (err) {
      console.warn('Failed to load ' + file + ': ' + (err instanceof Error ? err.message : err));
    }
  }
  return entries;
}

/** Read `soleri-pack.json` from the data directory to resolve domain names. */
function readPackDomain(dataDir: string): string | undefined {
  const packPath = join(dataDir, 'soleri-pack.json');
  if (!existsSync(packPath)) return undefined;
  try {
    const pack: unknown = JSON.parse(readFileSync(packPath, 'utf-8'));
    if (pack && typeof pack === 'object' && 'domains' in pack) {
      const domains = (pack as { domains: unknown }).domains;
      if (Array.isArray(domains) && domains.length > 0 && typeof domains[0] === 'string') {
        return domains[0];
      }
    }
  } catch {
    /* ignore malformed pack file */
  }
  return undefined;
}

/** Normalise parsed JSON into an IntelligenceBundle, handling bare arrays. */
function toBundleEnvelope(
  parsed: unknown,
  file: string,
  dataDir: string,
  packDomain: string | undefined,
): IntelligenceBundle | undefined {
  // Already a bundled envelope
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.entries)) return parsed as IntelligenceBundle;
    return undefined;
  }

  // Bare array — wrap in an envelope
  if (Array.isArray(parsed)) {
    const domain = packDomain ?? inferDomain(file, dataDir);
    return { domain, version: '1.0.0', entries: parsed as IntelligenceEntry[] };
  }

  return undefined;
}

/** Infer domain from filename, falling back to parent directory name. */
function inferDomain(file: string, dataDir: string): string {
  const stem = basename(file, '.json');
  // Generic filenames like "patterns", "rules", "entries" — use parent dir name instead
  const generic = new Set(['patterns', 'rules', 'entries', 'data', 'index']);
  if (generic.has(stem)) return basename(dirname(dataDir + '/')) || stem;
  return stem;
}

function validateEntry(entry: IntelligenceEntry): boolean {
  return (
    typeof entry.id === 'string' &&
    entry.id.length > 0 &&
    ['pattern', 'anti-pattern', 'rule', 'playbook'].includes(entry.type) &&
    typeof entry.title === 'string' &&
    entry.title.length > 0 &&
    typeof entry.description === 'string' &&
    entry.description.length > 0 &&
    ['critical', 'warning', 'suggestion'].includes(entry.severity) &&
    Array.isArray(entry.tags)
  );
}
