/**
 * Git Vault Sync — auto-commit vault changes to a local git repo.
 *
 * SQLite remains the primary store. This is an optional sync layer that
 * serializes vault entries as JSON files in a git-tracked directory,
 * committing each write with a descriptive message.
 *
 * Directory layout:
 *   <repoDir>/
 *     <domain>/
 *       <id>.json
 *
 * Usage:
 *   const sync = new GitVaultSync('/path/to/vault-git');
 *   await sync.init();
 *   await sync.onAdd(entry);
 *   await sync.onUpdate(entry);
 *   await sync.onRemove(entry.id, entry.type, entry.domain);
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { IntelligenceEntry } from '../intelligence/types.js';

export interface GitVaultSyncConfig {
  /** Path to the git-tracked directory for vault entries. */
  repoDir: string;
  /** Git author name for commits. Default: 'soleri'. */
  authorName?: string;
  /** Git author email for commits. Default: 'soleri@localhost'. */
  authorEmail?: string;
  /** Whether to auto-commit. Default: true. If false, only writes files. */
  autoCommit?: boolean;
}

export class GitVaultSync {
  private repoDir: string;
  private authorName: string;
  private authorEmail: string;
  private autoCommit: boolean;
  private initialized = false;

  constructor(config: GitVaultSyncConfig) {
    this.repoDir = config.repoDir;
    this.authorName = config.authorName ?? 'soleri';
    this.authorEmail = config.authorEmail ?? 'soleri@localhost';
    this.autoCommit = config.autoCommit ?? true;
  }

  /**
   * Initialize the git repo if it doesn't exist.
   * Creates the directory and runs `git init` if needed.
   */
  async init(): Promise<void> {
    if (!existsSync(this.repoDir)) {
      mkdirSync(this.repoDir, { recursive: true });
    }
    if (!existsSync(join(this.repoDir, '.git'))) {
      await this.git('init');
      // Set local author config
      await this.git('config', 'user.name', this.authorName);
      await this.git('config', 'user.email', this.authorEmail);
    }
    this.initialized = true;
  }

  /**
   * Called when an entry is added to the vault.
   */
  async onAdd(entry: IntelligenceEntry): Promise<void> {
    this.ensureInitialized();
    this.writeEntry(entry);
    if (this.autoCommit) {
      const filePath = this.entryPath(entry);
      await this.git('add', filePath);
      await this.git(
        'commit',
        '-m',
        `vault: add ${entry.type} [${entry.domain}] ${entry.id}\n\n${entry.title}`,
        '--allow-empty',
      );
    }
  }

  /**
   * Called when an entry is updated in the vault.
   */
  async onUpdate(entry: IntelligenceEntry): Promise<void> {
    this.ensureInitialized();
    this.writeEntry(entry);
    if (this.autoCommit) {
      const filePath = this.entryPath(entry);
      await this.git('add', filePath);
      await this.git(
        'commit',
        '-m',
        `vault: update ${entry.type} [${entry.domain}] ${entry.id}\n\n${entry.title}`,
        '--allow-empty',
      );
    }
  }

  /**
   * Called when an entry is removed from the vault.
   */
  async onRemove(id: string, type: string, domain: string): Promise<void> {
    this.ensureInitialized();
    const filePath = join(domain, `${id}.json`);
    const fullPath = join(this.repoDir, filePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
    if (this.autoCommit) {
      try {
        await this.git('add', filePath);
        await this.git('commit', '-m', `vault: remove ${type} [${domain}] ${id}`, '--allow-empty');
      } catch {
        // File may not be tracked yet — git add will fail, that's ok
      }
    }
  }

  /**
   * Bulk sync: write all entries and commit once.
   */
  async syncAll(entries: IntelligenceEntry[]): Promise<{ synced: number }> {
    this.ensureInitialized();
    for (const entry of entries) {
      this.writeEntry(entry);
    }
    if (this.autoCommit && entries.length > 0) {
      await this.git('add', '.');
      await this.git('commit', '-m', `vault: bulk sync ${entries.length} entries`, '--allow-empty');
    }
    return { synced: entries.length };
  }

  /**
   * Get the git log for the vault repo.
   */
  async log(limit = 20): Promise<string[]> {
    this.ensureInitialized();
    try {
      const output = await this.git('log', '--oneline', `-${limit}`);
      return output
        .trim()
        .split('\n')
        .filter((l) => l.length > 0);
    } catch {
      return [];
    }
  }

  /** Get the repo directory path. */
  getRepoDir(): string {
    return this.repoDir;
  }

  // ─── Internal ─────────────────────────────────────────────

  private writeEntry(entry: IntelligenceEntry): void {
    const domainDir = join(this.repoDir, entry.domain);
    if (!existsSync(domainDir)) {
      mkdirSync(domainDir, { recursive: true });
    }
    const filePath = join(domainDir, `${entry.id}.json`);
    writeFileSync(filePath, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  }

  private entryPath(entry: IntelligenceEntry): string {
    return join(entry.domain, `${entry.id}.json`);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GitVaultSync not initialized. Call init() first.');
    }
  }

  private git(...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd: this.repoDir, timeout: 10_000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args[0]} failed: ${stderr || error.message}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}
