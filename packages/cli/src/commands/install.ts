import type { Command } from 'commander';
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import * as p from '@clack/prompts';
import { detectAgent } from '../utils/agent-context.js';
import { detectArtifacts } from '../utils/agent-artifacts.js';
import {
  resolveInstalledEngineBin,
  resolveTranscriptCaptureScript,
} from '../utils/core-resolver.js';

/** Default parent directory for agents: ~/.soleri/ */
const SOLERI_HOME = process.env.SOLERI_HOME ?? join(homedir(), '.soleri');

type Target = 'claude' | 'codex' | 'opencode' | 'both' | 'all';

/** Normalize a file path to forward slashes (POSIX) for cross-platform config files. */
export const toPosix = (p: string): string => p.replace(/\\/g, '/');

/**
 * Resolve the absolute path to the soleri-engine binary.
 * Falls back to `npx @soleri/engine` if resolution fails (e.g. not installed globally).
 */
export function resolveEngineBin(): { command: string; bin: string } {
  const bin = resolveInstalledEngineBin();
  return bin ? { command: 'node', bin } : { command: 'npx', bin: '@soleri/engine' };
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

/**
 * Check if a file path is writable. If the file exists, checks write permission on the file.
 * If the file does not exist, checks write permission on the parent directory.
 */
function checkWritable(filePath: string): boolean {
  try {
    if (existsSync(filePath)) {
      accessSync(filePath, fsConstants.W_OK);
    } else {
      accessSync(dirname(filePath), fsConstants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Facade suffixes pre-approved for every Soleri agent.
 * Each suffix becomes `mcp__<agentId>__<agentId>_<suffix>` in settings.local.json.
 */
const PRE_APPROVED_FACADE_SUFFIXES = [
  'core',
  'vault',
  'plan',
  'brain',
  'memory',
  'admin',
  'curator',
  'orchestrate',
  'control',
  'context',
  'agency',
  'operator',
  'chat',
  'archive',
  'sync',
  'review',
  'intake',
  'links',
  'branching',
  'tier',
  'loop',
  'embedding',
  'dream',
  'testing',
  'typescript',
] as const;

/**
 * Write pre-approved facade permissions to ~/.claude/settings.local.json.
 * Merges with existing permissions — never removes entries added by the user or other agents.
 */
export function installClaudePermissions(agentId: string): void {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.local.json');

  // Build permission entries: mcp__<agentId>__<agentId>_<suffix>
  const newEntries = PRE_APPROVED_FACADE_SUFFIXES.map(
    (suffix) => `mcp__${agentId}__${agentId}_${suffix}`,
  );

  let config: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      config = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Corrupted file — start fresh but warn
      p.log.warn(`Could not parse ${settingsPath} — creating fresh permissions`);
      config = {};
    }
  }

  if (!config.permissions || typeof config.permissions !== 'object') {
    config.permissions = {};
  }
  const permissions = config.permissions as Record<string, unknown>;

  const existing = Array.isArray(permissions.allow) ? (permissions.allow as string[]) : [];
  const merged = [...new Set([...existing, ...newEntries])];
  permissions.allow = merged;

  try {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch {
    p.log.warn(`Could not write ${settingsPath} — MCP tools may require manual approval`);
    return;
  }

  const added = merged.length - existing.length;
  if (added > 0) {
    p.log.success(`Pre-approved ${merged.length} facade permissions in settings.local.json`);
  } else {
    p.log.info('Facade permissions already configured in settings.local.json');
  }
}

/**
 * Register PreCompact + Stop hooks for automatic transcript capture.
 * Writes to ~/.claude/settings.json (user-level hooks).
 * Idempotent — skips if transcript hooks are already registered.
 */
export function installTranscriptHooks(): void {
  const captureScript = resolveTranscriptCaptureScript();
  if (!captureScript) {
    // @soleri/core not installed locally — skip silently
    return;
  }

  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      return; // Don't corrupt a settings file we can't parse
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const scriptPath = toPosix(captureScript);
  const vaultPath = toPosix(join(homedir(), '.soleri', 'vault.db'));

  // The hook command: read session_id + transcript_path from stdin, call capture script
  const hookCommand =
    `INPUT=$(cat); TP=$(echo "$INPUT" | grep -o '"transcript_path":"[^"]*"' | head -1 | cut -d'"' -f4); ` +
    `SI=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4); ` +
    `[ -z "$TP" ] || [ ! -f "$TP" ] && exit 0; ` +
    `node "${scriptPath}" --session-id "$SI" --transcript-path "$TP" --project-path "$PWD" --vault-path "${vaultPath}" 2>/dev/null || true`;

  const hookEntry = {
    hooks: [
      {
        type: 'command',
        command: hookCommand,
        timeout: 10000,
        statusMessage: 'Capturing transcript...',
      },
    ],
  };

  // Check if already registered (look for capture-hook.js in any existing hook command)
  const isRegistered = (eventHooks: unknown[]): boolean =>
    eventHooks.some((h) => JSON.stringify(h).includes('capture-hook.js'));

  let changed = false;

  for (const event of ['PreCompact', 'Stop'] as const) {
    if (!hooks[event]) hooks[event] = [];
    const eventHooks = hooks[event] as unknown[];
    if (!isRegistered(eventHooks)) {
      eventHooks.push(hookEntry);
      changed = true;
    }
  }

  if (changed) {
    settings.hooks = hooks;
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    p.log.success('Transcript capture hooks registered (PreCompact + Stop)');
  } else {
    p.log.info('Transcript capture hooks already registered');
  }
}

export function installClaude(agentId: string, agentDir: string, isFileTree: boolean): void {
  const configPath = join(homedir(), '.claude.json');

  if (!checkWritable(configPath)) {
    p.log.error(`Cannot write to ${configPath} — check file permissions`);
    process.exit(1);
  }

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

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch {
    p.log.error(`Cannot write to ${configPath}. Check file permissions.`);
    process.exit(1);
  }
  p.log.success(`Registered ${agentId} in ~/.claude.json (restart your session to load)`);

  // Pre-approve facade permissions so users don't hit approval prompts
  installClaudePermissions(agentId);
}

function installCodex(agentId: string, agentDir: string, isFileTree: boolean): void {
  const codexDir = join(homedir(), '.codex');
  const configPath = join(codexDir, 'config.toml');

  if (!existsSync(codexDir)) {
    try {
      mkdirSync(codexDir, { recursive: true });
    } catch {
      p.log.error(`Cannot create directory ${codexDir}. Check permissions.`);
      process.exit(1);
    }
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

  try {
    writeFileSync(configPath, content.trim() + '\n', 'utf-8');
  } catch {
    p.log.error(`Cannot write to ${configPath}. Check file permissions.`);
    process.exit(1);
  }
  p.log.success(`Registered ${agentId} in ~/.codex/config.toml (restart your session to load)`);
}

function installOpencode(agentId: string, agentDir: string, isFileTree: boolean): void {
  // OpenCode uses ~/.config/opencode/opencode.json (not ~/.opencode.json)
  // Config uses "mcp" (not "mcpServers"), type "local" (not "stdio"), command as array
  const configDir = join(homedir(), '.config', 'opencode');
  const configPath = join(configDir, 'opencode.json');

  if (!existsSync(configDir)) {
    try {
      mkdirSync(configDir, { recursive: true });
    } catch {
      p.log.error(`Cannot create directory ${configDir}. Check permissions.`);
      process.exit(1);
    }
  }

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
      config = JSON.parse(stripped);
    } catch {
      p.log.error(
        `Failed to parse ${configPath}. The file may be corrupted. Delete it and try again.`,
      );
      process.exit(1);
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

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch {
    p.log.error(`Cannot write to ${configPath}. Check file permissions.`);
    process.exit(1);
  }
  p.log.success(
    `Registered ${agentId} in ~/.config/opencode/opencode.json (restart your session to load)`,
  );
}

/**
 * Return target-specific post-install restart instructions.
 */
export function getNextStepMessage(target: string): string {
  const instructions: Record<string, string> = {
    claude: 'Next step: Restart your Claude Code session (or run `/mcp` to reload MCP servers).',
    codex: 'Next step: Start a new Codex conversation to load the MCP server.',
    opencode: 'Next step: Restart OpenCode to load the MCP server.',
  };

  if (target === 'both' || target === 'all') {
    return [instructions.claude, instructions.codex, instructions.opencode].join('\n');
  }

  if (!(target in instructions)) {
    p.log.warn(`Unknown target "${target}" — defaulting to Claude instructions.`);
  }
  return instructions[target] ?? instructions.claude;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a global launcher script so the agent can be invoked by name from any directory.
 * e.g., typing `ernesto` opens Claude Code with that agent's MCP config.
 */
function installLauncher(agentId: string, agentDir: string, target: Target): void {
  // Only create a launcher for Claude — other targets don't have a CLI equivalent
  if (target === 'codex') {
    p.log.info('Launcher skipped: Codex does not have a CLI equivalent.');
    return;
  }
  if (target === 'opencode') {
    p.log.info('Launcher skipped: OpenCode does not have a CLI equivalent.');
    return;
  }
  if (target === 'all' || target === 'both') {
    p.log.info('Note: Launcher is Claude-specific — other targets do not have a CLI equivalent.');
  }

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

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

export interface VerifyCheck {
  label: string;
  passed: boolean;
}

/**
 * Verify the full install chain for an agent against a given target.
 * Returns an array of pass/fail checks.
 */
export function verifyInstall(agentId: string, agentDir: string, target: Target): VerifyCheck[] {
  const checks: VerifyCheck[] = [];

  // 1. Agent entry exists in config for each relevant target
  const artifacts = detectArtifacts(agentId, agentDir);
  const targetEntries = artifacts.mcpServerEntries;

  const targets: ('claude' | 'codex' | 'opencode')[] =
    target === 'all' || target === 'both'
      ? ['claude', 'codex', 'opencode']
      : [target as 'claude' | 'codex' | 'opencode'];

  for (const t of targets) {
    const hasEntry = targetEntries.some((e) => e.target === t);
    checks.push({
      label: `Agent entry in ${t} config`,
      passed: hasEntry,
    });
  }

  // 2. Engine binary resolves (local or npx fallback)
  const engine = resolveEngineBin();
  const isLocal = engine.command === 'node';
  checks.push({
    label: isLocal
      ? `Engine binary resolves (${engine.bin})`
      : 'Engine resolves via npx (fallback)',
    passed: true,
  });

  // 3. agent.yaml exists at configured path
  const agentYamlPath = join(agentDir, 'agent.yaml');
  checks.push({
    label: `agent.yaml exists (${agentYamlPath})`,
    passed: existsSync(agentYamlPath),
  });

  return checks;
}

export function registerInstall(program: Command): void {
  program
    .command('install')
    .argument('[dir]', 'Agent directory or agent name (checks ~/.soleri/<name> first, then cwd)')
    .option('--target <target>', 'Registration target: claude, opencode, codex, or all', 'claude')
    .option('--verify', 'Verify the install chain (config, engine, agent.yaml)')
    .description('Register agent as MCP server in editor config')
    .action(async (dir?: string, opts?: { target?: string; verify?: boolean }) => {
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
      installLauncher(ctx.agentId, ctx.agentPath, target);

      // Register transcript capture hooks (PreCompact + Stop)
      if (isFileTree) {
        installTranscriptHooks();
      }

      p.log.success(`Install complete for ${ctx.agentId}.`);
      p.log.info(getNextStepMessage(target));

      // Warn users running via npx — their cache may go stale on next release
      if (resolveEngineBin().command === 'npx') {
        p.log.warn(
          `Running via npx — updates may be cached. For reliable updates: npm install -g @soleri/cli`,
        );
      }

      // Run verification if --verify was passed
      if (opts?.verify) {
        const checks = verifyInstall(ctx.agentId, ctx.agentPath, target);
        p.log.info('');
        p.log.info('Install verification:');
        let allPassed = true;
        for (const check of checks) {
          const icon = check.passed ? '\u2705' : '\u274C';
          const logFn = check.passed ? p.log.success : p.log.error;
          logFn(`${icon} ${check.label}`);
          if (!check.passed) allPassed = false;
        }
        if (!allPassed) {
          p.log.error('Verification failed — one or more checks did not pass.');
          process.exit(1);
        }
        p.log.success('All checks passed.');
      }
    });
}
