/**
 * OAuth Token Discovery — find Claude Code OAuth tokens on macOS and Linux.
 *
 * Priority:
 * 1. ANTHROPIC_API_KEY env var (explicit, highest priority)
 * 2. Claude Code credentials file (~/.claude/.credentials.json or similar)
 * 3. macOS Keychain (security find-generic-password)
 * 4. Linux GNOME Keyring (secret-tool lookup)
 * 5. null (graceful fallback → use OpenAI or no LLM)
 *
 * Cached for 5 minutes to avoid repeated I/O.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

// ─── Cache ───────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Discover an Anthropic API token. Returns null if none found.
 * Results cached for 5 minutes.
 */
export function discoverAnthropicToken(): string | null {
  if (cachedToken && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedToken;
  }

  const token = tryEnvVar() ?? tryCredentialsFile() ?? tryPlatformKeychain();

  if (token) {
    cachedToken = token;
    cacheTimestamp = Date.now();
  }

  return token;
}

// ─── Discovery Methods ───────────────────────────────────────────────

function tryEnvVar(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

function tryCredentialsFile(): string | null {
  const candidates = [
    join(homedir(), '.claude', '.credentials.json'),
    join(homedir(), '.claude', 'credentials.json'),
    join(homedir(), '.config', 'claude', 'credentials.json'),
  ];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Claude Code OAuth format: { claudeAiOauth: { accessToken: "..." } }
      const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
      if (oauth?.accessToken && typeof oauth.accessToken === 'string') {
        return oauth.accessToken;
      }

      // Alternative: direct token field
      if (parsed.accessToken && typeof parsed.accessToken === 'string') {
        return parsed.accessToken as string;
      }

      // Alternative: API key field
      if (parsed.apiKey && typeof parsed.apiKey === 'string') {
        return parsed.apiKey as string;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function tryPlatformKeychain(): string | null {
  const os = platform();

  if (os === 'darwin') return tryMacKeychain();
  if (os === 'linux') return tryLinuxKeyring();

  return null;
}

function tryMacKeychain(): string | null {
  try {
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    if (!raw) return null;

    // Try JSON parse
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
      if (oauth?.accessToken && typeof oauth.accessToken === 'string') {
        return oauth.accessToken;
      }
    } catch {
      // JSON might be truncated — try regex fallback
      const match = raw.match(/"accessToken"\s*:\s*"([^"]+)"/);
      if (match) return match[1];
    }
  } catch {
    // Keychain not available or no entry
  }

  return null;
}

function tryLinuxKeyring(): string | null {
  try {
    // GNOME Keyring via secret-tool
    const token = execFileSync(
      'secret-tool',
      ['lookup', 'service', 'Claude Code', 'type', 'credentials'],
      { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();

    if (token) {
      // May be JSON or raw token
      try {
        const parsed = JSON.parse(token) as Record<string, unknown>;
        const oauth = parsed.claudeAiOauth as Record<string, unknown> | undefined;
        if (oauth?.accessToken) return oauth.accessToken as string;
      } catch {
        // Treat as raw token
        if (token.length > 20) return token;
      }
    }
  } catch {
    // secret-tool not available or no entry
  }

  return null;
}
