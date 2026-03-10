/**
 * Token Authentication — bearer token generation, validation, and persistence.
 *
 * Uses constant-time comparison (crypto.timingSafeEqual) to prevent timing attacks.
 * Token priority: {AGENT_ID}_HTTP_TOKEN env > ~/.{agentId}/http-token file.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Generate a 32-byte hex token (64 characters). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Load token with priority: env var > file.
 * The env var name is derived from the agentId: MY_AGENT_HTTP_TOKEN.
 */
export function loadToken(agentId: string): string | undefined {
  // Environment variable takes priority
  const envKey = `${agentId.replace(/-/g, '_').toUpperCase()}_HTTP_TOKEN`;
  const envToken = process.env[envKey];
  if (envToken && envToken.trim().length > 0) {
    return envToken.trim();
  }

  // Fall back to file
  const tokenFile = join(homedir(), `.${agentId}`, 'http-token');
  try {
    if (existsSync(tokenFile)) {
      const fileToken = readFileSync(tokenFile, 'utf-8').trim();
      if (fileToken.length > 0) return fileToken;
    }
  } catch {
    // File read failed
  }

  return undefined;
}

/** Save token to ~/.{agentId}/http-token with 0600 permissions. */
export function saveToken(agentId: string, token: string): void {
  const dir = join(homedir(), `.${agentId}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'http-token'), token, { mode: 0o600 });
}

/** Load existing token or generate and save a new one. */
export function getOrGenerateToken(agentId: string): string {
  const existing = loadToken(agentId);
  if (existing) return existing;
  const token = generateToken();
  saveToken(agentId, token);
  return token;
}

/**
 * Constant-time bearer token validation.
 * Returns true if the Authorization header contains a valid Bearer token.
 */
export function validateBearerToken(authHeader: string | undefined, expected: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const provided = authHeader.slice(7);
  const expectedBuf = Buffer.from(expected, 'utf-8');
  const providedBuf = Buffer.from(provided, 'utf-8');

  if (expectedBuf.length !== providedBuf.length) {
    // Compare against self to avoid timing leak on length mismatch
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Validate an incoming HTTP request's bearer token.
 * Returns true if valid, sends 401 and returns false if not.
 */
export function authenticateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedToken: string,
): boolean {
  const authHeader = req.headers.authorization;
  if (validateBearerToken(authHeader, expectedToken)) return true;

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}
