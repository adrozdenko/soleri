/**
 * Hook pack registry — discovers built-in packs and checks installation status.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export interface HookPackScript {
  name: string;
  file: string;
  targetDir: string;
}

export interface HookPackLifecycleHook {
  event: string;
  matcher: string;
  type: 'command';
  command: string;
  timeout?: number;
  statusMessage?: string;
}

export interface HookPackManifest {
  name: string;
  description: string;
  hooks: string[];
  composedFrom?: string[];
  version?: string;
  scripts?: HookPackScript[];
  lifecycleHooks?: HookPackLifecycleHook[];
  source?: 'built-in' | 'local';
  actionLevel?: 'remind' | 'warn' | 'block';
  /** If false, pack is hidden from the scaffold picker but still installable via `hooks add-pack`. */
  scaffoldDefault?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getBuiltinRoot(): string {
  return __dirname;
}
function getLocalRoot(): string {
  return join(process.cwd(), '.soleri', 'hook-packs');
}

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
      /* Skip malformed manifests */
    }
  }
  return packs;
}

export function listPacks(): HookPackManifest[] {
  const builtIn = scanPacksDir(getBuiltinRoot(), 'built-in');
  const local = scanPacksDir(getLocalRoot(), 'local');
  const byName = new Map<string, HookPackManifest>();
  for (const pack of builtIn) byName.set(pack.name, pack);
  for (const pack of local) byName.set(pack.name, pack);
  return Array.from(byName.values());
}

export function getPack(name: string): { manifest: HookPackManifest; dir: string } | null {
  const localDir = join(getLocalRoot(), name);
  const localManifest = join(localDir, 'manifest.json');
  if (existsSync(localManifest)) {
    try {
      const manifest = JSON.parse(readFileSync(localManifest, 'utf-8')) as HookPackManifest;
      manifest.source = 'local';
      return { manifest, dir: localDir };
    } catch {
      /* Fall through */
    }
  }
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

export function getInstalledPacks(): string[] {
  const claudeDir = join(homedir(), '.claude');
  const packs = listPacks();
  const installed = new Set<string>();

  // First pass: detect directly installed packs (hooks or scripts)
  for (const pack of packs) {
    if (pack.hooks.length === 0) {
      if (pack.scripts && pack.scripts.length > 0) {
        const allScripts = pack.scripts.every((script) =>
          existsSync(join(claudeDir, script.targetDir, script.file)),
        );
        if (allScripts) {
          installed.add(pack.name);
        }
      }
      continue;
    }
    const allPresent = pack.hooks.every((hook) =>
      existsSync(join(claudeDir, `hookify.${hook}.local.md`)),
    );
    if (allPresent) {
      installed.add(pack.name);
    }
  }

  // Second pass: composed packs are installed if all sub-packs are installed
  for (const pack of packs) {
    if (pack.composedFrom && pack.composedFrom.length > 0 && !installed.has(pack.name)) {
      const allSubsInstalled = pack.composedFrom.every((sub) => installed.has(sub));
      if (allSubsInstalled) {
        installed.add(pack.name);
      }
    }
  }

  return Array.from(installed);
}
