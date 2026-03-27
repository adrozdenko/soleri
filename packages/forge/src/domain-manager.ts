/**
 * Domain manager — add new knowledge domains to existing agents.
 *
 * v5.0: Domain facades come from @soleri/core at runtime (createDomainFacades).
 * Adding a domain just needs: empty data bundle + patch index.ts domains array.
 * Falls back to generating facade files for v4.x agents.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateDomainFacade } from './templates/domain-facade.js';
import { generateVaultOnlyDomainFacade } from './knowledge-installer.js';
import { patchIndexTs, patchClaudeMdContent } from './patching.js';
import type { AddDomainResult } from './types.js';

interface AddDomainParams {
  agentPath: string;
  domain: string;
  noBuild?: boolean;
}

/**
 * Detect if this is a v5.0+ agent (uses createAgentRuntime from @soleri/core).
 */
function isV5Agent(agentPath: string): boolean {
  const indexPath = join(agentPath, 'src', 'index.ts');
  if (!existsSync(indexPath)) return false;
  const content = readFileSync(indexPath, 'utf-8');
  return content.includes('createAgentRuntime') || content.includes('createDomainFacades');
}

/**
 * Add a new knowledge domain to an existing agent.
 *
 * Steps:
 * 1. Validate agent path and domain name
 * 2. Create empty intelligence bundle
 * 3. Generate domain facade (v4.x only — v5.0+ uses core factory)
 * 4. Patch src/index.ts with domain registration
 * 5. Patch src/activation/claude-md-content.ts with facade table rows
 * 6. Rebuild (unless noBuild)
 */
export async function addDomain(params: AddDomainParams): Promise<AddDomainResult> {
  const { agentPath, domain, noBuild = false } = params;
  const warnings: string[] = [];

  // ── Validate agent ──

  const pkgPath = join(agentPath, 'package.json');
  if (!existsSync(pkgPath)) {
    return fail(agentPath, domain, 'No package.json found — is this an agent project?');
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return fail(agentPath, domain, 'Failed to parse package.json — is it valid JSON?');
  }
  const pkgName: string = (pkg.name as string) ?? '';
  if (!pkgName.endsWith('-mcp')) {
    return fail(agentPath, domain, `package.json name "${pkgName}" does not end with -mcp`);
  }

  const agentId = pkgName.replace(/-mcp$/, '');

  // ── Validate domain name ──

  if (!/^[a-z][a-z0-9-]*$/.test(domain)) {
    return fail(agentPath, domain, `Invalid domain name "${domain}" — must be kebab-case`);
  }

  // ── Check if domain already exists ──

  const dataDir = join(agentPath, 'src', 'intelligence', 'data');
  if (!existsSync(dataDir)) {
    return fail(agentPath, domain, 'src/intelligence/data/ directory not found');
  }

  const bundlePath = join(dataDir, `${domain}.json`);
  if (existsSync(bundlePath)) {
    return fail(agentPath, domain, `Domain "${domain}" already exists`);
  }

  const v5 = isV5Agent(agentPath);
  const hasBrain = v5 || existsSync(join(agentPath, 'src', 'brain'));

  // ── Step 1: Create empty bundle ──

  const emptyBundle = JSON.stringify({ domain, version: '1.0.0', entries: [] }, null, 2);
  writeFileSync(bundlePath, emptyBundle, 'utf-8');

  // Also write to dist if it exists
  const distDataDir = join(agentPath, 'dist', 'intelligence', 'data');
  if (existsSync(join(agentPath, 'dist'))) {
    mkdirSync(distDataDir, { recursive: true });
    writeFileSync(join(distDataDir, `${domain}.json`), emptyBundle, 'utf-8');
  }

  // ── Step 2: Generate facade (v4.x only) ──

  let facadeGenerated = false;
  if (!v5) {
    const facadesDir = join(agentPath, 'src', 'facades');
    const facadePath = join(facadesDir, `${domain}.facade.ts`);

    if (existsSync(facadePath)) {
      warnings.push(`Facade ${domain}.facade.ts already exists — skipped`);
    } else {
      const facadeCode = hasBrain
        ? generateDomainFacade(agentId, domain)
        : generateVaultOnlyDomainFacade(agentId, domain);
      writeFileSync(facadePath, facadeCode, 'utf-8');
      facadeGenerated = true;
    }
  }

  // ── Step 3: Patch src/index.ts ──

  const indexPath = join(agentPath, 'src', 'index.ts');
  if (existsSync(indexPath)) {
    const patched = patchIndexTs(readFileSync(indexPath, 'utf-8'), [domain], hasBrain);
    if (patched !== null) {
      writeFileSync(indexPath, patched, 'utf-8');
    } else {
      warnings.push('Could not patch src/index.ts — anchor patterns not found');
    }
  }

  // ── Step 4: Patch claude-md-content.ts ──

  const claudeMdPath = join(agentPath, 'src', 'activation', 'claude-md-content.ts');
  if (existsSync(claudeMdPath)) {
    const patched = patchClaudeMdContent(readFileSync(claudeMdPath, 'utf-8'), agentId, [domain]);
    if (patched !== null) {
      writeFileSync(claudeMdPath, patched, 'utf-8');
    } else {
      warnings.push('Could not patch claude-md-content.ts — anchor not found');
    }
  }

  // ── Step 5: Build ──

  let buildOutput = '';
  if (!noBuild) {
    try {
      buildOutput = execFileSync('npm', ['run', 'build'], {
        cwd: agentPath,
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? '';
      buildOutput = `Build failed: ${stderr}`;
      warnings.push('Build failed — check buildOutput for details');
    }
  }

  const hasPatchFailure = warnings.some(
    (w) => w.includes('Could not patch') || w.includes('Build failed'),
  );

  return {
    success: !hasPatchFailure,
    agentPath,
    domain,
    agentId,
    facadeGenerated,
    buildOutput,
    warnings,
    summary: `Added domain "${domain}" to ${agentId}${v5 ? ' (v5.0 — no facade file needed)' : ''}${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''}`,
  };
}

function fail(agentPath: string, domain: string, message: string): AddDomainResult {
  return {
    success: false,
    agentPath,
    domain,
    agentId: '',
    facadeGenerated: false,
    buildOutput: '',
    warnings: [message],
    summary: message,
  };
}
