import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { Curator } from '../curator/curator.js';
import { ensureDreamSchema } from './schema.js';
import { DreamEngine } from './dream-engine.js';

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
