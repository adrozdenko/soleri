/**
 * Vault Sharing Tests — scope detection ops, export/import pack, git sync.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { detectScope } from '../vault/scope-detector.js';
import { GitVaultSync } from '../vault/git-vault-sync.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Scope Detection ──────────────────────────────────────────────────

describe('detectScope', () => {
  test('classifies accessibility patterns as team tier', () => {
    const result = detectScope({
      title: 'Focus ring required for keyboard navigation',
      description:
        'All interactive elements must have visible focus states for WCAG 2.1 compliance.',
      tags: ['a11y', 'accessibility'],
    });
    expect(result.tier).toBe('team');
    expect(result.confidence).toBe('HIGH');
  });

  test('classifies project-specific patterns as project tier', () => {
    const result = detectScope({
      title: 'Monorepo package structure',
      description: 'This project uses packages/@myorg/core for shared code.',
      tags: ['monorepo', 'project-specific'],
    });
    expect(result.tier).toBe('project');
  });

  test('classifies personal preferences as agent tier', () => {
    const result = detectScope({
      title: 'My preferred editor setup',
      description: 'I prefer using ~/dotfiles for my setup with custom aliases.',
      tags: ['personal', 'workflow'],
    });
    expect(result.tier).toBe('agent');
  });

  test('defaults to agent when no signals', () => {
    const result = detectScope({
      title: 'Some generic thing',
      description: 'Nothing specific here.',
    });
    expect(result.tier).toBe('agent');
    expect(result.confidence).toBe('LOW');
  });
});

// ─── Vault Tier Filtering ─────────────────────────────────────────────

describe('Vault tier filtering', () => {
  let vault: Vault;

  const entries: IntelligenceEntry[] = [
    {
      id: 'agent-1',
      type: 'pattern',
      domain: 'testing',
      title: 'Agent Pattern',
      severity: 'suggestion',
      description: 'Agent-level pattern',
      tags: ['test'],
      tier: 'agent',
    },
    {
      id: 'project-1',
      type: 'rule',
      domain: 'testing',
      title: 'Project Rule',
      severity: 'warning',
      description: 'Project-level rule',
      tags: ['test'],
      tier: 'project',
    },
    {
      id: 'team-1',
      type: 'pattern',
      domain: 'accessibility',
      title: 'Team Pattern',
      severity: 'critical',
      description: 'Team-level pattern',
      tags: ['a11y'],
      tier: 'team',
    },
  ];

  beforeEach(() => {
    vault = new Vault(':memory:');
    vault.seed(entries);
  });

  afterEach(() => {
    vault.close();
  });

  test('entries stored with correct tier', () => {
    const agent = vault.get('agent-1');
    expect(agent?.tier).toBe('agent');
    const project = vault.get('project-1');
    expect(project?.tier).toBe('project');
    const team = vault.get('team-1');
    expect(team?.tier).toBe('team');
  });

  test('tier can be updated via seed', () => {
    const entry = vault.get('agent-1')!;
    vault.seed([{ ...entry, tier: 'team' }]);
    expect(vault.get('agent-1')?.tier).toBe('team');
  });
});

// ─── Export / Import Pack ─────────────────────────────────────────────

describe('Vault export/import pack', () => {
  let vault: Vault;
  let importVault: Vault;

  const entries: IntelligenceEntry[] = [
    {
      id: 'exp-1',
      type: 'pattern',
      domain: 'design',
      title: 'Export Pattern 1',
      severity: 'suggestion',
      description: 'First exportable pattern',
      tags: ['export'],
      tier: 'team',
    },
    {
      id: 'exp-2',
      type: 'rule',
      domain: 'design',
      title: 'Export Rule 2',
      severity: 'warning',
      description: 'Second exportable rule',
      tags: ['export'],
      tier: 'project',
    },
  ];

  beforeEach(() => {
    vault = new Vault(':memory:');
    vault.seed(entries);
    importVault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
    importVault.close();
  });

  test('export all entries as bundles', () => {
    const { entries: exported } = vault.exportAll();
    expect(exported.length).toBe(2);
  });

  test('import with dedup skips duplicates (different IDs, same content)', () => {
    // seedDedup detects duplicates when content matches a *different* ID
    const dupes = entries.map((e) => ({ ...e, id: `dupe-${e.id}` }));
    const results = vault.seedDedup(dupes);
    // Content hashes match existing entries with different IDs → duplicate
    expect(results.every((r) => r.action === 'duplicate')).toBe(true);
    expect(results[0].existingId).toBe('exp-1');
  });

  test('import into fresh vault inserts all', () => {
    const results = importVault.seedDedup(entries);
    expect(results.filter((r) => r.action === 'inserted')).toHaveLength(2);
  });
});

// ─── Git Vault Sync Pull ──────────────────────────────────────────────

describe('GitVaultSync pull', () => {
  let vault: Vault;
  let repoDir: string;

  const entry: IntelligenceEntry = {
    id: 'git-entry-1',
    type: 'pattern',
    domain: 'testing',
    title: 'Git Pattern',
    severity: 'suggestion',
    description: 'A pattern from git',
    tags: ['git'],
  };

  beforeEach(() => {
    vault = new Vault(':memory:');
    repoDir = join(tmpdir(), 'git-vault-test-' + Date.now());
    mkdirSync(repoDir, { recursive: true });
  });

  afterEach(() => {
    vault.close();
    rmSync(repoDir, { recursive: true, force: true });
  });

  test('pull imports entries from git directory', async () => {
    // Write entry to git directory
    const domainDir = join(repoDir, entry.domain);
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(join(domainDir, `${entry.id}.json`), JSON.stringify(entry));

    const sync = new GitVaultSync({ repoDir, autoCommit: false });
    await sync.init();
    const result = await sync.pull(vault);

    expect(result.imported).toBe(1);
    expect(vault.get('git-entry-1')).not.toBeNull();
    expect(vault.get('git-entry-1')?.title).toBe('Git Pattern');
  });

  test('pull with vault conflict resolution skips existing', async () => {
    vault.seed([entry]);

    const domainDir = join(repoDir, entry.domain);
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(
      join(domainDir, `${entry.id}.json`),
      JSON.stringify({ ...entry, title: 'Updated from git' }),
    );

    const sync = new GitVaultSync({ repoDir, autoCommit: false });
    await sync.init();
    const result = await sync.pull(vault, { onConflict: 'vault' });

    expect(result.skipped).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(vault.get('git-entry-1')?.title).toBe('Git Pattern'); // Original kept
  });

  test('pull with git conflict resolution overwrites', async () => {
    vault.seed([entry]);

    const domainDir = join(repoDir, entry.domain);
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(
      join(domainDir, `${entry.id}.json`),
      JSON.stringify({ ...entry, title: 'Updated from git' }),
    );

    const sync = new GitVaultSync({ repoDir, autoCommit: false });
    await sync.init();
    const result = await sync.pull(vault, { onConflict: 'git' });

    expect(result.imported).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(vault.get('git-entry-1')?.title).toBe('Updated from git');
  });

  test('skips malformed JSON files', async () => {
    const domainDir = join(repoDir, 'bad');
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(join(domainDir, 'bad.json'), 'not json');

    const sync = new GitVaultSync({ repoDir, autoCommit: false });
    await sync.init();
    const result = await sync.pull(vault);

    expect(result.imported).toBe(0);
  });
});
