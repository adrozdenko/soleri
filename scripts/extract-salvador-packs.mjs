#!/usr/bin/env node
/**
 * Extract Salvador vault knowledge into Soleri knowledge packs.
 *
 * Reads markdown files with YAML frontmatter from Salvador's vault,
 * filters out noise, and produces IntelligenceBundle JSON files
 * organized into three packs: salvador-craft, salvador-engineering, salvador-uipro.
 *
 * Usage: node scripts/extract-salvador-packs.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────

const SALVADOR_VAULT = resolve(process.env.HOME, 'projects/salvador/docs/vault');
const SOLERI_VAULT = resolve(process.env.HOME, 'projects/soleri/docs/vault');
const OUTPUT_DIR = resolve(process.env.HOME, 'projects/soleri/knowledge-packs/salvador');
const DRY_RUN = process.argv.includes('--dry-run');

// Pack definitions: which categories map to which pack
const PACK_DEFS = {
  'salvador-craft': {
    name: 'Salvador Craft — Design & Accessibility',
    description:
      "Design system intelligence, token priority, accessibility rules, UX patterns, component patterns, and styling enforcement. Extracted from Salvador's production vault.",
    version: '1.0.0',
    domains: ['design', 'accessibility', 'ux'],
    categories: new Set([
      'accessibility',
      'components',
      'design',
      'design-tokens',
      'styling',
      'ux',
      'ux-laws',
    ]),
  },
  'salvador-engineering': {
    name: 'Salvador Engineering — Architecture & Tooling',
    description:
      "Architecture patterns, CLI tooling, TypeScript enforcement, testing strategies, security patterns, and methodology. Extracted from Salvador's production vault.",
    version: '1.0.0',
    domains: ['architecture', 'tooling', 'testing', 'security'],
    categories: new Set([
      'architecture',
      'express',
      'leadership',
      'methodology',
      'monorepo',
      'other',
      'performance',
      'prisma',
      'react',
      'security',
      'testing',
      'tooling',
      'typescript',
      'communication',
      'product-strategy',
    ]),
  },
  'salvador-uipro': {
    name: 'Salvador UI Pro — Design Reference Library',
    description:
      '96 color palettes, 67 UI styles, 13 tech stacks, font pairings, chart recommendations, UX patterns, and landing page patterns. A comprehensive design reference library.',
    version: '1.0.0',
    domains: ['ui-design'],
    categories: new Set([]), // matched by ID prefix instead
    idPrefix: 'uipro-',
  },
};

// Noise filters: entries to exclude
const NOISE_PATTERNS = [
  /^pattern-.*-plan-gpt-/, // auto-captured plan step descriptions
  /^pattern-.*-plan-approved-/, // plan approval records
  /capture-orchestrated-workflow-session$/, // duplicate workflow sessions
];

// ── YAML frontmatter parser (simple, no deps) ──────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const yaml = match[1];
  const body = match[2].trim();
  const meta = {};

  for (const line of yaml.split('\n')) {
    // Handle continuation lines (YAML arrays with - items)
    if (line.startsWith('  - ')) continue; // skip array items, handled by bracket syntax

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const [, key, rawVal] = kvMatch;
    let val = rawVal.trim();

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    // Parse arrays [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Parse numbers
    if (/^\d+$/.test(val)) val = Number(val);

    meta[key] = val;
  }

  // Handle multi-line YAML arrays (indented with - )
  const tagBlockMatch = yaml.match(/^tags:\s*\n((?:\s+-\s+.*\n?)+)/m);
  if (tagBlockMatch) {
    meta.tags = tagBlockMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean);
  }

  return { meta, body };
}

// ── File walker ─────────────────────────────────────────────────────────

function walkDir(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith('.md') && !entry.startsWith('_') && entry !== 'README.md') {
      files.push(full);
    }
  }
  return files;
}

// ── Transform vault entry to IntelligenceEntry ──────────────────────────

function toIntelligenceEntry(meta, body) {
  const entry = {
    id: meta.id,
    type: mapType(meta.knowledge_type),
    domain: meta.category || 'general',
    title: meta.title,
    severity: meta.severity || 'suggestion',
    description: body,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
  };

  if (meta.applies_to)
    entry.appliesTo = Array.isArray(meta.applies_to) ? meta.applies_to : [meta.applies_to];
  if (meta.tier === 'canonical') entry.tier = 'agent';
  if (meta.related_pattern) entry.context = `Related: ${meta.related_pattern}`;

  return entry;
}

function mapType(knowledgeType) {
  const map = {
    pattern: 'pattern',
    'anti-pattern': 'anti-pattern',
    principle: 'rule',
    concept: 'rule',
    reference: 'pattern',
    workflow: 'playbook',
    idea: 'pattern',
    roadmap: 'pattern',
  };
  return map[knowledgeType] || 'pattern';
}

// ── Noise filter ────────────────────────────────────────────────────────

function isNoise(meta) {
  if (!meta.id) return true;
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(meta.id)) return true;
  }
  return false;
}

// ── Route entry to pack ─────────────────────────────────────────────────

function routeToPack(meta) {
  // UI Pro entries go to uipro pack regardless of category
  if (meta.id?.startsWith('uipro-')) return 'salvador-uipro';

  const cat = meta.category;
  for (const [packId, def] of Object.entries(PACK_DEFS)) {
    if (def.categories.has(cat)) return packId;
  }

  // Fallback: engineering catches everything else
  return 'salvador-engineering';
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  console.log('Extracting Salvador vault knowledge into Soleri packs...\n');

  // Collect entries from both Salvador vault locations
  const vaultDirs = [
    join(SALVADOR_VAULT, 'patterns'),
    join(SALVADOR_VAULT, 'anti-patterns'),
    join(SALVADOR_VAULT, 'principles'),
    join(SALVADOR_VAULT, 'concepts'),
    join(SALVADOR_VAULT, 'references'),
    join(SALVADOR_VAULT, 'workflows'),
    join(SALVADOR_VAULT, 'auto-extracted'),
    // Also pull from Soleri's own vault (non-session entries)
    join(SOLERI_VAULT, 'patterns'),
    join(SOLERI_VAULT, 'anti-patterns'),
    join(SOLERI_VAULT, 'principles'),
    join(SOLERI_VAULT, 'references'),
    join(SOLERI_VAULT, 'workflows'),
    join(SOLERI_VAULT, 'ideas'),
    join(SOLERI_VAULT, 'roadmap'),
  ];

  const allFiles = [];
  for (const dir of vaultDirs) {
    walkDir(dir, allFiles);
  }

  console.log(`Found ${allFiles.length} vault files\n`);

  // Parse and route
  const packs = {
    'salvador-craft': [],
    'salvador-engineering': [],
    'salvador-uipro': [],
  };
  const stats = { total: 0, noise: 0, noFrontmatter: 0, routed: 0 };
  const seenIds = new Set();

  for (const file of allFiles) {
    stats.total++;
    const content = readFileSync(file, 'utf-8');
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      stats.noFrontmatter++;
      continue;
    }

    const { meta, body } = parsed;

    if (isNoise(meta)) {
      stats.noise++;
      continue;
    }

    // Deduplicate by ID
    if (seenIds.has(meta.id)) continue;
    seenIds.add(meta.id);

    const packId = routeToPack(meta);
    const entry = toIntelligenceEntry(meta, body);
    packs[packId].push(entry);
    stats.routed++;
  }

  console.log('=== Extraction Stats ===');
  console.log(`  Total files:      ${stats.total}`);
  console.log(`  No frontmatter:   ${stats.noFrontmatter}`);
  console.log(`  Noise filtered:   ${stats.noise}`);
  console.log(`  Routed:           ${stats.routed}`);
  console.log();

  for (const [packId, entries] of Object.entries(packs)) {
    const def = PACK_DEFS[packId];
    console.log(`  ${packId}: ${entries.length} entries`);

    if (DRY_RUN) continue;

    // Create pack directory
    const packDir = join(OUTPUT_DIR, packId);
    const vaultDir = join(packDir, 'vault');
    mkdirSync(vaultDir, { recursive: true });

    // Write manifest
    const manifest = {
      id: packId,
      name: def.name,
      version: def.version,
      description: def.description,
      domains: def.domains,
      vault: { dir: 'vault' },
    };
    writeFileSync(join(packDir, 'soleri-pack.json'), JSON.stringify(manifest, null, 2) + '\n');

    // Group entries by domain for separate bundle files
    const byDomain = {};
    for (const entry of entries) {
      const domain = entry.domain;
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(entry);
    }

    // Write one bundle file per domain
    for (const [domain, domainEntries] of Object.entries(byDomain)) {
      const bundle = {
        domain,
        version: def.version,
        entries: domainEntries,
      };
      const filename = `${domain}.json`;
      writeFileSync(join(vaultDir, filename), JSON.stringify(bundle, null, 2) + '\n');
    }

    console.log(`    → wrote ${Object.keys(byDomain).length} bundle(s) to ${packDir}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files written. Remove --dry-run to generate packs.');
  } else {
    console.log('\nDone! Packs written to:', OUTPUT_DIR);
  }
}

main();
