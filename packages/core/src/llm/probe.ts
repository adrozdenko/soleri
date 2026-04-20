import { spawn } from 'node:child_process';
import type { ClaudeCLIProbe } from './types.js';

const PROBE_TIMEOUT_MS = 2000;
const MCP_PATH_HINT =
  'Hint: MCP server processes do not inherit shell PATH. ' +
  'Add CLAUDE_CLI_PATH to agent.yaml env or .env if using claude-cli provider.';

let cached: ClaudeCLIProbe | null = null;
let warnedMissing = false;

function runProbe(binary: string): Promise<ClaudeCLIProbe> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        available: false,
        error: `claude --version timed out after ${PROBE_TIMEOUT_MS}ms`,
      });
    }, PROBE_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ available: false, error: err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ available: false, error: stderr.trim() || `exit ${code}` });
        return;
      }
      const version = stdout.trim() || stderr.trim();
      resolve({ available: true, version, path: binary });
    });
  });
}

export async function probeClaudeCLI(binary?: string): Promise<ClaudeCLIProbe> {
  if (process.env.SOLERI_DISABLE_CLAUDE_CLI === '1') {
    return { available: false, error: 'disabled via SOLERI_DISABLE_CLAUDE_CLI' };
  }
  if (cached !== null) return cached;
  const target = binary ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  const result = await runProbe(target);
  cached = result;
  if (!result.available && !warnedMissing) {
    warnedMissing = true;
    console.warn(`[soleri] claude CLI not available: ${result.error}\n${MCP_PATH_HINT}`);
  }
  return result;
}

export function resetClaudeCLIProbeCache(): void {
  cached = null;
  warnedMissing = false;
}
