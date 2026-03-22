import type { Command } from 'commander';
import { existsSync, readdirSync, statSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import * as log from '../utils/logger.js';

const STAGING_ROOT = join(homedir(), '.soleri', 'staging');

interface StagedEntry {
  id: string;
  timestamp: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

/**
 * Walk a directory tree and collect all items with their relative paths.
 */
function walkDir(dir: string, base: string): { relPath: string; size: number }[] {
  const results: { relPath: string; size: number }[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, base));
    } else {
      const stat = statSync(fullPath);
      results.push({ relPath, size: stat.size });
    }
  }
  return results;
}

/**
 * List all staged entries.
 */
function listStaged(): StagedEntry[] {
  if (!existsSync(STAGING_ROOT)) return [];

  const entries: StagedEntry[] = [];
  const dirs = readdirSync(STAGING_ROOT, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const stagePath = join(STAGING_ROOT, dir.name);
    const _stat = statSync(stagePath);
    const files = walkDir(stagePath, stagePath);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    entries.push({
      id: dir.name,
      timestamp: dir.name,
      path: stagePath,
      size: totalSize,
      isDirectory: true,
    });
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Parse a duration string like "7d", "24h", "30m" into milliseconds.
 */
function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerStaging(program: Command): void {
  const staging = program.command('staging').description('Manage anti-deletion staging folder');

  staging
    .command('list')
    .description('Show staged files with timestamps')
    .action(() => {
      const entries = listStaged();

      if (entries.length === 0) {
        log.info('No staged files found.');
        log.dim(`  Staging directory: ${STAGING_ROOT}`);
        return;
      }

      log.heading('Staged Files');

      for (const entry of entries) {
        const files = walkDir(entry.path, entry.path);
        log.pass(entry.id, `${files.length} file(s), ${formatSize(entry.size)}`);
        for (const file of files.slice(0, 10)) {
          log.dim(`    ${file.relPath}`);
        }
        if (files.length > 10) {
          log.dim(`    ... and ${files.length - 10} more`);
        }
      }

      log.info(`${entries.length} staging snapshot(s) in ${STAGING_ROOT}`);
    });

  staging
    .command('restore')
    .argument('<id>', 'Staging snapshot ID (timestamp)')
    .description('Restore files from staging to their original locations')
    .action((id: string) => {
      const stagePath = join(STAGING_ROOT, id);

      if (!existsSync(stagePath)) {
        log.fail(`Staging snapshot "${id}" not found.`);
        const entries = listStaged();
        if (entries.length > 0) {
          log.info(`Available: ${entries.map((e) => e.id).join(', ')}`);
        }
        process.exit(1);
      }

      const files = walkDir(stagePath, stagePath);
      let restored = 0;

      for (const file of files) {
        // The staging preserves absolute paths, so the relPath starts from root
        const destPath = join('/', file.relPath);
        const srcPath = join(stagePath, file.relPath);

        try {
          const destDir = join(destPath, '..');
          mkdirSync(destDir, { recursive: true });
          cpSync(srcPath, destPath, { force: true });
          restored++;
          log.pass(`Restored ${destPath}`);
        } catch (err) {
          log.fail(`Failed to restore ${destPath}: ${err}`);
        }
      }

      log.info(`Restored ${restored}/${files.length} file(s) from snapshot "${id}"`);
    });

  staging
    .command('purge')
    .option('--older-than <duration>', 'Only purge snapshots older than duration (e.g. 7d, 24h)')
    .description('Permanently delete staged files')
    .action((opts: { olderThan?: string }) => {
      if (!existsSync(STAGING_ROOT)) {
        log.info('No staging directory found. Nothing to purge.');
        return;
      }

      const entries = listStaged();

      if (entries.length === 0) {
        log.info('No staged files to purge.');
        return;
      }

      let toPurge = entries;

      if (opts.olderThan) {
        const maxAge = parseDuration(opts.olderThan);
        if (!maxAge) {
          log.fail(`Invalid duration: "${opts.olderThan}". Use format like 7d, 24h, 30m`);
          process.exit(1);
        }

        const cutoff = Date.now() - maxAge;
        toPurge = entries.filter((entry) => {
          const stat = statSync(entry.path);
          return stat.mtimeMs < cutoff;
        });
      }

      if (toPurge.length === 0) {
        log.info('No snapshots match the purge criteria.');
        return;
      }

      for (const entry of toPurge) {
        rmSync(entry.path, { recursive: true, force: true });
        log.warn(`Purged ${entry.id}`);
      }

      log.info(`Purged ${toPurge.length} staging snapshot(s)`);
    });
}
