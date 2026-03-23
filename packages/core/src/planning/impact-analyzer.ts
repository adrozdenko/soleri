/**
 * Impact Analyzer — post-implementation impact analysis.
 *
 * Scans modified files for downstream consumers (imports/requires),
 * detects scope violations, and assigns a risk level.
 * Uses only `fs` and `path` — zero external dependencies.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffectedConsumer {
  file: string;
  imports: string[];
}

export interface ImpactReport {
  modifiedFiles: string[];
  affectedConsumers: AffectedConsumer[];
  untestedConsumers: string[];
  scopeViolations: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);

const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__/, /\.stories\./];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
]);

const MAX_FILES = 5000;

// ---------------------------------------------------------------------------
// ImpactAnalyzer
// ---------------------------------------------------------------------------

export class ImpactAnalyzer {
  /**
   * Analyze the downstream impact of modified files.
   */
  analyzeImpact(modifiedFiles: string[], projectPath: string, planScope?: string[]): ImpactReport {
    if (modifiedFiles.length === 0 || !existsSync(projectPath)) {
      return emptyReport(modifiedFiles);
    }

    const sourceFiles = collectSourceFiles(projectPath);
    const consumers = findConsumers(modifiedFiles, sourceFiles, projectPath);
    const untestedConsumers = filterUntested(consumers);
    const scopeViolations = detectScopeViolations(modifiedFiles, planScope);
    const riskLevel = assessRisk(consumers.length);
    const recommendations = buildRecommendations(consumers, untestedConsumers, scopeViolations);

    return {
      modifiedFiles,
      affectedConsumers: consumers,
      untestedConsumers,
      scopeViolations,
      riskLevel,
      recommendations,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers (all synchronous, all < 30 LOC)
// ---------------------------------------------------------------------------

function emptyReport(modifiedFiles: string[]): ImpactReport {
  return {
    modifiedFiles,
    affectedConsumers: [],
    untestedConsumers: [],
    scopeViolations: [],
    riskLevel: 'low',
    recommendations: [],
  };
}

/**
 * Recursively collect source files under projectPath (up to MAX_FILES).
 */
function collectSourceFiles(dir: string, result: string[] = []): string[] {
  if (result.length >= MAX_FILES) return result;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (result.length >= MAX_FILES) break;
    if (SKIP_DIRS.has(entry)) continue;

    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      collectSourceFiles(full, result);
    } else if (CODE_EXTENSIONS.has(extname(entry))) {
      result.push(full);
    }
  }
  return result;
}

/**
 * Find source files that import any of the modified files.
 */
function findConsumers(
  modifiedFiles: string[],
  sourceFiles: string[],
  projectPath: string,
): AffectedConsumer[] {
  const patterns = buildImportPatterns(modifiedFiles, projectPath);
  if (patterns.length === 0) return [];

  const consumers: AffectedConsumer[] = [];

  for (const file of sourceFiles) {
    // Skip the modified files themselves
    if (modifiedFiles.some((m) => file.endsWith(m) || file === m)) continue;

    const matched = matchImports(file, patterns);
    if (matched.length > 0) {
      consumers.push({ file: relative(projectPath, file), imports: matched });
    }
  }
  return consumers;
}

/**
 * Build regex-friendly stems from modified file paths.
 */
function buildImportPatterns(modifiedFiles: string[], projectPath: string): string[] {
  return modifiedFiles
    .map((f) => {
      const rel = f.startsWith('/') ? relative(projectPath, f) : f;
      // Strip extension for import matching
      const stem = rel.replace(/\.[^.]+$/, '');
      // Also match the bare filename without extension
      const bare = basename(rel).replace(/\.[^.]+$/, '');
      return bare.length >= 3 ? bare : stem;
    })
    .filter((p) => p.length >= 3);
}

/**
 * Read a file and return which patterns appear in its import/require lines.
 */
function matchImports(filePath: string, patterns: string[]): string[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const importRegex =
    /(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  const importPaths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    importPaths.push(match[1] ?? match[2]);
  }

  return patterns.filter((p) => importPaths.some((imp) => imp.includes(p)));
}

/**
 * Filter consumers that are NOT test files.
 */
function filterUntested(consumers: AffectedConsumer[]): string[] {
  return consumers.map((c) => c.file).filter((f) => !TEST_PATTERNS.some((p) => p.test(f)));
}

/**
 * Flag modified files not in the declared plan scope.
 */
function detectScopeViolations(modifiedFiles: string[], planScope?: string[]): string[] {
  if (!planScope || planScope.length === 0) return [];

  return modifiedFiles.filter((f) => {
    const lower = f.toLowerCase();
    return !planScope.some((s) => lower.includes(s.toLowerCase()));
  });
}

/**
 * Assign risk based on consumer count.
 */
function assessRisk(consumerCount: number): ImpactReport['riskLevel'] {
  if (consumerCount <= 1) return 'low';
  if (consumerCount <= 5) return 'medium';
  return 'high';
}

/**
 * Generate actionable recommendation strings.
 */
function buildRecommendations(
  consumers: AffectedConsumer[],
  untestedConsumers: string[],
  scopeViolations: string[],
): string[] {
  const recs: string[] = [];

  if (consumers.length > 0) {
    recs.push(
      `Run tests for ${consumers.length} affected consumer(s): ${consumers
        .map((c) => c.file)
        .slice(0, 5)
        .join(', ')}`,
    );
  }

  for (const file of untestedConsumers.slice(0, 3)) {
    recs.push(`Review import changes in ${file} (no test coverage detected)`);
  }

  for (const file of scopeViolations.slice(0, 3)) {
    recs.push(`Scope violation: ${file} was modified but not in the declared plan scope`);
  }

  return recs;
}
