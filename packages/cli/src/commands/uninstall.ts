import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';
import {
  detectArtifacts,
  removeDirectory,
  removeClaudeMdBlock,
  removePermissionEntries,
  removeLauncherScript,
  type ArtifactManifest,
  type RemovalResult,
} from '../utils/agent-artifacts.js';
import { pass, fail, warn, skip, heading, dim } from '../utils/logger.js';

type Target = 'claude' | 'codex' | 'opencode' | 'both' | 'all';

function uninstallClaude(agentId: string): void {
  const configPath = join(homedir(), '.claude.json');

  if (!existsSync(configPath)) {
    p.log.warn(`~/.claude.json not found — nothing to remove.`);
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    p.log.error(`Failed to parse ${configPath}.`);
    process.exit(1);
  }

  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(agentId in servers)) {
    p.log.warn(`${agentId} not found in ~/.claude.json — nothing to remove.`);
    return;
  }

  delete servers[agentId];
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Removed ${agentId} from ~/.claude.json`);
}

function uninstallCodex(agentId: string): void {
  const configPath = join(homedir(), '.codex', 'config.toml');

  if (!existsSync(configPath)) {
    p.log.warn(`~/.codex/config.toml not found — nothing to remove.`);
    return;
  }

  let content = readFileSync(configPath, 'utf-8');

  const sectionRegex = new RegExp(`\\[mcp_servers\\.${escapeRegExp(agentId)}\\][^\\[]*`, 's');

  if (!sectionRegex.test(content)) {
    p.log.warn(`${agentId} not found in ~/.codex/config.toml — nothing to remove.`);
    return;
  }

  content = content.replace(sectionRegex, '').trim();
  writeFileSync(configPath, content + '\n', 'utf-8');
  p.log.success(`Removed ${agentId} from ~/.codex/config.toml`);
}

function uninstallOpencode(agentId: string): void {
  const configPath = join(homedir(), '.opencode.json');

  if (!existsSync(configPath)) {
    p.log.warn(`~/.opencode.json not found — nothing to remove.`);
    return;
  }

  let config: Record<string, unknown>;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    config = JSON.parse(stripped);
  } catch {
    p.log.error(`Failed to parse ${configPath}.`);
    process.exit(1);
  }

  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(agentId in servers)) {
    p.log.warn(`${agentId} not found in ~/.opencode.json — nothing to remove.`);
    return;
  }

  delete servers[agentId];
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Removed ${agentId} from ~/.opencode.json`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Full uninstall helpers
// ---------------------------------------------------------------------------

function countArtifacts(manifest: ArtifactManifest): number {
  let count = 0;
  if (manifest.projectDir?.exists) count++;
  if (manifest.dataDir?.exists) count++;
  if (manifest.dataDirLegacy?.exists) count++;
  count += manifest.claudeMdBlocks.length;
  count += manifest.mcpServerEntries.length;
  if (manifest.permissionEntries.length > 0) count++;
  if (manifest.launcherScript?.exists) count++;
  return count;
}

function displayManifest(manifest: ArtifactManifest): void {
  heading(`Artifacts for "${manifest.agentId}"`);

  const show = (label: string, loc: { path: string; exists: boolean } | null) => {
    if (loc?.exists) warn(label, loc.path);
    else dim(`${label} — not found`);
  };

  show('Project directory', manifest.projectDir);
  show('Data directory', manifest.dataDir);
  show('Data directory (legacy)', manifest.dataDirLegacy);
  show('Launcher script', manifest.launcherScript);

  if (manifest.claudeMdBlocks.length > 0) {
    for (const block of manifest.claudeMdBlocks) {
      warn('CLAUDE.md block', `${block.path} (lines ${block.startLine}-${block.endLine})`);
    }
  } else {
    dim('CLAUDE.md blocks — none found');
  }

  if (manifest.mcpServerEntries.length > 0) {
    for (const entry of manifest.mcpServerEntries) {
      warn(`MCP server (${entry.target})`, `${entry.file} → ${entry.key}`);
    }
  } else {
    dim('MCP server entries — none found');
  }

  if (manifest.permissionEntries.length > 0) {
    for (const pe of manifest.permissionEntries) {
      warn(`Permissions (${pe.matches.length} entries)`, pe.file);
    }
  } else {
    dim('Permission entries — none found');
  }
}

function reportResult(label: string, result: RemovalResult): void {
  if (result.removed) pass(label, result.path);
  else if (result.error) fail(label, result.error);
  else skip(label, result.path);
}

async function fullUninstall(
  agentId: string,
  agentDir: string | undefined,
  target: Target,
  dryRun: boolean,
  force: boolean,
): Promise<void> {
  const manifest = detectArtifacts(agentId, agentDir);
  const total = countArtifacts(manifest);

  displayManifest(manifest);

  if (total === 0) {
    p.log.info('Nothing to remove.');
    process.exit(2);
  }

  console.log(`\n  Found ${total} artifact(s) to remove.\n`);

  if (dryRun) {
    p.log.info('Dry run — no changes made.');
    return;
  }

  if (!force) {
    const confirmed = await p.confirm({
      message: `Remove all artifacts for "${agentId}"? This cannot be undone.`,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.log.info('Cancelled.');
      return;
    }
  }

  let removed = 0;
  heading('Removing artifacts');

  // 1. MCP server entries (existing logic)
  if (target === 'claude' || target === 'both' || target === 'all') {
    uninstallClaude(agentId);
  }
  if (target === 'codex' || target === 'both' || target === 'all') {
    uninstallCodex(agentId);
  }
  if (target === 'opencode' || target === 'all') {
    uninstallOpencode(agentId);
  }
  removed += manifest.mcpServerEntries.length;

  // 2. Permission entries
  for (const pe of manifest.permissionEntries) {
    const result = await removePermissionEntries(pe.file, agentId);
    reportResult(`Permissions (${pe.matches.length} entries)`, result);
    if (result.removed) removed++;
  }

  // 3. CLAUDE.md blocks (reverse order to preserve line numbers)
  const sortedBlocks = [...manifest.claudeMdBlocks].sort((a, b) => b.startLine - a.startLine);
  for (const block of sortedBlocks) {
    const result = await removeClaudeMdBlock(block.path, block.startLine, block.endLine);
    reportResult('CLAUDE.md block', result);
    if (result.removed) removed++;
  }

  // 4. Launcher script
  if (manifest.launcherScript?.exists) {
    const result = await removeLauncherScript(manifest.launcherScript.path);
    reportResult('Launcher script', result);
    if (result.removed) removed++;
  }

  // 5. Data directories
  if (manifest.dataDir?.exists) {
    const result = await removeDirectory(manifest.dataDir.path);
    reportResult('Data directory', result);
    if (result.removed) removed++;
  }
  if (manifest.dataDirLegacy?.exists) {
    const result = await removeDirectory(manifest.dataDirLegacy.path);
    reportResult('Data directory (legacy)', result);
    if (result.removed) removed++;
  }

  // 6. Project directory (last — most destructive)
  if (manifest.projectDir?.exists) {
    const result = await removeDirectory(manifest.projectDir.path);
    reportResult('Project directory', result);
    if (result.removed) removed++;
  }

  console.log(`\n  Removed ${removed}/${total} artifacts for "${agentId}".\n`);
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerUninstall(program: Command): void {
  program
    .command('uninstall')
    .argument('[dir]', 'Agent directory (defaults to cwd)')
    .option('--target <target>', 'Registration target: opencode, claude, codex, or all')
    .option('--full', 'Remove all agent artifacts (project, data, configs, permissions, launcher)')
    .option('--dry-run', 'Show what would be removed without making changes')
    .option('--force', 'Skip confirmation prompt')
    .description('Remove agent MCP server entries (or all artifacts with --full)')
    .action(
      async (
        dir?: string,
        opts?: { target?: string; full?: boolean; dryRun?: boolean; force?: boolean },
      ) => {
        const resolvedDir = dir ? resolve(dir) : undefined;
        const ctx = detectAgent(resolvedDir);

        if (!ctx) {
          p.log.error('Not in an agent project. Run from an agent directory or pass its path.');
          process.exit(1);
        }

        // Default: 'all' — remove from all targets to mirror install behavior
        const defaultTarget = 'all';
        const target = (opts?.target ?? defaultTarget) as Target;
        const validTargets: Target[] = ['claude', 'codex', 'opencode', 'both', 'all'];

        if (!validTargets.includes(target)) {
          p.log.error(`Invalid target "${target}". Use: ${validTargets.join(', ')}`);
          process.exit(1);
        }

        if (opts?.full) {
          await fullUninstall(ctx.agentId, resolvedDir, target, !!opts.dryRun, !!opts.force);
          return;
        }

        // Default: MCP-only removal (backward compatible)
        if (target === 'claude' || target === 'both' || target === 'all') {
          uninstallClaude(ctx.agentId);
        }

        if (target === 'codex' || target === 'both' || target === 'all') {
          uninstallCodex(ctx.agentId);
        }

        if (target === 'opencode' || target === 'all') {
          uninstallOpencode(ctx.agentId);
        }
      },
    );
}
