/**
 * Hook pack graduation — promote/demote action levels.
 * remind → warn → block (promote)
 * block → warn → remind (demote)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPack } from './registry.js';
import type { HookPackManifest } from './registry.js';

const LEVELS = ['remind', 'warn', 'block'] as const;
type ActionLevel = (typeof LEVELS)[number];

export interface GraduationResult {
  packName: string;
  previousLevel: ActionLevel;
  newLevel: ActionLevel;
  manifestPath: string;
}

function getCurrentLevel(manifest: HookPackManifest): ActionLevel {
  const level = manifest.actionLevel;
  if (level && (LEVELS as readonly string[]).includes(level)) return level as ActionLevel;
  return 'remind'; // default
}

export function promotePack(packName: string): GraduationResult {
  const pack = getPack(packName);
  if (!pack) throw new Error(`Unknown hook pack: "${packName}"`);

  const manifestPath = join(pack.dir, 'manifest.json');
  const manifest = pack.manifest;
  const current = getCurrentLevel(manifest);
  const currentIndex = LEVELS.indexOf(current);

  if (currentIndex >= LEVELS.length - 1) {
    throw new Error(`Pack "${packName}" is already at maximum level: ${current}`);
  }

  const newLevel = LEVELS[currentIndex + 1];
  manifest.actionLevel = newLevel;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return { packName, previousLevel: current, newLevel, manifestPath };
}

export function demotePack(packName: string): GraduationResult {
  const pack = getPack(packName);
  if (!pack) throw new Error(`Unknown hook pack: "${packName}"`);

  const manifestPath = join(pack.dir, 'manifest.json');
  const manifest = pack.manifest;
  const current = getCurrentLevel(manifest);
  const currentIndex = LEVELS.indexOf(current);

  if (currentIndex <= 0) {
    throw new Error(`Pack "${packName}" is already at minimum level: ${current}`);
  }

  const newLevel = LEVELS[currentIndex - 1];
  manifest.actionLevel = newLevel;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return { packName, previousLevel: current, newLevel, manifestPath };
}
