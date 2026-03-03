import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateDomainFacade, pascalCase, capitalize } from './templates/domain-facade.js';
import type { InstallKnowledgeResult } from './types.js';

// ---------- Bundle validation types ----------

interface BundleEntry {
  id: string;
  type: string;
  domain: string;
  title: string;
  severity: string;
  description: string;
  tags: string[];
  [key: string]: unknown;
}

interface Bundle {
  domain: string;
  version: string;
  entries: BundleEntry[];
}

const VALID_TYPES = new Set(['pattern', 'anti-pattern', 'rule']);
const VALID_SEVERITIES = new Set(['critical', 'warning', 'suggestion']);

// ---------- Vault-only facade generator ----------

/**
 * Generate a domain facade for older agents that lack a Brain module.
 * Uses vault.search() instead of brain.intelligentSearch() and
 * vault.add() instead of brain.enrichAndCapture().
 */
export function generateVaultOnlyDomainFacade(agentId: string, domain: string): string {
  const facadeName = `${agentId}_${domain.replace(/-/g, '_')}`;

  return `import { z } from 'zod';
import type { FacadeConfig } from './types.js';
import type { Vault } from '../vault/vault.js';

export function create${pascalCase(domain)}Facade(vault: Vault): FacadeConfig {
  return {
    name: '${facadeName}',
    description: '${capitalize(domain.replace(/-/g, ' '))} patterns, rules, and guidance.',
    ops: [
      {
        name: 'get_patterns',
        description: 'Get ${domain} patterns filtered by tags or severity.',
        auth: 'read',
        schema: z.object({
          tags: z.array(z.string()).optional(),
          severity: z.enum(['critical', 'warning', 'suggestion']).optional(),
          type: z.enum(['pattern', 'anti-pattern', 'rule']).optional(),
          limit: z.number().optional(),
        }),
        handler: async (params) => {
          return vault.list({
            domain: '${domain}',
            severity: params.severity as string | undefined,
            type: params.type as string | undefined,
            tags: params.tags as string[] | undefined,
            limit: (params.limit as number) ?? 20,
          });
        },
      },
      {
        name: 'search',
        description: 'Search ${domain} knowledge by query.',
        auth: 'read',
        schema: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
        handler: async (params) => {
          return vault.search(params.query as string, {
            domain: '${domain}',
            limit: (params.limit as number) ?? 10,
          });
        },
      },
      {
        name: 'get_entry',
        description: 'Get a specific ${domain} knowledge entry by ID.',
        auth: 'read',
        schema: z.object({ id: z.string() }),
        handler: async (params) => {
          const entry = vault.get(params.id as string);
          if (!entry) return { error: 'Entry not found: ' + params.id };
          return entry;
        },
      },
      {
        name: 'capture',
        description: 'Capture a new ${domain} pattern, anti-pattern, or rule.',
        auth: 'write',
        schema: z.object({
          id: z.string(),
          type: z.enum(['pattern', 'anti-pattern', 'rule']),
          title: z.string(),
          severity: z.enum(['critical', 'warning', 'suggestion']),
          description: z.string(),
          context: z.string().optional(),
          example: z.string().optional(),
          counterExample: z.string().optional(),
          why: z.string().optional(),
          tags: z.array(z.string()),
        }),
        handler: async (params) => {
          vault.add({
            id: params.id as string,
            type: params.type as 'pattern' | 'anti-pattern' | 'rule',
            domain: '${domain}',
            title: params.title as string,
            severity: params.severity as 'critical' | 'warning' | 'suggestion',
            description: params.description as string,
            context: params.context as string | undefined,
            example: params.example as string | undefined,
            counterExample: params.counterExample as string | undefined,
            why: params.why as string | undefined,
            tags: params.tags as string[],
          });
          return { captured: params.id, domain: '${domain}' };
        },
      },
      {
        name: 'remove',
        description: 'Remove a ${domain} knowledge entry by ID.',
        auth: 'admin',
        schema: z.object({ id: z.string() }),
        handler: async (params) => {
          const removed = vault.remove(params.id as string);
          return { removed, id: params.id };
        },
      },
    ],
  };
}
`;
}

// ---------- Main installer ----------

export interface InstallKnowledgeParams {
  agentPath: string;
  bundlePath: string;
  generateFacades?: boolean;
}

export async function installKnowledge(
  params: InstallKnowledgeParams,
): Promise<InstallKnowledgeResult> {
  const { agentPath, bundlePath, generateFacades = true } = params;
  const warnings: string[] = [];
  const facadesGenerated: string[] = [];
  const sourceFilesPatched: string[] = [];

  // ── Step 1: Validate agent path ──────────────────────────────────

  const pkgPath = join(agentPath, 'package.json');
  if (!existsSync(pkgPath)) {
    return fail(agentPath, '', 'No package.json found — is this an agent project?');
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const pkgName: string = pkg.name ?? '';
  if (!pkgName.endsWith('-mcp')) {
    return fail(agentPath, pkgName, `package.json name "${pkgName}" does not end with -mcp`);
  }

  const agentId = pkgName.replace(/-mcp$/, '');
  const dataDir = join(agentPath, 'src', 'intelligence', 'data');
  if (!existsSync(dataDir)) {
    return fail(agentPath, agentId, 'src/intelligence/data/ directory not found');
  }

  const hasBrain = existsSync(join(agentPath, 'src', 'brain'));

  // ── Step 2: Read and validate bundles ────────────────────────────

  const bundleFiles = collectBundleFiles(bundlePath);
  if (bundleFiles.length === 0) {
    return fail(agentPath, agentId, `No .json bundle files found at ${bundlePath}`);
  }

  const bundles: Array<{ file: string; bundle: Bundle }> = [];
  const issues: string[] = [];

  for (const file of bundleFiles) {
    try {
      const raw = readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as Bundle;
      const fileIssues = validateBundle(parsed, file);
      if (fileIssues.length > 0) {
        issues.push(...fileIssues);
      } else {
        bundles.push({ file, bundle: parsed });
      }
    } catch (err) {
      issues.push(`${basename(file)}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (bundles.length === 0) {
    return fail(agentPath, agentId, `All bundles failed validation:\n${issues.join('\n')}`);
  }

  if (issues.length > 0) {
    warnings.push(...issues);
  }

  // Determine which domains are new vs existing
  const existingDataFiles = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  const existingDomains = new Set(existingDataFiles.map((f) => f.replace(/\.json$/, '')));
  const domainsAdded: string[] = [];
  const domainsUpdated: string[] = [];

  for (const { bundle } of bundles) {
    if (existingDomains.has(bundle.domain)) {
      domainsUpdated.push(bundle.domain);
    } else {
      domainsAdded.push(bundle.domain);
    }
  }

  // ── Step 3: Copy bundles ─────────────────────────────────────────

  for (const { file, bundle } of bundles) {
    const dest = join(dataDir, `${bundle.domain}.json`);
    copyFileSync(file, dest);
  }

  // Also copy to dist/intelligence/data/ if dist exists
  const distDataDir = join(agentPath, 'dist', 'intelligence', 'data');
  if (existsSync(join(agentPath, 'dist'))) {
    mkdirSync(distDataDir, { recursive: true });
    for (const { file, bundle } of bundles) {
      copyFileSync(file, join(distDataDir, `${bundle.domain}.json`));
    }
  }

  // ── Step 4: Generate facades for new domains ─────────────────────

  if (generateFacades && domainsAdded.length > 0) {
    const facadesDir = join(agentPath, 'src', 'facades');

    for (const domain of domainsAdded) {
      const facadePath = join(facadesDir, `${domain}.facade.ts`);
      // Skip if facade already exists (idempotent)
      if (existsSync(facadePath)) {
        warnings.push(`Facade ${domain}.facade.ts already exists — skipped`);
        continue;
      }

      const facadeCode = hasBrain
        ? generateDomainFacade(agentId, domain)
        : generateVaultOnlyDomainFacade(agentId, domain);

      writeFileSync(facadePath, facadeCode, 'utf-8');
      facadesGenerated.push(`${domain}.facade.ts`);
    }

    // ── Step 5: Patch src/index.ts ───────────────────────────────────

    const indexPath = join(agentPath, 'src', 'index.ts');
    if (existsSync(indexPath)) {
      const patched = patchIndexTs(
        readFileSync(indexPath, 'utf-8'),
        domainsAdded,
        hasBrain,
      );
      if (patched !== null) {
        writeFileSync(indexPath, patched, 'utf-8');
        sourceFilesPatched.push('src/index.ts');
      } else {
        warnings.push('Could not patch src/index.ts — anchor patterns not found. Manual patching needed.');
      }
    }

    // ── Step 6: Patch src/activation/claude-md-content.ts ────────────

    const claudeMdPath = join(agentPath, 'src', 'activation', 'claude-md-content.ts');
    if (existsSync(claudeMdPath)) {
      const patched = patchClaudeMdContent(
        readFileSync(claudeMdPath, 'utf-8'),
        agentId,
        domainsAdded,
      );
      if (patched !== null) {
        writeFileSync(claudeMdPath, patched, 'utf-8');
        sourceFilesPatched.push('src/activation/claude-md-content.ts');
      } else {
        warnings.push('Could not patch claude-md-content.ts — anchor not found. Manual patching needed.');
      }
    }
  }

  // ── Step 7: Build ────────────────────────────────────────────────

  let buildOutput = '';
  try {
    // Using execFileSync with npx to avoid shell injection — command is hardcoded
    buildOutput = execFileSync('npm', ['run', 'build'], {
      cwd: agentPath,
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    buildOutput = `Build failed: ${stderr}`;
    warnings.push('Build failed — check buildOutput for details');
  }

  // ── Step 8: Return result ────────────────────────────────────────

  const entriesTotal = bundles.reduce((sum, { bundle }) => sum + bundle.entries.length, 0);

  const summaryParts = [
    `Installed ${bundles.length} bundle(s) with ${entriesTotal} entries into ${agentId}`,
  ];
  if (domainsAdded.length > 0) summaryParts.push(`New domains: ${domainsAdded.join(', ')}`);
  if (domainsUpdated.length > 0) summaryParts.push(`Updated domains: ${domainsUpdated.join(', ')}`);
  if (facadesGenerated.length > 0) summaryParts.push(`Generated ${facadesGenerated.length} facade(s)`);
  if (sourceFilesPatched.length > 0) summaryParts.push(`Patched: ${sourceFilesPatched.join(', ')}`);
  if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);

  return {
    success: !warnings.some((w) => w.includes('Build failed')),
    agentPath,
    agentId,
    bundlesInstalled: bundles.length,
    entriesTotal,
    domainsAdded,
    domainsUpdated,
    facadesGenerated,
    sourceFilesPatched,
    buildOutput,
    warnings,
    summary: summaryParts.join('. ') + '.',
  };
}

// ---------- Helpers ----------

function fail(agentPath: string, agentId: string, message: string): InstallKnowledgeResult {
  return {
    success: false,
    agentPath,
    agentId,
    bundlesInstalled: 0,
    entriesTotal: 0,
    domainsAdded: [],
    domainsUpdated: [],
    facadesGenerated: [],
    sourceFilesPatched: [],
    buildOutput: '',
    warnings: [message],
    summary: message,
  };
}

function collectBundleFiles(bundlePath: string): string[] {
  if (bundlePath.endsWith('.json')) {
    return existsSync(bundlePath) ? [bundlePath] : [];
  }
  if (!existsSync(bundlePath)) return [];
  return readdirSync(bundlePath)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(bundlePath, f));
}

function validateBundle(bundle: Bundle, file: string): string[] {
  const issues: string[] = [];
  const name = basename(file);

  if (!bundle.domain || typeof bundle.domain !== 'string') {
    issues.push(`${name}: missing or invalid "domain"`);
  }
  if (!bundle.version || typeof bundle.version !== 'string') {
    issues.push(`${name}: missing or invalid "version"`);
  }
  if (!Array.isArray(bundle.entries)) {
    issues.push(`${name}: "entries" must be an array`);
    return issues; // can't validate entries
  }

  for (let i = 0; i < bundle.entries.length; i++) {
    const entry = bundle.entries[i];
    const prefix = `${name}[${i}]`;

    if (!entry.id) issues.push(`${prefix}: missing "id"`);
    if (!VALID_TYPES.has(entry.type)) issues.push(`${prefix}: invalid type "${entry.type}"`);
    if (!entry.domain) issues.push(`${prefix}: missing "domain"`);
    if (!entry.title) issues.push(`${prefix}: missing "title"`);
    if (!VALID_SEVERITIES.has(entry.severity)) issues.push(`${prefix}: invalid severity "${entry.severity}"`);
    if (!entry.description) issues.push(`${prefix}: missing "description"`);
    if (!Array.isArray(entry.tags)) issues.push(`${prefix}: "tags" must be an array`);
  }

  return issues;
}

// ---------- Source file patching ----------

/**
 * Patch the agent's src/index.ts to add imports and facade registrations
 * for new domains.
 *
 * Anchor patterns:
 * - Import: insert before `import { createCoreFacade }`
 * - Facade array: insert before `createCoreFacade(`
 */
export function patchIndexTs(
  source: string,
  newDomains: string[],
  hasBrain: boolean,
): string | null {
  // Filter out domains whose imports already exist (idempotent)
  const domainsToImport = newDomains.filter((d) => {
    const fn = `create${pascalCase(d)}Facade`;
    return !source.includes(`import { ${fn} }`);
  });

  // Filter out domains whose facade calls already exist
  const domainsToRegister = newDomains.filter((d) => {
    const fn = `create${pascalCase(d)}Facade(`;
    return !source.includes(fn);
  });

  // Nothing to patch
  if (domainsToImport.length === 0 && domainsToRegister.length === 0) {
    return source;
  }

  let patched = source;

  // ── Insert imports ──
  if (domainsToImport.length > 0) {
    const importAnchor = /^(import \{ createCoreFacade \}.*$)/m;
    if (!importAnchor.test(patched)) return null;

    const newImports = domainsToImport
      .map((d) => {
        const fn = `create${pascalCase(d)}Facade`;
        return `import { ${fn} } from './facades/${d}.facade.js';`;
      })
      .join('\n');

    patched = patched.replace(importAnchor, `${newImports}\n$1`);
  }

  // ── Insert facade creations ──
  if (domainsToRegister.length > 0) {
    const facadeAnchor = /^(\s+createCoreFacade\()/m;
    if (!facadeAnchor.test(patched)) return null;

    const newCreations = domainsToRegister
      .map((d) => {
        const fn = `create${pascalCase(d)}Facade`;
        const args = hasBrain ? 'vault, brain' : 'vault';
        return `    ${fn}(${args}),`;
      })
      .join('\n');

    patched = patched.replace(facadeAnchor, `${newCreations}\n$1`);
  }

  return patched;
}

/**
 * Patch the agent's src/activation/claude-md-content.ts to add
 * facade table rows for new domains.
 *
 * Primary anchor: line containing `| Memory search |` (newer agents)
 * Fallback anchor: line containing `## Intent Detection` (older agents without memory/brain rows)
 */
export function patchClaudeMdContent(
  source: string,
  agentId: string,
  newDomains: string[],
): string | null {
  const facadeId = agentId.replace(/-/g, '_');
  const bt = '`';

  // Filter out domains whose rows already exist (idempotent)
  const domainsToAdd = newDomains.filter((d) => {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    return !source.includes(`${toolName}`);
  });

  if (domainsToAdd.length === 0) return source;

  // Try primary anchor first, then fallback for older agents
  let anchorIdx = source.indexOf("'| Memory search |");
  if (anchorIdx === -1) {
    // Older agents: insert before the empty line preceding ## Intent Detection
    anchorIdx = source.indexOf("'## Intent Detection'");
    if (anchorIdx === -1) return null;
    // Back up to include the preceding empty string line ('',)
    const emptyLineIdx = source.lastIndexOf("'',", anchorIdx);
    if (emptyLineIdx !== -1 && anchorIdx - emptyLineIdx < 20) {
      // Find the start of that line (the indentation)
      const lineStart = source.lastIndexOf('\n', emptyLineIdx);
      anchorIdx = lineStart === -1 ? emptyLineIdx : lineStart + 1;
    }
  }

  const newRows = domainsToAdd.flatMap((d) => {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    return [
      `    '| ${d} patterns | ${bt}${toolName}${bt} | ${bt}get_patterns${bt} |',`,
      `    '| Search ${d} | ${bt}${toolName}${bt} | ${bt}search${bt} |',`,
      `    '| Capture ${d} | ${bt}${toolName}${bt} | ${bt}capture${bt} |',`,
    ];
  });

  return (
    source.slice(0, anchorIdx) +
    newRows.join('\n') +
    '\n' +
    source.slice(anchorIdx)
  );
}
