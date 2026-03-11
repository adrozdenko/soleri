/**
 * Hook pack registry — discovers built-in packs and checks installation status.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

interface HookPackManifest {
  name: string;
  description: string;
  hooks: string[];
  composedFrom?: string[];
  version?: string;
  /** Whether this pack is built-in or user-defined */
  source?: 'built-in' | 'local';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Root directory containing all built-in hook packs. */
function getBuiltinRoot(): string {
  return __dirname;
}

/** Local custom packs directory. */
function getLocalRoot(): string {
  return join(process.cwd(), '.soleri', 'hook-packs');
}

/** Scan a directory for pack manifests. */
function scanPacksDir(root: string, source: 'built-in' | 'local'): HookPackManifest[] {
  if (!existsSync(root)) return [];
  const entries = readdirSync(root, { withFileTypes: true });
  const packs: HookPackManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(root, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as HookPackManifest;
      manifest.source = source;
      packs.push(manifest);
    } catch {
      // Skip malformed manifests
    }
  }

  return packs;
}

/**
 * List all available hook packs (built-in + local custom).
 * Local packs in .soleri/hook-packs/ override built-in packs with the same name.
 */
export function listPacks(): HookPackManifest[] {
  const builtIn = scanPacksDir(getBuiltinRoot(), 'built-in');
  const local = scanPacksDir(getLocalRoot(), 'local');

  // Local packs override built-in packs with same name
  const byName = new Map<string, HookPackManifest>();
  for (const pack of builtIn) byName.set(pack.name, pack);
  for (const pack of local) byName.set(pack.name, pack);

  return Array.from(byName.values());
}

/**
 * Get a specific pack by name. Local packs take precedence.
 */
export function getPack(name: string): { manifest: HookPackManifest; dir: string } | null {
  // Check local first
  const localDir = join(getLocalRoot(), name);
  const localManifest = join(localDir, 'manifest.json');
  if (existsSync(localManifest)) {
    try {
      const manifest = JSON.parse(readFileSync(localManifest, 'utf-8')) as HookPackManifest;
      manifest.source = 'local';
      return { manifest, dir: localDir };
    } catch {
      // Fall through to built-in
    }
  }

  // Then built-in
  const builtinDir = join(getBuiltinRoot(), name);
  const builtinManifest = join(builtinDir, 'manifest.json');
  if (!existsSync(builtinManifest)) return null;

  try {
    const manifest = JSON.parse(readFileSync(builtinManifest, 'utf-8')) as HookPackManifest;
    manifest.source = 'built-in';
    return { manifest, dir: builtinDir };
  } catch {
    return null;
  }
}

/**
 * Get names of packs that are fully installed in ~/.claude/.
 */
export function getInstalledPacks(): string[] {
  const claudeDir = join(homedir(), '.claude');
  const packs = listPacks();
  const installed: string[] = [];

  for (const pack of packs) {
    const allPresent = pack.hooks.every((hook) =>
      existsSync(join(claudeDir, `hookify.${hook}.local.md`)),
    );
    if (allPresent) {
      installed.push(pack.name);
    }
  }

  return installed;
}
