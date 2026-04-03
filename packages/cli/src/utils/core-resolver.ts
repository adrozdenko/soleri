import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function resolveCoreEntryPath(): string | null {
  try {
    return fileURLToPath(import.meta.resolve('@soleri/core'));
  } catch {
    return null;
  }
}

export function resolveCorePackageJsonPath(): string | null {
  const entryPath = resolveCoreEntryPath();
  if (!entryPath) return null;

  const packageJsonPath = join(dirname(entryPath), '..', 'package.json');
  return existsSync(packageJsonPath) ? packageJsonPath : null;
}

export function readInstalledCoreVersion(): string | null {
  const packageJsonPath = resolveCorePackageJsonPath();
  if (!packageJsonPath) return null;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

export function resolveInstalledEngineBin(): string | null {
  const entryPath = resolveCoreEntryPath();
  if (!entryPath) return null;

  const engineBinPath = join(dirname(entryPath), 'engine', 'bin', 'soleri-engine.js');
  return existsSync(engineBinPath) ? engineBinPath : null;
}
