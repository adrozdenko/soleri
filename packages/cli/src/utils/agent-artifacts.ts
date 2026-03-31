/**
 * Detect all artifacts left by an installed Soleri agent.
 * Read-only — never modifies the filesystem.
 */
import { existsSync, readFileSync } from 'node:fs';
import { rm, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ArtifactLocation {
  path: string;
  exists: boolean;
}

export interface ClaudeMdBlock {
  path: string;
  startLine: number;
  endLine: number;
  startMarker: string;
  endMarker: string;
}

export interface McpServerEntry {
  file: string;
  key: string;
  target: 'claude' | 'codex' | 'opencode';
}

export interface PermissionEntry {
  file: string;
  pattern: string;
  matches: string[];
}

export interface ArtifactManifest {
  agentId: string;
  projectDir: ArtifactLocation | null;
  dataDir: ArtifactLocation | null;
  dataDirLegacy: ArtifactLocation | null;
  claudeMdBlocks: ClaudeMdBlock[];
  mcpServerEntries: McpServerEntry[];
  permissionEntries: PermissionEntry[];
  launcherScript: ArtifactLocation | null;
}

export interface RemovalResult {
  removed: boolean;
  path: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOLERI_HOME = process.env.SOLERI_HOME ?? join(homedir(), '.soleri');

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function location(p: string): ArtifactLocation {
  return { path: p, exists: existsSync(p) };
}

/**
 * Read a file safely — returns null if the file doesn't exist or can't be read.
 */
function safeRead(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Parse a JSON file safely, optionally stripping single-line comments first.
 */
function safeParseJson(filePath: string, stripComments = false): Record<string, unknown> | null {
  const raw = safeRead(filePath);
  if (raw === null) return null;
  try {
    const content = stripComments ? raw.replace(/^\s*\/\/.*$/gm, '') : raw;
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Detection: CLAUDE.md blocks
// ---------------------------------------------------------------------------

function detectClaudeMdBlocks(agentId: string): ClaudeMdBlock[] {
  const home = homedir();
  const paths = [join(home, 'CLAUDE.md'), join(home, '.claude', 'CLAUDE.md')];

  const startMarker = `<!-- agent:${agentId}:mode -->`;
  const endMarker = `<!-- /agent:${agentId}:mode -->`;
  const blocks: ClaudeMdBlock[] = [];

  for (const filePath of paths) {
    const content = safeRead(filePath);
    if (content === null) continue;

    const lines = content.split('\n');
    let startLine: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === startMarker) {
        startLine = i + 1; // 1-based
      } else if (trimmed === endMarker && startLine !== null) {
        blocks.push({
          path: filePath,
          startLine,
          endLine: i + 1, // 1-based
          startMarker,
          endMarker,
        });
        startLine = null;
      }
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Detection: MCP server entries
// ---------------------------------------------------------------------------

function detectMcpServerEntries(agentId: string): McpServerEntry[] {
  const home = homedir();
  const entries: McpServerEntry[] = [];
  const escapedId = escapeRegExp(agentId);

  // Claude: ~/.claude.json → mcpServers.<key>
  const claudeConfigPath = join(home, '.claude.json');
  const claudeConfig = safeParseJson(claudeConfigPath);
  if (claudeConfig) {
    const servers = claudeConfig.mcpServers as Record<string, unknown> | undefined;
    if (servers && typeof servers === 'object') {
      for (const key of Object.keys(servers)) {
        if (key.includes(agentId)) {
          entries.push({ file: claudeConfigPath, key, target: 'claude' });
        }
      }
    }
  }

  // Codex: ~/.codex/config.toml → [mcp_servers.<agentId>]
  const codexConfigPath = join(home, '.codex', 'config.toml');
  const codexContent = safeRead(codexConfigPath);
  if (codexContent !== null) {
    const sectionRegex = new RegExp(`\\[mcp_servers\\.${escapedId}\\]`);
    if (sectionRegex.test(codexContent)) {
      entries.push({ file: codexConfigPath, key: agentId, target: 'codex' });
    }
  }

  // OpenCode: ~/.config/opencode/opencode.json → mcp.<key>
  const opencodeConfigPath = join(home, '.config', 'opencode', 'opencode.json');
  const opencodeConfig = safeParseJson(opencodeConfigPath, true);
  if (opencodeConfig) {
    const servers = opencodeConfig.mcp as Record<string, unknown> | undefined;
    if (servers && typeof servers === 'object') {
      for (const key of Object.keys(servers)) {
        if (key.includes(agentId)) {
          entries.push({ file: opencodeConfigPath, key, target: 'opencode' });
        }
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Detection: Permission entries
// ---------------------------------------------------------------------------

function detectPermissionEntries(agentId: string): PermissionEntry[] {
  const home = homedir();
  const settingsPath = join(home, '.claude', 'settings.local.json');
  const config = safeParseJson(settingsPath);
  if (!config) return [];

  const permissions = config.permissions as Record<string, unknown> | undefined;
  if (!permissions || typeof permissions !== 'object') return [];

  const allowList = permissions.allow;
  if (!Array.isArray(allowList)) return [];

  const prefix = `mcp__${agentId}__`;
  const matches = allowList.filter(
    (entry: unknown) => typeof entry === 'string' && entry.startsWith(prefix),
  ) as string[];

  if (matches.length === 0) return [];

  return [{ file: settingsPath, pattern: prefix, matches }];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Detect all artifacts installed by a Soleri agent.
 * Non-destructive — reads the filesystem but never modifies it.
 */
export function detectArtifacts(agentId: string, agentDir?: string): ArtifactManifest {
  const home = homedir();

  // Project directory
  const projectPath = agentDir ?? join(home, 'projects', agentId);
  const projectDir = location(projectPath);

  // Data directory (current): ~/.soleri/<agentId>/
  const dataDir = location(join(SOLERI_HOME, agentId));

  // Data directory (legacy): ~/.<agentId>/
  const dataDirLegacy = location(join(home, `.${agentId}`));

  // Launcher script: /usr/local/bin/<agentId>
  const launcherScript = location(join('/usr/local/bin', agentId));

  return {
    agentId,
    projectDir,
    dataDir,
    dataDirLegacy,
    claudeMdBlocks: detectClaudeMdBlocks(agentId),
    mcpServerEntries: detectMcpServerEntries(agentId),
    permissionEntries: detectPermissionEntries(agentId),
    launcherScript,
  };
}

// ---------------------------------------------------------------------------
// Removal handlers
// ---------------------------------------------------------------------------

/**
 * Remove a directory recursively.
 * Idempotent — returns { removed: false } if the directory doesn't exist.
 */
export async function removeDirectory(dirPath: string): Promise<RemovalResult> {
  try {
    if (!existsSync(dirPath)) {
      return { removed: false, path: dirPath };
    }
    await rm(dirPath, { recursive: true, force: true });
    return { removed: true, path: dirPath };
  } catch (err) {
    return { removed: false, path: dirPath, error: (err as Error).message };
  }
}

/**
 * Remove a CLAUDE.md block by line range (1-based, inclusive).
 * Collapses triple+ blank lines down to at most two consecutive newlines.
 * Idempotent — returns { removed: false } if the file doesn't exist.
 */
export async function removeClaudeMdBlock(
  filePath: string,
  startLine: number,
  endLine: number,
): Promise<RemovalResult> {
  try {
    if (!existsSync(filePath)) {
      return { removed: false, path: filePath };
    }

    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Remove lines from startLine to endLine (1-based, inclusive)
    lines.splice(startLine - 1, endLine - startLine + 1);

    // Collapse triple+ blank lines to max 2 consecutive newlines
    const result = lines.join('\n').replace(/\n{3,}/g, '\n\n');

    await writeFile(filePath, result, 'utf-8');
    return { removed: true, path: filePath };
  } catch (err) {
    return { removed: false, path: filePath, error: (err as Error).message };
  }
}

/**
 * Remove permission entries for an agent from settings.local.json.
 * Filters out entries from permissions.allow that start with `mcp__<agentId>__`.
 * Idempotent — returns { removed: false } if the file doesn't exist or has no matches.
 */
export async function removePermissionEntries(
  filePath: string,
  agentId: string,
): Promise<RemovalResult> {
  try {
    if (!existsSync(filePath)) {
      return { removed: false, path: filePath };
    }

    const raw = await readFile(filePath, 'utf-8');
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { removed: false, path: filePath, error: 'Failed to parse JSON' };
    }

    const permissions = config.permissions as Record<string, unknown> | undefined;
    if (!permissions || typeof permissions !== 'object') {
      return { removed: false, path: filePath };
    }

    const allowList = permissions.allow;
    if (!Array.isArray(allowList)) {
      return { removed: false, path: filePath };
    }

    const prefix = `mcp__${agentId}__`;
    const filtered = allowList.filter(
      (entry: unknown) => !(typeof entry === 'string' && entry.startsWith(prefix)),
    );

    if (filtered.length === allowList.length) {
      return { removed: false, path: filePath };
    }

    permissions.allow = filtered;
    await writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return { removed: true, path: filePath };
  } catch (err) {
    return { removed: false, path: filePath, error: (err as Error).message };
  }
}

/**
 * Remove a launcher script (e.g. /usr/local/bin/<agentId>).
 * Idempotent — returns { removed: false } if the file doesn't exist.
 */
export async function removeLauncherScript(scriptPath: string): Promise<RemovalResult> {
  try {
    if (!existsSync(scriptPath)) {
      return { removed: false, path: scriptPath };
    }
    await unlink(scriptPath);
    return { removed: true, path: scriptPath };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const message =
      code === 'EACCES'
        ? `Permission denied — you may need sudo to remove ${scriptPath}`
        : (err as Error).message;
    return { removed: false, path: scriptPath, error: message };
  }
}
