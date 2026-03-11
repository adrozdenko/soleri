import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';

type Target = 'claude' | 'codex' | 'both';

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function registerUninstall(program: Command): void {
  program
    .command('uninstall')
    .argument('[dir]', 'Agent directory (defaults to cwd)')
    .option('--target <target>', 'Registration target: claude, codex, or both', 'claude')
    .description('Remove agent MCP server entry from editor config')
    .action(async (dir?: string, opts?: { target?: string }) => {
      const resolvedDir = dir ? resolve(dir) : undefined;
      const ctx = detectAgent(resolvedDir);

      if (!ctx) {
        p.log.error('Not in an agent project. Run from an agent directory or pass its path.');
        process.exit(1);
      }

      const target = (opts?.target ?? 'claude') as Target;

      if (target !== 'claude' && target !== 'codex' && target !== 'both') {
        p.log.error(`Invalid target "${target}". Use: claude, codex, or both`);
        process.exit(1);
      }

      if (target === 'claude' || target === 'both') {
        uninstallClaude(ctx.agentId);
      }

      if (target === 'codex' || target === 'both') {
        uninstallCodex(ctx.agentId);
      }
    });
}
