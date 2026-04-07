/**
 * Validator for user-installed SKILL.md op-call examples.
 *
 * Reads all SKILL.md files from a given skills directory (e.g. ~/.claude/skills/),
 * extracts inline op-call examples, and validates their params against the actual
 * Zod schemas from the facade layer.
 *
 * Returns structured results rather than printing or exiting — the CLI layer owns I/O.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

// ── Public types ────────────────────────────────────────────────────────

export interface SkillValidationError {
  file: string;
  op: string;
  message: string;
  line?: number;
}

export interface SkillValidationResult {
  valid: boolean;
  errors: SkillValidationError[];
  totalFiles: number;
  totalExamples: number;
  registrySize: number;
}

// ── Internal types ──────────────────────────────────────────────────────

interface OpExample {
  file: string;
  line: number;
  opName: string;
  rawParams: string;
  parsedParams: Record<string, unknown> | null;
  parseError?: string;
}

// ── Mock runtime ────────────────────────────────────────────────────────
// Schemas are constructed during factory calls but handlers are never invoked.

function createNoopProxy(): AgentRuntime {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return undefined;
      if (prop === 'then') return undefined;
      if (prop === 'toString') return () => '[mock]';
      if (prop === 'valueOf') return () => 0;
      if (prop === 'length') return 0;
      return new Proxy(function () {}, handler);
    },
    apply() {
      return new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler) as unknown as AgentRuntime;
}

// ── Schema registry ─────────────────────────────────────────────────────

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
    }
  }

  return registry;
}

// ── SKILL.md discovery ──────────────────────────────────────────────────
// Discovers all SKILL.md files directly inside skillsDir.
// Supports both layouts:
//   - skillsDir/{name}/SKILL.md  (directory layout)
//   - skillsDir/{name}.md        (flat file layout)

function discoverSkillFiles(skillsDir: string): string[] {
  const paths: string[] = [];

  if (!existsSync(skillsDir)) return paths;

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return paths;
  }

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    try {
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        const skillMd = join(entryPath, 'SKILL.md');
        if (existsSync(skillMd)) {
          paths.push(skillMd);
        }
      } else if (entry.endsWith('.md')) {
        paths.push(entryPath);
      }
    } catch {
      // Skip unreadable entries
    }
  }

  return paths;
}

// ── SKILL.md parser ─────────────────────────────────────────────────────

function extractOpExamples(filePath: string): OpExample[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const examples: OpExample[] = [];

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
  const opPattern = /(?:YOUR_AGENT_\w+\s+)?op:(\w+)(?:\s+params:\s*(.*))?/;

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const match = line.match(opPattern);
    if (!match) continue;

    const opName = match[1];
    const lineNum = startLine + i + 1;

    let rawParams = '';

    if (match[2]) {
      rawParams = match[2].trim();
    } else if (i + 1 < blockLines.length && blockLines[i + 1].trim().startsWith('params:')) {
      const paramsLine = blockLines[i + 1].trim();
      const paramsMatch = paramsLine.match(/^params:\s*(.*)/);
      if (paramsMatch) {
        rawParams = paramsMatch[1].trim();
      }
    }

    if (rawParams) {
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
    }
  }
}

function collectMultiLineParams(blockLines: string[], opLineIdx: number, initial: string): string {
  if (isBalanced(initial)) return initial;

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
    if (nextLine.match(/(?:YOUR_AGENT_\w+\s+)?op:\w+/)) break;
    result += '\n' + nextLine;
    if (isBalanced(result)) break;
  }

  return result;
}

function isBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function parseLooseJson(raw: string): {
  parsed: Record<string, unknown> | null;
  error?: string;
} {
  if (!raw.trim()) return { parsed: null };

  try {
    const normalized = raw
      .replace(/"<([^">]+)>"/g, '"$1"')
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\.\.\./g, '')
      .replace(/\["?<[^>]+>"?\]/g, '["placeholder"]');

    const result = JSON.parse(normalized);
    return { parsed: result };
  } catch (e) {
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

function extractFlatParams(raw: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const kvPattern = /(\w+)\s*:\s*(?:"([^"]*)"|\[([^\]]*)\]|(\{[^}]*\})|(\w+))/g;
  let match;
  let found = false;

  while ((match = kvPattern.exec(raw)) !== null) {
    found = true;
    const key = match[1];
    if (match[2] !== undefined) {
      result[key] = match[2].replace(/<[^>]+>/g, 'placeholder');
    } else if (match[3] !== undefined) {
      result[key] = ['placeholder'];
    } else if (match[4] !== undefined) {
      result[key] = {};
    } else if (match[5] !== undefined) {
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

function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.includes('|')) return true;
  if (/^<.*>$/.test(value)) return true;
  if (/^(placeholder|example|value|name|id|title|description|type|domain)$/i.test(value))
    return true;
  if (
    /^[\w]+-[\w]+$/.test(value) &&
    /\b(correct|your|my|the|this|some|new|old|entry|item|current)\b/i.test(value)
  )
    return true;
  return false;
}

function isPlaceholderIssue(
  issue: { code: string; path: (string | number)[]; received?: unknown; message: string },
  params: Record<string, unknown>,
): boolean {
  if (issue.code === 'invalid_enum_value') {
    const received = issue.received ?? getNestedValue(params, issue.path);
    if (isPlaceholder(received)) return true;
  }
  return false;
}

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
): SkillValidationError[] {
  const errors: SkillValidationError[] = [];

  for (const ex of examples) {
    if (ex.parseError) continue;
    if (!ex.parsedParams) continue;

    const schema = registry.get(ex.opName);
    if (!schema) {
      errors.push({
        file: ex.file,
        op: ex.opName,
        line: ex.line,
        message: `unknown op — not found in any facade schema registry`,
      });
      continue;
    }

    const result = (
      schema as {
        safeParse: (p: unknown) => { success: boolean; error?: ZodError };
      }
    ).safeParse(ex.parsedParams);

    if (!result.success && result.error) {
      for (const issue of result.error.issues) {
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
          op: ex.opName,
          line: ex.line,
          message: `${path ? path + ': ' : ''}${issue.message}`,
        });
      }
    }
  }

  return errors;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Validate all SKILL.md files found in `skillsDir`.
 *
 * `skillsDir` is the directory that contains skill subdirectories, e.g. ~/.claude/skills/.
 * Each subdirectory is expected to have a SKILL.md file.
 *
 * @returns Structured result with errors, counts, and whether all examples are valid.
 */
export function validateSkillDocs(skillsDir: string): SkillValidationResult {
  const registry = buildSchemaRegistry();
  const skillFiles = discoverSkillFiles(skillsDir);
  let totalExamples = 0;
  const allErrors: SkillValidationError[] = [];

  for (const file of skillFiles) {
    const examples = extractOpExamples(file);
    totalExamples += examples.length;
    const errors = validateExamples(examples, registry);
    allErrors.push(...errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    totalFiles: skillFiles.length,
    totalExamples,
    registrySize: registry.size,
  };
}
