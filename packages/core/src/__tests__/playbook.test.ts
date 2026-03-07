import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../vault/vault.js';
import { validatePlaybook, parsePlaybookFromEntry } from '../vault/playbook.js';
import type { Playbook } from '../vault/playbook.js';
import type { IntelligenceEntry } from '../intelligence/types.js';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createSemanticFacades } from '../runtime/facades/index.js';
import type { AgentRuntime, OpDefinition } from '../runtime/types.js';

function makePlaybook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    id: overrides.id ?? 'pb-1',
    title: overrides.title ?? 'Deploy Checklist',
    domain: overrides.domain ?? 'ops',
    description: overrides.description ?? 'Standard deploy procedure.',
    steps: overrides.steps ?? [
      {
        order: 1,
        title: 'Run tests',
        description: 'Execute full test suite',
        validation: 'All tests pass',
      },
      { order: 2, title: 'Build', description: 'Run production build' },
      {
        order: 3,
        title: 'Deploy',
        description: 'Push to production',
        validation: 'Health check passes',
      },
    ],
    tags: overrides.tags ?? ['deploy', 'checklist'],
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}

function playbookToEntry(pb: Playbook): IntelligenceEntry {
  return {
    id: pb.id,
    type: 'playbook',
    domain: pb.domain,
    title: pb.title,
    severity: 'suggestion',
    description: pb.description,
    context: JSON.stringify({ steps: pb.steps }),
    tags: pb.tags,
  };
}

describe('validatePlaybook', () => {
  it('should pass for a valid playbook', () => {
    const result = validatePlaybook(makePlaybook());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail for empty title', () => {
    const result = validatePlaybook(makePlaybook({ title: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook title must not be empty');
  });

  it('should fail for no steps', () => {
    const result = validatePlaybook(makePlaybook({ steps: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Playbook must have at least one step');
  });

  it('should fail for non-sequential step orders', () => {
    const result = validatePlaybook(
      makePlaybook({
        steps: [
          { order: 1, title: 'Step A', description: 'Desc A' },
          { order: 3, title: 'Step B', description: 'Desc B' },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('order 3, expected 2'))).toBe(true);
  });
});

describe('parsePlaybookFromEntry', () => {
  it('should parse a valid playbook entry', () => {
    const pb = makePlaybook();
    const entry = playbookToEntry(pb);
    const parsed = parsePlaybookFromEntry(entry);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(pb.id);
    expect(parsed!.title).toBe(pb.title);
    expect(parsed!.steps).toHaveLength(3);
    expect(parsed!.steps[0].title).toBe('Run tests');
  });

  it('should return null for a non-playbook entry', () => {
    const entry: IntelligenceEntry = {
      id: 'pat-1',
      type: 'pattern',
      domain: 'testing',
      title: 'Some Pattern',
      severity: 'warning',
      description: 'A pattern.',
      tags: [],
    };
    expect(parsePlaybookFromEntry(entry)).toBeNull();
  });

  it('should return null for invalid context JSON', () => {
    const entry: IntelligenceEntry = {
      id: 'pb-bad',
      type: 'playbook',
      domain: 'ops',
      title: 'Bad Playbook',
      severity: 'suggestion',
      description: 'Has bad context.',
      context: 'not valid json',
      tags: [],
    };
    expect(parsePlaybookFromEntry(entry)).toBeNull();
  });

  it('should return null when context has no steps array', () => {
    const entry: IntelligenceEntry = {
      id: 'pb-nosteps',
      type: 'playbook',
      domain: 'ops',
      title: 'No Steps',
      severity: 'suggestion',
      description: 'Missing steps.',
      context: JSON.stringify({ something: 'else' }),
      tags: [],
    };
    expect(parsePlaybookFromEntry(entry)).toBeNull();
  });
});

describe('Vault playbook integration', () => {
  let vault: Vault;

  beforeEach(() => {
    vault = new Vault(':memory:');
  });

  afterEach(() => {
    vault.close();
  });

  it('should insert and retrieve a playbook via vault.list', () => {
    const pb = makePlaybook();
    const entry = playbookToEntry(pb);
    vault.seed([entry]);

    const results = vault.list({ type: 'playbook' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('pb-1');
    expect(results[0].type).toBe('playbook');
  });

  it('should find a playbook via FTS5 search', () => {
    const pb = makePlaybook({ title: 'Deploy Checklist Procedure' });
    const entry = playbookToEntry(pb);
    vault.seed([entry]);

    const results = vault.search('deploy checklist');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.id).toBe(pb.id);
  });
});

describe('playbook_create op', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'playbook-create-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createSemanticFacades(runtime, 'test').flatMap(f => f.ops);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should create a playbook and store it in the vault', async () => {
    const result = (await findOp('playbook_create').handler({
      title: 'PR Review',
      domain: 'engineering',
      description: 'Standard PR review procedure.',
      steps: [
        { title: 'Read diff', description: 'Review all changed files' },
        { title: 'Run tests', description: 'Ensure CI passes', validation: 'All green' },
        { title: 'Approve', description: 'Leave approval comment' },
      ],
      tags: ['review', 'pr'],
    })) as { created: boolean; id: string; steps: number };

    expect(result.created).toBe(true);
    expect(result.steps).toBe(3);

    // Verify it's in the vault
    const entry = runtime.vault.get(result.id);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('playbook');
    expect(entry!.domain).toBe('engineering');

    // Verify it parses back correctly
    const playbook = parsePlaybookFromEntry(entry!);
    expect(playbook).not.toBeNull();
    expect(playbook!.steps).toHaveLength(3);
    expect(playbook!.steps[0].order).toBe(1);
    expect(playbook!.steps[2].order).toBe(3);
  });

  it('should reject a playbook with empty steps', async () => {
    const result = (await findOp('playbook_create').handler({
      title: 'Empty',
      domain: 'test',
      description: 'No steps.',
      steps: [],
      tags: [],
    })) as { created: boolean; errors: string[] };

    expect(result.created).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject a playbook with empty title', async () => {
    const result = (await findOp('playbook_create').handler({
      title: '',
      domain: 'test',
      description: 'Has steps but no title.',
      steps: [{ title: 'Step 1', description: 'Do something' }],
      tags: [],
    })) as { created: boolean; errors: string[] };

    expect(result.created).toBe(false);
    expect(result.errors).toContain('Playbook title must not be empty');
  });

  it('should auto-generate ID when not provided', async () => {
    const result = (await findOp('playbook_create').handler({
      title: 'Auto ID Test',
      domain: 'test',
      description: 'Should get an auto ID.',
      steps: [{ title: 'Step', description: 'Do it' }],
      tags: [],
    })) as { created: boolean; id: string };

    expect(result.created).toBe(true);
    expect(result.id).toMatch(/^playbook-test-/);
  });

  it('should use provided ID when given', async () => {
    const result = (await findOp('playbook_create').handler({
      id: 'my-custom-id',
      title: 'Custom ID Test',
      domain: 'test',
      description: 'Has a custom ID.',
      steps: [{ title: 'Step', description: 'Do it' }],
      tags: [],
    })) as { created: boolean; id: string };

    expect(result.created).toBe(true);
    expect(result.id).toBe('my-custom-id');
  });
});

describe('playbook_match op', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'playbook-match-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createSemanticFacades(runtime, 'test').flatMap(f => f.ops);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should match TDD playbook for BUILD intent', async () => {
    const result = (await findOp('playbook_match').handler({
      intent: 'BUILD',
      text: 'implement a new feature',
    })) as { playbook: { label: string } | null; genericMatch?: { id: string } };

    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-tdd');
  });

  it('should match debugging playbook for FIX intent', async () => {
    const result = (await findOp('playbook_match').handler({
      intent: 'FIX',
      text: 'fix the broken bug',
    })) as { playbook: { label: string } | null; genericMatch?: { id: string } };

    expect(result.playbook).not.toBeNull();
    expect(result.genericMatch?.id).toBe('generic-systematic-debugging');
  });

  it('should return null playbook for unrelated text', async () => {
    const result = (await findOp('playbook_match').handler({
      text: 'random unrelated xyz',
    })) as { playbook: null };

    expect(result.playbook).toBeNull();
  });
});

describe('playbook_seed op', () => {
  let runtime: AgentRuntime;
  let ops: OpDefinition[];
  let plannerDir: string;

  function findOp(name: string): OpDefinition {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op "${name}" not found`);
    return op;
  }

  beforeEach(() => {
    plannerDir = join(tmpdir(), 'playbook-seed-test-' + Date.now());
    mkdirSync(plannerDir, { recursive: true });
    runtime = createAgentRuntime({
      agentId: 'test',
      vaultPath: ':memory:',
      plansPath: join(plannerDir, 'plans.json'),
    });
    ops = createSemanticFacades(runtime, 'test').flatMap(f => f.ops);
  });

  afterEach(() => {
    runtime.close();
    rmSync(plannerDir, { recursive: true, force: true });
  });

  it('should seed built-in playbooks', async () => {
    const result = (await findOp('playbook_seed').handler({})) as {
      seeded: number;
      skipped: number;
      errors: number;
    };

    expect(result.seeded).toBe(6);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should be idempotent', async () => {
    await findOp('playbook_seed').handler({});
    const result = (await findOp('playbook_seed').handler({})) as {
      seeded: number;
      skipped: number;
    };

    expect(result.seeded).toBe(0);
    expect(result.skipped).toBe(6);
  });
});
