/**
 * Health check utilities for the doctor command.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { detectAgent } from './agent-context.js';

interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  label: string;
  detail?: string;
}

export function checkNodeVersion(): CheckResult {
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 18) {
    return { status: 'pass', label: 'Node.js', detail: `v${process.versions.node}` };
  }
  return { status: 'fail', label: 'Node.js', detail: `v${process.versions.node} (>=18 required)` };
}

export function checkNpm(): CheckResult {
  try {
    const version = execFileSync('npm', ['--version'], { encoding: 'utf-8' }).trim();
    return { status: 'pass', label: 'npm', detail: `v${version}` };
  } catch {
    return { status: 'fail', label: 'npm', detail: 'not found' };
  }
}

function checkTsx(): CheckResult {
  try {
    const version = execFileSync('npx', ['tsx', '--version'], {
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim();
    return { status: 'pass', label: 'tsx', detail: `v${version}` };
  } catch {
    return { status: 'warn', label: 'tsx', detail: 'not found — needed for soleri dev' };
  }
}

export function checkAgentProject(dir?: string): CheckResult {
  const ctx = detectAgent(dir);
  if (!ctx) {
    return { status: 'warn', label: 'Agent project', detail: 'not detected in current directory' };
  }
  return { status: 'pass', label: 'Agent project', detail: `${ctx.agentId} (${ctx.packageName})` };
}

export function checkAgentBuild(dir?: string): CheckResult {
  const ctx = detectAgent(dir);
  if (!ctx) return { status: 'warn', label: 'Agent build', detail: 'no agent detected' };

  if (!existsSync(join(ctx.agentPath, 'dist'))) {
    return { status: 'fail', label: 'Agent build', detail: 'dist/ not found — run npm run build' };
  }
  if (!existsSync(join(ctx.agentPath, 'dist', 'index.js'))) {
    return {
      status: 'fail',
      label: 'Agent build',
      detail: 'dist/index.js not found — run npm run build',
    };
  }
  return { status: 'pass', label: 'Agent build', detail: 'dist/index.js exists' };
}

export function checkNodeModules(dir?: string): CheckResult {
  const ctx = detectAgent(dir);
  if (!ctx) return { status: 'warn', label: 'Dependencies', detail: 'no agent detected' };

  if (!existsSync(join(ctx.agentPath, 'node_modules'))) {
    return {
      status: 'fail',
      label: 'Dependencies',
      detail: 'node_modules/ not found — run npm install',
    };
  }
  return { status: 'pass', label: 'Dependencies', detail: 'node_modules/ exists' };
}

function checkMcpRegistration(dir?: string): CheckResult {
  const ctx = detectAgent(dir);
  if (!ctx) return { status: 'warn', label: 'MCP registration', detail: 'no agent detected' };

  const claudeJsonPath = join(homedir(), '.claude.json');
  if (!existsSync(claudeJsonPath)) {
    return {
      status: 'warn',
      label: 'MCP registration',
      detail: '~/.claude.json not found',
    };
  }

  try {
    const config = JSON.parse(readFileSync(claudeJsonPath, 'utf-8'));
    const servers = config.mcpServers ?? {};
    if (ctx.agentId in servers) {
      return {
        status: 'pass',
        label: 'MCP registration',
        detail: `registered as "${ctx.agentId}"`,
      };
    }
    return {
      status: 'warn',
      label: 'MCP registration',
      detail: `"${ctx.agentId}" not found in ~/.claude.json`,
    };
  } catch {
    return { status: 'fail', label: 'MCP registration', detail: 'failed to parse ~/.claude.json' };
  }
}

export function runAllChecks(dir?: string): CheckResult[] {
  return [
    checkNodeVersion(),
    checkNpm(),
    checkTsx(),
    checkAgentProject(dir),
    checkNodeModules(dir),
    checkAgentBuild(dir),
    checkMcpRegistration(dir),
  ];
}
