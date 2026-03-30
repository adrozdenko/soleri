import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Curator } from '../curator/curator.js';
import { ensureDreamSchema } from './schema.js';
import { DreamEngine } from './dream-engine.js';
import { createDreamOps } from './dream-ops.js';
import type { AgentRuntime } from '../runtime/types.js';

describe('dream schema', () => {
  let vault: Vault;
  beforeEach(() => {
    vault = new Vault(':memory:');
  });
  afterEach(() => {
    vault.close();
  });

  it('creates dream_meta table', () => {
    ensureDreamSchema(vault.getProvider());
    const info = vault
      .getProvider()
      .get("SELECT name FROM sqlite_master WHERE type='table' AND name='dream_meta'");
    expect(info).toBeTruthy();
  });

  it('initializes single row with defaults', () => {
    ensureDreamSchema(vault.getProvider());
    const row = vault.getProvider().get('SELECT * FROM dream_meta WHERE id = 1') as Record<
      string,
      unknown
    >;
    expect(row.sessions_since_last_dream).toBe(0);
    expect(row.total_dreams).toBe(0);
    expect(row.last_dream_at).toBeNull();
  });
});

describe('DreamEngine', () => {
  let vault: Vault;
  let curator: Curator;
  let engine: DreamEngine;

  beforeEach(() => {
    vault = new Vault(':memory:');
    ensureDreamSchema(vault.getProvider());
    curator = new Curator(vault);
    engine = new DreamEngine(vault, curator);
  });
  afterEach(() => {
    vault.close();
  });

  it('run() returns a dream report', () => {
    const report = engine.run();
    expect(report).toHaveProperty('durationMs');
    expect(report).toHaveProperty('duplicatesFound');
    expect(report).toHaveProperty('staleArchived');
    expect(report).toHaveProperty('contradictionsFound');
    expect(report).toHaveProperty('totalDreams');
    expect(report.totalDreams).toBe(1);
  });

  it('run() resets sessions_since_last_dream to 0', () => {
    for (let i = 0; i < 5; i++) engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(5);
    engine.run();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(0);
  });

  it('incrementSessionCount increases counter', () => {
    expect(engine.getStatus().sessionsSinceLastDream).toBe(0);
    engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(1);
    engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(2);
  });

  it('getStatus returns current dream state', () => {
    const status = engine.getStatus();
    expect(status.sessionsSinceLastDream).toBe(0);
    expect(status.lastDreamAt).toBeNull();
    expect(status.totalDreams).toBe(0);
    expect(status.gateEligible).toBe(false);
  });

  describe('gate conditions', () => {
    it('not eligible with 0 sessions', () => {
      const gate = engine.checkGate();
      expect(gate.eligible).toBe(false);
      expect(gate.reason).toContain('0/5');
    });

    it('eligible after 5 sessions and no prior dream', () => {
      for (let i = 0; i < 5; i++) engine.incrementSessionCount();
      const gate = engine.checkGate();
      expect(gate.eligible).toBe(true);
    });

    it('not eligible if dreamed less than 24h ago', () => {
      for (let i = 0; i < 5; i++) engine.incrementSessionCount();
      engine.run();
      for (let i = 0; i < 5; i++) engine.incrementSessionCount();
      const gate = engine.checkGate();
      expect(gate.eligible).toBe(false);
      expect(gate.reason).toContain('h/24h');
    });

    it('force run works regardless of gate', () => {
      const gate = engine.checkGate();
      expect(gate.eligible).toBe(false);
      const report = engine.run();
      expect(report.totalDreams).toBe(1);
    });
  });
});

describe('dream ops', () => {
  let vault: Vault;
  let ops: ReturnType<typeof createDreamOps>;

  function findOp(name: string) {
    const op = ops.find((o) => o.name === name);
    if (!op) throw new Error(`Op ${name} not found`);
    return op;
  }

  beforeEach(() => {
    vault = new Vault(':memory:');
    const curator = new Curator(vault);
    const runtime = { vault, curator } as unknown as AgentRuntime;
    ops = createDreamOps(runtime);
  });
  afterEach(() => {
    vault.close();
  });

  it('creates 3 ops with correct names', () => {
    expect(ops).toHaveLength(3);
    expect(ops.map((o) => o.name).sort()).toEqual(
      ['dream_check_gate', 'dream_run', 'dream_status'].sort(),
    );
  });

  it('dream_status returns status', async () => {
    const result = (await findOp('dream_status').handler({})) as Record<string, unknown>;
    expect(result).toHaveProperty('sessionsSinceLastDream');
    expect(result).toHaveProperty('gateEligible');
    expect(result.sessionsSinceLastDream).toBe(0);
  });

  it('dream_check_gate returns gate info', async () => {
    const result = (await findOp('dream_check_gate').handler({})) as Record<string, unknown>;
    expect(result).toHaveProperty('eligible');
    expect(result).toHaveProperty('reason');
    expect(result.eligible).toBe(false);
  });

  it('dream_run skips when gate not met and force=false', async () => {
    const result = (await findOp('dream_run').handler({})) as Record<string, unknown>;
    expect(result.skipped).toBe(true);
    expect(result.reason).toBeDefined();
    expect(result.status).toBeDefined();
  });

  it('dream_run executes when force=true', async () => {
    const result = (await findOp('dream_run').handler({ force: true })) as Record<string, unknown>;
    expect(result.skipped).toBeUndefined();
    expect(result).toHaveProperty('durationMs');
    expect(result).toHaveProperty('totalDreams');
    expect(result.totalDreams).toBe(1);
  });

  it('dream_run executes when gate is met', async () => {
    // Increment sessions to meet threshold (default 5)
    const engine = new DreamEngine(vault, new Curator(vault));
    for (let i = 0; i < 5; i++) engine.incrementSessionCount();

    const result = (await findOp('dream_run').handler({})) as Record<string, unknown>;
    expect(result.skipped).toBeUndefined();
    expect(result).toHaveProperty('totalDreams');
  });
});
