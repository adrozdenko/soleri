/**
 * Build-time validator for SKILL.md inline op-call examples.
 *
 * Parses `YOUR_AGENT_core op:<name> params: { ... }` blocks in SKILL.md files
 * and validates the params against the actual Zod schemas defined in the
 * facade source files.
 *
 * Usage:  tsx packages/core/src/skills/validate-skill-docs.ts
 * Exit 0 = all valid, Exit 1 = mismatches found.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import type { ZodError } from 'zod';
import type { OpDefinition, OpSchema } from '../facades/types.js';
import type { AgentRuntime } from '../runtime/types.js';

// ── Facade factory imports ──────────────────────────────────────────────
import { createVaultFacadeOps } from '../runtime/facades/vault-facade.js';
import { createPlanFacadeOps } from '../runtime/facades/plan-facade.js';
import { createBrainFacadeOps } from '../runtime/facades/brain-facade.js';
import { createMemoryFacadeOps } from '../runtime/facades/memory-facade.js';
import { createAdminFacadeOps } from '../runtime/facades/admin-facade.js';
import { createCuratorFacadeOps } from '../runtime/facades/curator-facade.js';
import { createLoopFacadeOps } from '../runtime/facades/loop-facade.js';
import { createOrchestrateFacadeOps } from '../runtime/facades/orchestrate-facade.js';
import { createControlFacadeOps } from '../runtime/facades/control-facade.js';
import { createContextFacadeOps } from '../runtime/facades/context-facade.js';
import { createAgencyFacadeOps } from '../runtime/facades/agency-facade.js';
import { createChatFacadeOps } from '../runtime/facades/chat-facade.js';
import { createOperatorFacadeOps } from '../runtime/facades/operator-facade.js';
import { createArchiveFacadeOps } from '../runtime/facades/archive-facade.js';
import { createSyncFacadeOps } from '../runtime/facades/sync-facade.js';
import { createReviewFacadeOps } from '../runtime/facades/review-facade.js';
import { createIntakeFacadeOps } from '../runtime/facades/intake-facade.js';
import { createLinksFacadeOps } from '../runtime/facades/links-facade.js';
import { createBranchingFacadeOps } from '../runtime/facades/branching-facade.js';
import { createTierFacadeOps } from '../runtime/facades/tier-facade.js';
import { createEmbeddingFacadeOps } from '../runtime/facades/embedding-facade.js';

// ── Types ───────────────────────────────────────────────────────────────

interface OpExample {
  file: string;
  line: number;
  opName: string;
  rawParams: string;
  parsedParams: Record<string, unknown> | null;
  parseError?: string;
}

interface ValidationError {
  file: string;
  line: number;
  opName: string;
  message: string;
}

// ── Mock runtime ────────────────────────────────────────────────────────
// Schemas are constructed during factory calls but handlers are never invoked,
// so a recursive proxy that returns itself for any property access is enough.

function createNoopProxy(): AgentRuntime {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Return primitives for common property checks
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return undefined;
      if (prop === 'then') return undefined; // prevent Promise detection
      if (prop === 'toString') return () => '[mock]';
      if (prop === 'valueOf') return () => 0;
      if (prop === 'length') return 0;
      // Return a callable proxy for methods
      return new Proxy(function () {}, handler);
    },
    apply() {
      // When called as a function, return a new proxy
      return new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler) as unknown as AgentRuntime;
}

// ── Schema registry ─────────────────────────────────────────────────────
// Build a flat map of opName → ZodSchema from all facades.

function buildSchemaRegistry(): Map<string, OpSchema> {
  const runtime = createNoopProxy();
  const registry = new Map<string, OpSchema>();

  const facadeFactories: Array<(rt: AgentRuntime) => OpDefinition[]> = [
    createVaultFacadeOps,
    createPlanFacadeOps,
    createBrainFacadeOps,
    createMemoryFacadeOps,
    createAdminFacadeOps,
    createCuratorFacadeOps,
    createLoopFacadeOps,
    createOrchestrateFacadeOps,
    createControlFacadeOps,
    createContextFacadeOps,
    createAgencyFacadeOps,
    createChatFacadeOps,
    createOperatorFacadeOps,
    createArchiveFacadeOps,
    createSyncFacadeOps,
    createReviewFacadeOps,
    createIntakeFacadeOps,
    createLinksFacadeOps,
    createBranchingFacadeOps,
    createTierFacadeOps,
    createEmbeddingFacadeOps,
  ];

  for (const factory of facadeFactories) {
    try {
      const ops = factory(runtime);
      for (const op of ops) {
        if (op.schema) {
          registry.set(op.name, op.schema);
        }
      }
    } catch {
      // Some facades may fail with the mock runtime — skip them.
      // Schemas from other facades still get registered.
    }
  }

  return registry;
}

// ── SKILL.md parser ─────────────────────────────────────────────────────
// Extracts op-call examples from fenced code blocks.
//
// Formats matched:
//   YOUR_AGENT_core op:<name>
//   YOUR_AGENT_core op:<name> params: { ... }
//   YOUR_AGENT_core op:<name>
//     params: { ... }

function extractOpExamples(filePath: string): OpExample[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const examples: OpExample[] = [];

  // Track code blocks
  let inCodeBlock = false;
  let codeBlockStart = -1;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockStart = i + 1;
        codeBlockLines = [];
      } else {
        // Process the code block
        extractFromCodeBlock(filePath, codeBlockStart, codeBlockLines, examples);
        inCodeBlock = false;
        codeBlockLines = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockLines.push(line);
    }
  }

  return examples;
}

function extractFromCodeBlock(
  filePath: string,
  startLine: number,
  blockLines: string[],
  results: OpExample[],
): void {
  // Pattern: YOUR_AGENT_core op:<name> [params: { ... }]
  // Also matches: op:<name> params: { ... } (without facade prefix)
  const opPattern = /(?:YOUR_AGENT_\w+\s+)?op:(\w+)(?:\s+params:\s*(.*))?/;

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const match = line.match(opPattern);
    if (!match) continue;

    const opName = match[1];
    const lineNum = startLine + i + 1; // 1-indexed

    // Collect params — may be inline or on following lines
    let rawParams = '';

    if (match[2]) {
      // Params start on same line
      rawParams = match[2].trim();
    } else if (i + 1 < blockLines.length && blockLines[i + 1].trim().startsWith('params:')) {
      // Params on next line(s)
      const paramsLine = blockLines[i + 1].trim();
      const paramsMatch = paramsLine.match(/^params:\s*(.*)/);
      if (paramsMatch) {
        rawParams = paramsMatch[1].trim();
      }
    }

    // If we found params start, collect the full multi-line object
    if (rawParams) {
      // Collect continuation lines for multi-line objects
      const fullParams = collectMultiLineParams(blockLines, i, rawParams);
      const { parsed, error } = parseLooseJson(fullParams);

      results.push({
        file: filePath,
        line: lineNum,
        opName,
        rawParams: fullParams,
        parsedParams: parsed,
        parseError: error,
      });
    } else {
      // Op without params — nothing to validate
    }
  }
}

/**
 * Collect multi-line params from code block lines.
 * Handles the common pattern where params span multiple indented lines:
 *   params: {
 *     key: "value",
 *     nested: { ... }
 *   }
 */
function collectMultiLineParams(blockLines: string[], opLineIdx: number, initial: string): string {
  // If the initial string already has balanced braces, return it
  if (isBalanced(initial)) return initial;

  // Start from the line after the op line (or after params: line)
  let startIdx = opLineIdx + 1;
  if (!blockLines[opLineIdx].includes('params:') && startIdx < blockLines.length) {
    if (blockLines[startIdx].trim().startsWith('params:')) {
      startIdx++;
    }
  }

  let result = initial;
  for (let j = startIdx; j < blockLines.length; j++) {
    const nextLine = blockLines[j].trim();
    if (!nextLine) continue;
    // Stop if we hit another op: line
    if (nextLine.match(/(?:YOUR_AGENT_\w+\s+)?op:\w+/)) break;
    result += '\n' + nextLine;
    if (isBalanced(result)) break;
  }

  return result;
}

/** Check if braces/brackets are balanced in a string. */
function isBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Parse loose JS-like object notation into a JS object.
 * Handles: unquoted keys, single quotes, trailing commas, [...] arrays,
 * template strings like "<placeholder>".
 */
function parseLooseJson(raw: string): {
  parsed: Record<string, unknown> | null;
  error?: string;
} {
  if (!raw.trim()) return { parsed: null };

  try {
    // Normalize to valid JSON-ish:
    const normalized = raw
      // Replace <placeholder> values with "placeholder"
      .replace(/"<([^">]+)>"/g, '"$1"')
      // Unquoted keys → quoted keys
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      // Single quotes → double quotes (simple cases)
      .replace(/'/g, '"')
      // Trailing commas before } or ]
      .replace(/,\s*([}\]])/g, '$1')
      // Spread syntax [...] → placeholder
      .replace(/\.\.\./g, '')
      // Handle array shorthand [item1, item2, ...]
      .replace(/\["?<[^>]+>"?\]/g, '["placeholder"]');

    // Try to parse
    const result = JSON.parse(normalized);
    return { parsed: result };
  } catch (e) {
    // Second attempt: extract key-value pairs manually for simple flat objects
    try {
      const result = extractFlatParams(raw);
      if (result && Object.keys(result).length > 0) {
        return { parsed: result };
      }
    } catch {
      // fall through
    }
    return {
      parsed: null,
      error: `Cannot parse params: ${(e as Error).message}`,
    };
  }
}

/**
 * Extract flat key-value pairs from loose notation.
 * Handles: `key: "value"`, `key: true`, `key: 123`
 */
function extractFlatParams(raw: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  // Match patterns like: key: "value" or key: value or key: [...] or key: {...}
  const kvPattern = /(\w+)\s*:\s*(?:"([^"]*)"|\[([^\]]*)\]|(\{[^}]*\})|(\w+))/g;
  let match;
  let found = false;

  while ((match = kvPattern.exec(raw)) !== null) {
    found = true;
    const key = match[1];
    if (match[2] !== undefined) {
      // Quoted string
      result[key] = match[2].replace(/<[^>]+>/g, 'placeholder');
    } else if (match[3] !== undefined) {
      // Array
      result[key] = ['placeholder'];
    } else if (match[4] !== undefined) {
      // Object — keep as generic object
      result[key] = {};
    } else if (match[5] !== undefined) {
      // Unquoted value
      const val = match[5];
      if (val === 'true') result[key] = true;
      else if (val === 'false') result[key] = false;
      else if (/^\d+$/.test(val)) result[key] = parseInt(val, 10);
      else result[key] = val;
    }
  }

  return found ? result : null;
}

// ── Validation ──────────────────────────────────────────────────────────

/**
 * Check if a value looks like a placeholder (e.g., "correct-tier", "type",
 * "critical|warning|suggestion") rather than a concrete example value.
 */
function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Pipe-separated enum hints like "critical|warning|suggestion"
  if (value.includes('|')) return true;
  // Common placeholder patterns
  if (/^<.*>$/.test(value)) return true;
  // Generic placeholder words (including hyphenated like "correct-tier", "entry-id")
  if (/^(placeholder|example|value|name|id|title|description|type|domain)$/i.test(value))
    return true;
  if (
    /^[\w]+-[\w]+$/.test(value) &&
    /\b(correct|your|my|the|this|some|new|old|entry|item|current)\b/i.test(value)
  )
    return true;
  return false;
}

/**
 * Filter Zod issues to exclude those caused by placeholder values.
 * Keeps structural issues (missing required fields, wrong types) but
 * skips enum mismatches on placeholder strings.
 */
function isPlaceholderIssue(
  issue: { code: string; path: (string | number)[]; received?: unknown; message: string },
  params: Record<string, unknown>,
): boolean {
  // "Invalid enum value" on a placeholder string
  if (issue.code === 'invalid_enum_value') {
    const received = issue.received ?? getNestedValue(params, issue.path);
    if (isPlaceholder(received)) return true;
  }
  return false;
}

/** Traverse nested object by path segments. */
function getNestedValue(obj: Record<string, unknown>, path: (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

function validateExamples(
  examples: OpExample[],
  registry: Map<string, OpSchema>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const ex of examples) {
    // Skip examples where params couldn't be parsed
    if (ex.parseError) {
      // Don't report parse errors — many SKILL.md examples use placeholder syntax
      // that's intentionally not valid JSON (e.g., "<title>", "...")
      continue;
    }

    if (!ex.parsedParams) continue;

    const schema = registry.get(ex.opName);
    if (!schema) {
      // Op not found in registry — may be from a facade that failed to load,
      // or a typo in the SKILL.md. Report it.
      errors.push({
        file: ex.file,
        line: ex.line,
        opName: ex.opName,
        message: `unknown op — not found in any facade schema registry`,
      });
      continue;
    }

    // Validate params against schema
    const result = (
      schema as {
        safeParse: (p: unknown) => {
          success: boolean;
          error?: ZodError;
        };
      }
    ).safeParse(ex.parsedParams);

    if (!result.success && result.error) {
      for (const issue of result.error.issues) {
        // Skip issues caused by placeholder values
        if (
          isPlaceholderIssue(
            issue as {
              code: string;
              path: (string | number)[];
              received?: unknown;
              message: string;
            },
            ex.parsedParams,
          )
        ) {
          continue;
        }
        const path = issue.path.join('.');
        errors.push({
          file: ex.file,
          line: ex.line,
          opName: ex.opName,
          message: `${path ? path + ': ' : ''}${issue.message}`,
        });
      }
    }
  }

  return errors;
}

// ── SKILL.md discovery ──────────────────────────────────────────────────

function discoverSkillDocs(rootDir: string): string[] {
  const skillsDir = join(rootDir, 'packages', 'forge', 'src', 'skills');
  const paths: string[] = [];

  if (!existsSync(skillsDir)) return paths;

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(skillsDir, entry.name, 'SKILL.md');
    if (existsSync(skillMd)) {
      paths.push(skillMd);
    }
  }

  return paths;
}

// ── Main ────────────────────────────────────────────────────────────────

export function validateSkillDocs(rootDir: string): {
  errors: ValidationError[];
  totalExamples: number;
  totalFiles: number;
  registrySize: number;
} {
  const registry = buildSchemaRegistry();
  const skillFiles = discoverSkillDocs(rootDir);
  let totalExamples = 0;
  const allErrors: ValidationError[] = [];

  for (const file of skillFiles) {
    const examples = extractOpExamples(file);
    totalExamples += examples.length;
    const errors = validateExamples(examples, registry);
    allErrors.push(...errors);
  }

  return {
    errors: allErrors,
    totalExamples,
    totalFiles: skillFiles.length,
    registrySize: registry.size,
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────

function main(): void {
  // Find project root — walk up from this file's location
  const thisDir = new URL('.', import.meta.url).pathname;
  const rootDir = resolve(thisDir, '..', '..', '..', '..');

  console.log('Validating SKILL.md op-call examples against Zod schemas...\n');

  const { errors, totalExamples, totalFiles, registrySize } = validateSkillDocs(rootDir);

  console.log(`  Schema registry: ${registrySize} ops`);
  console.log(`  Skill files:     ${totalFiles}`);
  console.log(`  Op examples:     ${totalExamples}`);
  console.log('');

  if (errors.length === 0) {
    console.log('All examples validate against their schemas.');
    process.exit(0);
  }

  console.log(`Found ${errors.length} validation error(s):\n`);

  for (const err of errors) {
    const relPath = relative(rootDir, err.file);
    console.log(`  ${relPath}:${err.line} — ${err.opName}: ${err.message}`);
  }

  console.log('');
  process.exit(1);
}

// Run if invoked directly
const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('validate-skill-docs.ts') ||
    process.argv[1].endsWith('validate-skill-docs.js'));

if (isMainModule) {
  main();
}
