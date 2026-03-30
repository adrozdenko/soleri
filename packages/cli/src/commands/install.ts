import type { Command } from 'commander';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';

/** Default parent directory for agents: ~/.soleri/ */
const SOLERI_HOME = process.env.SOLERI_HOME ?? join(homedir(), '.soleri');

type Target = 'claude' | 'codex' | 'opencode' | 'both' | 'all';

/** Normalize a file path to forward slashes (POSIX) for cross-platform config files. */
export const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * Resolve the absolute path to the soleri-engine binary.
 * Falls back to `npx @soleri/engine` if resolution fails (e.g. not installed globally).
 */
function resolveEngineBin(): { command: string; bin: string } {
  try {
    const require = createRequire(import.meta.url);
    const bin = require.resolve('@soleri/core/dist/engine/bin/soleri-engine.js');
    return { command: 'node', bin };
  } catch {
    return { command: 'npx', bin: '@soleri/engine' };
  }
}

/** MCP server entry for file-tree agents (resolved engine path, no npx) */
function fileTreeMcpEntry(agentDir: string): Record<string, unknown> {
  const engine = resolveEngineBin();
  const agentYaml = toPosix(join(agentDir, 'agent.yaml'));
  if (engine.command === 'node') {
    return {
      type: 'stdio',
      command: 'node',
      args: [toPosix(engine.bin), '--agent', agentYaml],
    };
  }
  return {
    type: 'stdio',
    command: 'npx',
    args: ['@soleri/engine', '--agent', agentYaml],
  };
}

/** MCP server entry for legacy TypeScript agents (uses node dist/index.js) */
function legacyMcpEntry(agentDir: string): Record<string, unknown> {
  return {
    type: 'stdio',
    command: 'node',
    args: [toPosix(join(agentDir, 'dist', 'index.js'))],
    env: {},
  };
}

export function installClaude(agentId: string, agentDir: string, isFileTree: boolean): void {
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

  (config.mcpServers as Record<string, unknown>)[agentId] = isFileTree
    ? fileTreeMcpEntry(agentDir)
    : legacyMcpEntry(agentDir);

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.claude.json`);
}

function installCodex(agentId: string, agentDir: string, isFileTree: boolean): void {
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

  let section: string;
  if (isFileTree) {
    const agentYamlPath = toPosix(join(agentDir, 'agent.yaml'));
    const engine = resolveEngineBin();
    if (engine.command === 'node') {
      const bin = toPosix(engine.bin);
      section = `\n\n${sectionHeader}\ncommand = "node"\nargs = ["${bin}", "--agent", "${agentYamlPath}"]\n`;
    } else {
      section = `\n\n${sectionHeader}\ncommand = "npx"\nargs = ["@soleri/engine", "--agent", "${agentYamlPath}"]\n`;
    }
  } else {
    const entryPoint = toPosix(join(agentDir, 'dist', 'index.js'));
    section = `\n\n${sectionHeader}\ncommand = "node"\nargs = ["${entryPoint}"]\n`;
  }

  content = content + section;

  writeFileSync(configPath, content.trim() + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.codex/config.toml`);
}

function installOpencode(agentId: string, agentDir: string, isFileTree: boolean): void {
  // OpenCode uses ~/.config/opencode/opencode.json (not ~/.opencode.json)
  // Config uses "mcp" (not "mcpServers"), type "local" (not "stdio"), command as array
  const configDir = join(homedir(), '.config', 'opencode');
  const configPath = join(configDir, 'opencode.json');

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

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

  if (!config.mcp || typeof config.mcp !== 'object') {
    config.mcp = {};
  }

  const servers = config.mcp as Record<string, unknown>;
  if (isFileTree) {
    const engine = resolveEngineBin();
    const agentYaml = toPosix(join(agentDir, 'agent.yaml'));
    servers[agentId] = {
      type: 'local',
      command:
        engine.command === 'node'
          ? ['node', toPosix(engine.bin), '--agent', agentYaml]
          : ['npx', '-y', '@soleri/engine', '--agent', agentYaml],
    };
  } else {
    servers[agentId] = {
      type: 'local',
      command: ['node', toPosix(join(agentDir, 'dist', 'index.js'))],
    };
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Registered ${agentId} in ~/.config/opencode/opencode.json`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a global launcher script so the agent can be invoked by name from any directory.
 * e.g., typing `ernesto` opens Claude Code with that agent's MCP config.
 */
function installLauncher(agentId: string, agentDir: string): void {
  // Launcher scripts to /usr/local/bin are Unix-only
  if (process.platform === 'win32') {
    p.log.info('Launcher scripts are not supported on Windows.');
    p.log.info(
      `On Windows, run your agent with: npx @soleri/cli dev --agent "${toPosix(agentDir)}"`,
    );
    return;
  }

  const binPath = join('/usr/local/bin', agentId);

  const script = [
    '#!/bin/bash',
    `# ${agentId} — Soleri second brain launcher`,
    `# Type "${agentId}" from any directory to open Claude Code with this agent`,
    `exec claude --mcp-config ${toPosix(join(agentDir, '.mcp.json'))}`,
    '',
  ].join('\n');

  try {
    writeFileSync(binPath, script, { mode: 0o755 });
    p.log.success(`Launcher created: type "${agentId}" from any directory to start`);
  } catch {
    p.log.warn(`Could not create launcher at ${binPath} (may need sudo)`);
    p.log.info(
      `To create manually: sudo bash -c 'cat > ${binPath} << "EOF"\\n#!/bin/bash\\nexec claude --mcp-config ${toPosix(join(agentDir, '.mcp.json'))}\\nEOF' && chmod +x ${binPath}`,
    );
  }
}

export function registerInstall(program: Command): void {
  program
    .command('install')
    .argument('[dir]', 'Agent directory or agent name (checks ~/.soleri/<name> first, then cwd)')
    .option('--target <target>', 'Registration target: claude, opencode, codex, or all', 'claude')
    .description('Register agent as MCP server in editor config')
    .action(async (dir?: string, opts?: { target?: string }) => {
      let resolvedDir: string | undefined;

      if (dir) {
        // If dir looks like a bare agent name (no slashes), check ~/.soleri/{name} first
        if (!dir.includes('/') && !dir.includes('\\')) {
          const soleriPath = join(SOLERI_HOME, dir);
          if (existsSync(join(soleriPath, 'agent.yaml'))) {
            resolvedDir = soleriPath;
          }
        }
        if (!resolvedDir) {
          resolvedDir = resolve(dir);
        }
      }

      const ctx = detectAgent(resolvedDir);

      if (!ctx) {
        p.log.error('Not in an agent project. Run from an agent directory or pass its path.');
        p.log.info(`Tip: agents created with "soleri create" live in ${SOLERI_HOME}/`);
        process.exit(1);
      }

      const target = (opts?.target ?? 'claude') as Target;
      const validTargets: Target[] = ['claude', 'codex', 'opencode', 'both', 'all'];
      const isFileTree = ctx.format === 'filetree';

      if (!validTargets.includes(target)) {
        p.log.error(`Invalid target "${target}". Use: ${validTargets.join(', ')}`);
        process.exit(1);
      }

      if (isFileTree) {
        const engine = resolveEngineBin();
        if (engine.command === 'node') {
          p.log.info(`Detected file-tree agent (v7) — using resolved engine at ${engine.bin}`);
        } else {
          p.log.warn(
            `Could not resolve @soleri/core locally — falling back to npx (slower startup)`,
          );
          p.log.info(`For instant startup: npm install -g @soleri/cli`);
        }
      }

      if (target === 'claude' || target === 'both' || target === 'all') {
        installClaude(ctx.agentId, ctx.agentPath, isFileTree);
      }

      if (target === 'codex' || target === 'both' || target === 'all') {
        installCodex(ctx.agentId, ctx.agentPath, isFileTree);
      }

      if (target === 'opencode' || target === 'all') {
        installOpencode(ctx.agentId, ctx.agentPath, isFileTree);
      }

      // Create global launcher script
      installLauncher(ctx.agentId, ctx.agentPath);

      p.log.info(`Agent ${ctx.agentId} is now available as an MCP server.`);
    });
}
