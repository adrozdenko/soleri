import { spawn } from 'node:child_process';
import { LLMError } from './types.js';
import type { LLMCallResult } from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const SYSTEM_DIVIDER = '\n\n---\n\n';

interface ClaudeCLIRunOptions {
  binary: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
}

interface ClaudeCLIJsonResult {
  result?: string;
  text?: string;
  content?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  is_error?: boolean;
  error?: string;
}

function extractText(parsed: ClaudeCLIJsonResult): string {
  return parsed.result ?? parsed.text ?? parsed.content ?? '';
}

function spawnClaude(
  args: string[],
  stdin: string,
  binary: string,
  timeoutMs: number,
): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new LLMError(`claude -p timed out after ${timeoutMs}ms`, { retryable: false }));
    }, timeoutMs);

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
      reject(new LLMError(`claude -p spawn error: ${err.message}`, { retryable: false }));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function callClaudeCLI(options: ClaudeCLIRunOptions): Promise<LLMCallResult> {
  const start = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ['-p', '--output-format', 'json', '--model', options.model];
  const stdin = options.systemPrompt
    ? `${options.systemPrompt}${SYSTEM_DIVIDER}${options.userPrompt}`
    : options.userPrompt;

  const { stdout, stderr, code } = await spawnClaude(args, stdin, options.binary, timeoutMs);

  if (code !== 0) {
    throw new LLMError(`claude -p exited ${code}: ${stderr.trim() || 'no stderr'}`, {
      retryable: false,
      statusCode: code ?? undefined,
    });
  }
  if (!stdout.trim()) {
    throw new LLMError('claude -p returned empty stdout', { retryable: false });
  }

  let parsed: ClaudeCLIJsonResult;
  try {
    parsed = JSON.parse(stdout) as ClaudeCLIJsonResult;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new LLMError(`claude -p returned malformed JSON: ${reason}`, { retryable: false });
  }

  if (parsed.is_error) {
    throw new LLMError(`claude -p reported error: ${parsed.error ?? 'unknown'}`, {
      retryable: false,
    });
  }

  const text = extractText(parsed);
  if (!text) {
    throw new LLMError('claude -p response missing text field', { retryable: false });
  }

  return {
    text,
    model: options.model,
    provider: 'claude-cli',
    inputTokens: parsed.usage?.input_tokens,
    outputTokens: parsed.usage?.output_tokens,
    durationMs: Date.now() - start,
  };
}
