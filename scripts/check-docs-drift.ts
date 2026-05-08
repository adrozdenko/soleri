#!/usr/bin/env tsx
/**
 * Doc-drift checker — fails CI when claims in `src/content/docs/` diverge
 * from source-of-truth in `packages/`.
 *
 * Detectors (Epic #791 / issue #779):
 *   1. Enum lists (TONES, ENGINE_PROFILES, SETUP_TARGETS) — extracted from
 *      packages/forge/src/agent-schema.ts vs. claims in agent-yaml-reference.md
 *   2. CLI command list — packages/cli/src/commands/*.ts vs. ### sections in
 *      cli-reference.md (under ## Commands)
 *   3. Engine module count — PROFILE_MODULES.full length in
 *      packages/core/src/engine/module-registry.ts vs. "All N modules" claims
 *   4. Engine profile module sets — PROFILE_MODULES.{minimal,standard,full}
 *      vs. the profile table in agent-yaml-reference.md
 *
 * Run: `npm run docs:check-drift`
 * CI:  `.github/workflows/doc-drift.yml`
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_ROOT = join(REPO_ROOT, 'src/content/docs/docs');
const AGENT_SCHEMA = join(REPO_ROOT, 'packages/forge/src/agent-schema.ts');
const MODULE_REGISTRY = join(REPO_ROOT, 'packages/core/src/engine/module-registry.ts');
const CLI_COMMANDS_DIR = join(REPO_ROOT, 'packages/cli/src/commands');

export interface Drift {
  detector: string;
  file: string;
  line: number;
  expected: string;
  actual: string;
}

// ─── Detector 1: Enum drift ──────────────────────────────────────────

/** Extract a string-array constant declaration from a TypeScript source file. */
export function extractStringArrayConst(source: string, name: string): string[] | null {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]\\s*as\\s*const`, 's');
  const m = source.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((mm) => mm[1]);
}

/** Doc convention: `**Values:** \`a\` | \`b\` | \`c\`` lines list enum values. */
export function findValuesLines(doc: string): Array<{ line: number; values: string[] }> {
  const out: Array<{ line: number; values: string[] }> = [];
  const lines = doc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\*\*Values:\*\*\s+(.+)/);
    if (!m) continue;
    const values = [...m[1].matchAll(/`([^`]+)`/g)].map((mm) => mm[1]);
    if (values.length > 0) out.push({ line: i + 1, values });
  }
  return out;
}

export function checkEnumDrift(schemaSource: string, docPath: string, docContent: string): Drift[] {
  const drifts: Drift[] = [];
  const enumsToCheck: Array<{ name: string; field: string }> = [
    { name: 'TONES', field: 'tone' },
    { name: 'ENGINE_PROFILES', field: 'engine.profile' },
    { name: 'SETUP_TARGETS', field: 'setup.target' },
  ];

  for (const { name } of enumsToCheck) {
    const sourceValues = extractStringArrayConst(schemaSource, name);
    if (!sourceValues) continue;
    const sourceSet = new Set(sourceValues);
    for (const { line, values } of findValuesLines(docContent)) {
      const docSet = new Set(values);
      // Only treat as a candidate match if every doc value is in source OR vice versa
      // (avoids matching unrelated `**Values:**` lines for other enums)
      const overlap = [...docSet].filter((v) => sourceSet.has(v));
      if (overlap.length === 0) continue;
      // Now require an exact set match
      if (sourceSet.size !== docSet.size || overlap.length !== sourceSet.size) {
        drifts.push({
          detector: `enum:${name}`,
          file: docPath,
          line,
          expected: [...sourceSet].sort().join(' | '),
          actual: [...docSet].sort().join(' | '),
        });
      }
    }
  }
  return drifts;
}

// ─── Detector 2: CLI command list drift ──────────────────────────────

export function listCliCommands(commandsDir: string): string[] {
  return readdirSync(commandsDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

export function findDocCommandSections(doc: string): {
  commands: Set<string>;
  firstLine: number;
} {
  const lines = doc.split('\n');
  let inCommands = false;
  let firstLine = 0;
  const commands = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Commands\s*$/.test(line)) {
      inCommands = true;
      continue;
    }
    if (inCommands && /^##\s+(?!#)/.test(line)) {
      // Hit the next H2 — Commands section is closed
      break;
    }
    if (inCommands) {
      const m = line.match(/^###\s+([\w-]+)\s*$/);
      if (m) {
        if (firstLine === 0) firstLine = i + 1;
        commands.add(m[1]);
      }
    }
  }
  return { commands, firstLine };
}

export function checkCliCommandDrift(
  sourceCommands: string[],
  docPath: string,
  docContent: string,
): Drift[] {
  const sourceSet = new Set(sourceCommands);
  const { commands: docCommands, firstLine } = findDocCommandSections(docContent);
  const missingFromDocs = [...sourceSet].filter((c) => !docCommands.has(c));
  const extraInDocs = [...docCommands].filter((c) => !sourceSet.has(c));
  if (missingFromDocs.length === 0 && extraInDocs.length === 0) return [];
  return [
    {
      detector: 'cli:commands',
      file: docPath,
      line: firstLine,
      expected: [...sourceSet].sort().join(', '),
      actual: [...docCommands].sort().join(', '),
    },
  ];
}

// ─── Detector 3: Engine module count ─────────────────────────────────

export function extractFullProfileModules(registrySource: string): string[] | null {
  const m = registrySource.match(/full:\s*\[([^\]]*)\]/s);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((mm) => mm[1]);
}

/** Doc convention: `All N modules` (e.g. "All 22 modules"). */
export function findModuleCountClaims(doc: string): Array<{ line: number; count: number }> {
  const out: Array<{ line: number; count: number }> = [];
  const lines = doc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/All\s+(\d+)\s+modules\b/i);
    if (m) out.push({ line: i + 1, count: parseInt(m[1], 10) });
  }
  return out;
}

export function checkModuleCountDrift(
  fullModules: string[],
  docPath: string,
  docContent: string,
): Drift[] {
  const expected = fullModules.length;
  return findModuleCountClaims(docContent)
    .filter((c) => c.count !== expected)
    .map((c) => ({
      detector: 'engine:moduleCount',
      file: docPath,
      line: c.line,
      expected: `All ${expected} modules`,
      actual: `All ${c.count} modules`,
    }));
}

// ─── Detector 4: Profile module sets ─────────────────────────────────

export function extractProfileModule(
  registrySource: string,
  profile: 'minimal' | 'standard' | 'full',
): string[] | null {
  const re = new RegExp(`${profile}:\\s*\\[([^\\]]*)\\]`, 's');
  const m = registrySource.match(re);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((mm) => mm[1]);
}

/**
 * Doc convention: a markdown table row like
 * `| `minimal` | vault, admin, control, orchestrate | ...`
 * We detect rows whose first cell wraps a known profile name in backticks.
 */
export function findProfileTableRows(
  doc: string,
): Array<{ line: number; profile: string; modules: string[] }> {
  const out: Array<{ line: number; profile: string; modules: string[] }> = [];
  const lines = doc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*`(minimal|standard|full)`\s*\|\s*([^|]+?)\s*\|/);
    if (!m) continue;
    const profile = m[1];
    const cell = m[2].trim();
    // Cells may include "+ vault, plan, ..." — strip a leading + and split commas
    const modules = cell
      .replace(/^\+\s*/, '')
      .split(',')
      .map((s) => s.trim().replace(/[\s,]+$/, ''))
      .filter((s) => s.length > 0 && /^[\w-]+$/.test(s));
    if (modules.length > 0) out.push({ line: i + 1, profile, modules });
  }
  return out;
}

export function checkProfileModuleDrift(
  registrySource: string,
  docPath: string,
  docContent: string,
): Drift[] {
  const drifts: Drift[] = [];
  for (const row of findProfileTableRows(docContent)) {
    if (row.profile === 'full') {
      // The "full" cell often says "All N modules", not the literal list — handled by detector 3
      continue;
    }
    const sourceModules = extractProfileModule(
      registrySource,
      row.profile as 'minimal' | 'standard',
    );
    if (!sourceModules) continue;
    const sourceSet = new Set(sourceModules);
    const docSet = new Set(row.modules);

    // Standard profile in docs uses additive notation ("+ plan, brain, ...")
    // meaning "minimal modules + these". Re-derive expected delta if we can.
    let expectedSet = sourceSet;
    if (row.profile === 'standard') {
      const minimal = extractProfileModule(registrySource, 'minimal');
      if (minimal) {
        expectedSet = new Set(sourceModules.filter((m) => !minimal.includes(m)));
      }
    }

    if (
      expectedSet.size !== docSet.size ||
      [...expectedSet].some((m) => !docSet.has(m)) ||
      [...docSet].some((m) => !expectedSet.has(m))
    ) {
      drifts.push({
        detector: `engine:profile:${row.profile}`,
        file: docPath,
        line: row.line,
        expected: [...expectedSet].sort().join(', '),
        actual: [...docSet].sort().join(', '),
      });
    }
  }
  return drifts;
}

// ─── Runner ──────────────────────────────────────────────────────────

function loadDoc(name: string): { path: string; content: string } | null {
  const path = join(DOCS_ROOT, name);
  if (!existsSync(path)) return null;
  return { path, content: readFileSync(path, 'utf-8') };
}

function relPath(absPath: string): string {
  return absPath.startsWith(REPO_ROOT) ? absPath.slice(REPO_ROOT.length + 1) : absPath;
}

export function runAllDetectors(): Drift[] {
  const drifts: Drift[] = [];
  const schemaSource = readFileSync(AGENT_SCHEMA, 'utf-8');
  const registrySource = readFileSync(MODULE_REGISTRY, 'utf-8');
  const cliCommands = listCliCommands(CLI_COMMANDS_DIR);

  const agentYaml = loadDoc('agent-yaml-reference.md');
  if (agentYaml) {
    drifts.push(...checkEnumDrift(schemaSource, relPath(agentYaml.path), agentYaml.content));
    const fullModules = extractFullProfileModules(registrySource) ?? [];
    drifts.push(...checkModuleCountDrift(fullModules, relPath(agentYaml.path), agentYaml.content));
    drifts.push(
      ...checkProfileModuleDrift(registrySource, relPath(agentYaml.path), agentYaml.content),
    );
  }

  const cliRef = loadDoc('cli-reference.md');
  if (cliRef) {
    drifts.push(...checkCliCommandDrift(cliCommands, relPath(cliRef.path), cliRef.content));
  }

  return drifts;
}

function main(): void {
  const drifts = runAllDetectors();
  if (drifts.length === 0) {
    console.log('doc-drift: no drift detected');
    process.exit(0);
  }
  console.error(`doc-drift: ${drifts.length} drift(s) detected:\n`);
  for (const d of drifts) {
    console.error(`  [${d.detector}] ${d.file}:${d.line}`);
    console.error(`    expected: ${d.expected}`);
    console.error(`    actual:   ${d.actual}\n`);
  }
  process.exit(1);
}

const isDirectExecution =
  process.argv[1]?.endsWith('check-docs-drift.ts') ||
  process.argv[1]?.endsWith('check-docs-drift.js');
if (isDirectExecution) {
  main();
}
