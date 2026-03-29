/**
 * Health check utilities for the doctor command.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { detectAgent, type AgentFormat } from './agent-context.js';
import { getInstalledPacks } from '../hook-packs/registry.js';

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn' | 'skip';
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
    // shell: true is needed on Windows where npm is installed as npm.cmd
    const version = execFileSync('npm', ['--version'], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    }).trim();
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
      shell: process.platform === 'win32',
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
  const formatLabel = ctx.format === 'filetree' ? 'file-tree' : 'typescript';
  return {
    status: 'pass',
    label: 'Agent project',
    detail: `${ctx.agentId} (${ctx.packageName}, ${formatLabel})`,
  };
}

export function checkAgentBuild(dir?: string, format?: AgentFormat): CheckResult {
  if (format === 'filetree') {
    return { status: 'skip', label: 'Agent build', detail: 'not applicable for file-tree agents' };
  }

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

export function checkNodeModules(dir?: string, format?: AgentFormat): CheckResult {
  if (format === 'filetree') {
    return {
      status: 'skip',
      label: 'Dependencies',
      detail: 'not applicable for file-tree agents',
    };
  }

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

export function checkAgentYaml(agentPath: string): CheckResult {
  const yamlPath = join(agentPath, 'agent.yaml');
  if (!existsSync(yamlPath)) {
    return { status: 'fail', label: 'agent.yaml', detail: 'not found' };
  }

  try {
    const content = readFileSync(yamlPath, 'utf-8');
    // Light validation: check for required fields without pulling in a YAML parser
    // (detectAgent already parsed it, but we verify the raw content for diagnostics)
    const hasId = /^id\s*:/m.test(content);
    const hasName = /^name\s*:/m.test(content);

    if (!hasId && !hasName) {
      return {
        status: 'fail',
        label: 'agent.yaml',
        detail: 'missing required fields: id, name',
      };
    }
    if (!hasId) {
      return { status: 'fail', label: 'agent.yaml', detail: 'missing required field: id' };
    }
    if (!hasName) {
      return { status: 'fail', label: 'agent.yaml', detail: 'missing required field: name' };
    }
    return { status: 'pass', label: 'agent.yaml', detail: 'valid (id, name present)' };
  } catch {
    return { status: 'fail', label: 'agent.yaml', detail: 'failed to read file' };
  }
}

export function checkInstructionsDir(agentPath: string): CheckResult {
  const instrDir = join(agentPath, 'instructions');
  if (!existsSync(instrDir)) {
    return {
      status: 'fail',
      label: 'Instructions',
      detail: 'instructions/ directory not found',
    };
  }

  try {
    const files = readdirSync(instrDir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) {
      return {
        status: 'warn',
        label: 'Instructions',
        detail: 'instructions/ exists but contains no .md files',
      };
    }
    return {
      status: 'pass',
      label: 'Instructions',
      detail: `${files.length} instruction file${files.length === 1 ? '' : 's'}`,
    };
  } catch {
    return { status: 'fail', label: 'Instructions', detail: 'failed to read instructions/' };
  }
}

export function checkEngineReachable(): CheckResult {
  try {
    require.resolve('@soleri/core/package.json');
    return { status: 'pass', label: 'Engine', detail: '@soleri/core reachable' };
  } catch {
    return {
      status: 'fail',
      label: 'Engine',
      detail: '@soleri/core not found — engine is required for file-tree agents',
    };
  }
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

function checkCognee(): CheckResult {
  const url = process.env.COGNEE_URL ?? 'http://localhost:8000/';
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { status: 'warn', label: 'Cognee', detail: `invalid COGNEE_URL: ${url}` };
  }
  try {
    execFileSync('curl', ['-fsS', '--max-time', '5', url], { stdio: 'ignore', timeout: 7_000 });
    return { status: 'pass', label: 'Cognee', detail: `available at ${host}` };
  } catch {
    return {
      status: 'warn',
      label: 'Cognee',
      detail: `not running at ${host} — vector search disabled (FTS5 still works)`,
    };
  }
}

function checkHookPacks(): CheckResult {
  const installed = getInstalledPacks();
  if (installed.length === 0) {
    return {
      status: 'warn',
      label: 'Hook packs',
      detail: 'none installed — run soleri hooks list-packs',
    };
  }
  return {
    status: 'pass',
    label: 'Hook packs',
    detail: installed.join(', '),
  };
}

export function runAllChecks(dir?: string): CheckResult[] {
  const ctx = detectAgent(dir);
  const format = ctx?.format;

  // Common checks for all agent formats
  const results: CheckResult[] = [
    checkNodeVersion(),
    checkNpm(),
    checkTsx(),
    checkAgentProject(dir),
  ];

  if (format === 'filetree') {
    // File-tree agent checks
    results.push(
      checkAgentYaml(ctx!.agentPath),
      checkInstructionsDir(ctx!.agentPath),
      checkEngineReachable(),
      checkNodeModules(dir, format),
      checkAgentBuild(dir, format),
    );
  } else {
    // TypeScript agent checks (or no agent detected)
    results.push(checkNodeModules(dir, format), checkAgentBuild(dir, format));
  }

  // Shared checks
  results.push(checkMcpRegistration(dir), checkHookPacks(), checkCognee());

  return results;
}
