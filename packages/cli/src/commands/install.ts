import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';

type Target = 'claude' | 'codex' | 'opencode' | 'both' | 'all';

function installClaude(agentId: string, agentDir: string): void {
  const configPath = join(homedir(), '.claude.json');
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      p.log.error(`Failed to parse ${configPath}. Fix it manually or delete it to start fresh.`);
      process.exit(1);
    }
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  (config.mcpServers as Record<string, unknown>)[agentId] = {
    type: 'stdio',
    command: 'node',
    args: [join(agentDir, 'dist', 'index.js')],
    env: {},
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.claude.json`);
}

function installCodex(agentId: string, agentDir: string): void {
  const codexDir = join(homedir(), '.codex');
  const configPath = join(codexDir, 'config.toml');

  if (!existsSync(codexDir)) {
    mkdirSync(codexDir, { recursive: true });
  }

  let content = '';
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf-8');
  }

  // Remove existing section for this agent if present
  const sectionHeader = `[mcp_servers.${agentId}]`;
  const sectionRegex = new RegExp(`\\[mcp_servers\\.${escapeRegExp(agentId)}\\][^\\[]*`, 's');
  content = content.replace(sectionRegex, '').trim();

  const entryPoint = join(agentDir, 'dist', 'index.js');
  const section = `\n\n${sectionHeader}\ncommand = "node"\nargs = ["${entryPoint}"]\n`;

  content = content + section;

  writeFileSync(configPath, content.trim() + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.codex/config.toml`);
}

function installOpencode(agentId: string, agentDir: string): void {
  const configPath = join(homedir(), '.opencode.json');

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
      config = JSON.parse(stripped);
    } catch {
      config = {};
    }
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;
  servers[agentId] = {
    type: 'stdio',
    command: 'node',
    args: [join(agentDir, 'dist', 'index.js')],
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.opencode.json`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function registerInstall(program: Command): void {
  program
    .command('install')
    .argument('[dir]', 'Agent directory (defaults to cwd)')
    .option('--target <target>', 'Registration target: opencode, claude, codex, or all', 'opencode')
    .description('Register agent as MCP server in editor config')
    .action(async (dir?: string, opts?: { target?: string }) => {
      const resolvedDir = dir ? resolve(dir) : undefined;
      const ctx = detectAgent(resolvedDir);

      if (!ctx) {
        p.log.error('Not in an agent project. Run from an agent directory or pass its path.');
        process.exit(1);
      }

      const target = (opts?.target ?? 'opencode') as Target;
      const validTargets: Target[] = ['claude', 'codex', 'opencode', 'both', 'all'];

      if (!validTargets.includes(target)) {
        p.log.error(`Invalid target "${target}". Use: ${validTargets.join(', ')}`);
        process.exit(1);
      }

      if (target === 'claude' || target === 'both' || target === 'all') {
        installClaude(ctx.agentId, ctx.agentPath);
      }

      if (target === 'codex' || target === 'both' || target === 'all') {
        installCodex(ctx.agentId, ctx.agentPath);
      }

      if (target === 'opencode' || target === 'all') {
        installOpencode(ctx.agentId, ctx.agentPath);
      }

      p.log.info(`Agent ${ctx.agentId} is now available as an MCP server.`);
    });
}
