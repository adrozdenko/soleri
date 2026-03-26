/**
 * Hook pack installer — copies hookify files and scripts to ~/.claude/ (global) or project .claude/ (local).
 * Also manages lifecycle hooks in ~/.claude/settings.json.
 */
import {
  existsSync,
  copyFileSync,
  unlinkSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getPack } from './registry.js';
import type { HookPackLifecycleHook } from './registry.js';

const PACK_MARKER = '_soleriPack';

function resolveClaudeDir(projectDir?: string): string {
  if (projectDir) return join(projectDir, '.claude');
  return join(homedir(), '.claude');
}

function resolveHookFiles(packName: string): Map<string, string> {
  const pack = getPack(packName);
  if (!pack) return new Map();
  const files = new Map<string, string>();
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      const subFiles = resolveHookFiles(subPackName);
      for (const [hook, path] of subFiles) {
        files.set(hook, path);
      }
    }
  } else {
    for (const hook of pack.manifest.hooks) {
      const filePath = join(pack.dir, `hookify.${hook}.local.md`);
      if (existsSync(filePath)) {
        files.set(hook, filePath);
      }
    }
  }
  return files;
}

function resolveScripts(
  packName: string,
): Map<string, { sourcePath: string; targetDir: string; file: string }> {
  const pack = getPack(packName);
  if (!pack) return new Map();
  const scripts = new Map<string, { sourcePath: string; targetDir: string; file: string }>();
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      const subScripts = resolveScripts(subPackName);
      for (const [name, info] of subScripts) {
        scripts.set(name, info);
      }
    }
  } else if (pack.manifest.scripts) {
    for (const script of pack.manifest.scripts) {
      const sourcePath = join(pack.dir, 'scripts', script.file);
      if (existsSync(sourcePath)) {
        scripts.set(script.name, { sourcePath, targetDir: script.targetDir, file: script.file });
      }
    }
  }
  return scripts;
}

function resolveLifecycleHooks(
  packName: string,
): { packName: string; hook: HookPackLifecycleHook }[] {
  const pack = getPack(packName);
  if (!pack) return [];
  const hooks: { packName: string; hook: HookPackLifecycleHook }[] = [];
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      hooks.push(...resolveLifecycleHooks(subPackName));
    }
  } else if (pack.manifest.lifecycleHooks) {
    for (const hook of pack.manifest.lifecycleHooks) {
      hooks.push({ packName: pack.manifest.name, hook });
    }
  }
  return hooks;
}

interface SettingsHookEntry {
  type: 'command';
  command: string;
  timeout?: number;
  [key: string]: unknown;
}

function readClaudeSettings(claudeDir: string): Record<string, unknown> {
  const settingsPath = join(claudeDir, 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeClaudeSettings(claudeDir: string, settings: Record<string, unknown>): void {
  const settingsPath = join(claudeDir, 'settings.json');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function addLifecycleHooks(
  claudeDir: string,
  lifecycleHooks: { packName: string; hook: HookPackLifecycleHook }[],
): string[] {
  if (lifecycleHooks.length === 0) return [];
  const settings = readClaudeSettings(claudeDir);
  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;
  const added: string[] = [];
  for (const { packName: sourcePack, hook } of lifecycleHooks) {
    const eventKey = hook.event;
    const eventHooks = (hooks[eventKey] ?? []) as SettingsHookEntry[];
    const alreadyExists = eventHooks.some(
      (h) => h.command === hook.command && h[PACK_MARKER] === sourcePack,
    );
    if (!alreadyExists) {
      const entry: SettingsHookEntry = {
        type: hook.type,
        command: hook.command,
        [PACK_MARKER]: sourcePack,
      };
      if (hook.timeout) {
        entry.timeout = hook.timeout;
      }
      eventHooks.push(entry);
      hooks[eventKey] = eventHooks;
      added.push(`${eventKey}:${hook.matcher}`);
    }
  }
  settings['hooks'] = hooks;
  writeClaudeSettings(claudeDir, settings);
  return added;
}

function removeLifecycleHooks(claudeDir: string, packName: string): string[] {
  const settings = readClaudeSettings(claudeDir);
  const hooks = (settings['hooks'] ?? {}) as Record<string, SettingsHookEntry[]>;
  const removed: string[] = [];
  for (const [eventKey, eventHooks] of Object.entries(hooks)) {
    if (!Array.isArray(eventHooks)) continue;
    const before = eventHooks.length;
    const filtered = eventHooks.filter((h) => h[PACK_MARKER] !== packName);
    if (filtered.length < before) {
      removed.push(eventKey);
      if (filtered.length === 0) {
        delete hooks[eventKey];
      } else {
        hooks[eventKey] = filtered;
      }
    }
  }
  if (removed.length > 0) {
    settings['hooks'] = hooks;
    writeClaudeSettings(claudeDir, settings);
  }
  return removed;
}

export function installPack(
  packName: string,
  options?: { projectDir?: string },
): { installed: string[]; skipped: string[]; scripts: string[]; lifecycleHooks: string[] } {
  const pack = getPack(packName);
  if (!pack) {
    throw new Error(`Unknown hook pack: "${packName}"`);
  }
  const claudeDir = resolveClaudeDir(options?.projectDir);
  mkdirSync(claudeDir, { recursive: true });
  const hookFiles = resolveHookFiles(packName);
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const [hook, sourcePath] of hookFiles) {
    const destPath = join(claudeDir, `hookify.${hook}.local.md`);
    if (existsSync(destPath)) {
      skipped.push(hook);
    } else {
      copyFileSync(sourcePath, destPath);
      installed.push(hook);
    }
  }
  const scriptFiles = resolveScripts(packName);
  const installedScripts: string[] = [];
  for (const [, { sourcePath, targetDir, file }] of scriptFiles) {
    const destDir = join(claudeDir, targetDir);
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, file);
    copyFileSync(sourcePath, destPath);
    if (process.platform !== 'win32') {
      chmodSync(destPath, 0o755);
    }
    installedScripts.push(`${targetDir}/${file}`);
  }
  const lcHooks = resolveLifecycleHooks(packName);
  const addedHooks = addLifecycleHooks(claudeDir, lcHooks);
  return { installed, skipped, scripts: installedScripts, lifecycleHooks: addedHooks };
}

export function removePack(
  packName: string,
  options?: { projectDir?: string },
): { removed: string[]; scripts: string[]; lifecycleHooks: string[] } {
  const pack = getPack(packName);
  if (!pack) {
    throw new Error(`Unknown hook pack: "${packName}"`);
  }
  const claudeDir = resolveClaudeDir(options?.projectDir);
  const removed: string[] = [];
  for (const hook of pack.manifest.hooks) {
    const filePath = join(claudeDir, `hookify.${hook}.local.md`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      removed.push(hook);
    }
  }
  const removedScripts: string[] = [];
  if (pack.manifest.scripts) {
    for (const script of pack.manifest.scripts) {
      const filePath = join(claudeDir, script.targetDir, script.file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        removedScripts.push(`${script.targetDir}/${script.file}`);
      }
    }
  }
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      const subPack = getPack(subPackName);
      if (subPack?.manifest.scripts) {
        for (const script of subPack.manifest.scripts) {
          const filePath = join(claudeDir, script.targetDir, script.file);
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            removedScripts.push(`${script.targetDir}/${script.file}`);
          }
        }
      }
    }
  }
  const removedHooks = removeLifecycleHooks(claudeDir, packName);
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      removedHooks.push(...removeLifecycleHooks(claudeDir, subPackName));
    }
  }
  return { removed, scripts: removedScripts, lifecycleHooks: removedHooks };
}

export function isPackInstalled(
  packName: string,
  options?: { projectDir?: string },
): boolean | 'partial' {
  const pack = getPack(packName);
  if (!pack) return false;
  const claudeDir = resolveClaudeDir(options?.projectDir);
  let total = 0;
  let present = 0;
  for (const hook of pack.manifest.hooks) {
    total++;
    if (existsSync(join(claudeDir, `hookify.${hook}.local.md`))) {
      present++;
    }
  }
  if (pack.manifest.scripts) {
    for (const script of pack.manifest.scripts) {
      total++;
      if (existsSync(join(claudeDir, script.targetDir, script.file))) {
        present++;
      }
    }
  }
  if (pack.manifest.composedFrom) {
    for (const subPackName of pack.manifest.composedFrom) {
      const subPack = getPack(subPackName);
      if (subPack?.manifest.scripts) {
        for (const script of subPack.manifest.scripts) {
          total++;
          if (existsSync(join(claudeDir, script.targetDir, script.file))) {
            present++;
          }
        }
      }
    }
  }
  if (total === 0) {
    const lcHooks = resolveLifecycleHooks(packName);
    if (lcHooks.length > 0) {
      const settings = readClaudeSettings(claudeDir);
      const hooksObj = (settings['hooks'] ?? {}) as Record<string, SettingsHookEntry[]>;
      for (const { packName: sourcePack, hook } of lcHooks) {
        total++;
        const eventHooks = hooksObj[hook.event];
        if (
          Array.isArray(eventHooks) &&
          eventHooks.some((h) => h.command === hook.command && h[PACK_MARKER] === sourcePack)
        ) {
          present++;
        }
      }
    }
  }
  if (total === 0) return false;
  if (present === 0) return false;
  if (present === total) return true;
  return 'partial';
}
