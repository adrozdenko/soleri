# /dream Skill — Automatic Memory Consolidation

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add a `/dream` skill that consolidates vault memory — manually on demand or automatically every ~24h after 5+ sessions — inspired by Claude Code's AutoDream.

**Architecture:** New `dream-ops.ts` runtime module adds 3 ops (`dream_run`, `dream_status`, `dream_check_gate`) backed by a `dream_meta` SQLite table. The `session_start` op gets a hook to increment the session counter and auto-trigger when gate conditions are met. A new skill file orchestrates existing curator/archive/brain ops in sequence and produces a summary report.

**Tech Stack:** TypeScript, SQLite (via existing `DbProvider`), Zod schemas, Vitest for tests.

**GitHub Issue:** adrozdenko/soleri#515

---

## Scope

| Included | Excluded |
|----------|----------|
| `dream_meta` SQLite table + migration | Relative-date-in-text normalization (follow-up) |
| `dream_run` op — full consolidation pass | Changes to curator.consolidate() internals |
| `dream_status` op — last dream, sessions since | New UI/dashboard views |
| `dream_check_gate` op — evaluate trigger conditions | Cross-agent dream sync |
| Session counter increment on `session_start` | Pipeline runner integration (already exists) |
| `/dream` skill file for Ernesto | Changes to brain scoring weights |
| Auto-trigger on session start when gate met | |
| Tests for all new ops | |

---

## Task Breakdown

### Task 1: Create `dream_meta` SQLite table

**Files:**
- Create: `packages/core/src/dream/schema.ts`

**Steps:**

1. Write failing test — schema creation

```typescript
// packages/core/src/dream/dream.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/test-helpers';
import { ensureDreamSchema } from './schema';

describe('dream schema', () => {
  it('creates dream_meta table', () => {
    const db = createTestDb();
    ensureDreamSchema(db);
    const info = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dream_meta'").get();
    expect(info).toBeTruthy();
  });
});
```

1. Verify test fails (module not found)

1. Implement schema

```typescript
// packages/core/src/dream/schema.ts
import type { DbProvider } from '../db/types';

export function ensureDreamSchema(db: DbProvider): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sessions_since_last_dream INTEGER NOT NULL DEFAULT 0,
      last_dream_at TEXT,
      last_dream_duration_ms INTEGER,
      last_dream_report TEXT,
      total_dreams INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO dream_meta (id) VALUES (1);
  `);
}
```

> **Design note:** Single-row table (id=1) — there's only one dream state per vault. Same pattern as `brain_metadata`.

1. Verify test passes

1. Commit: `feat(dream): add dream_meta schema`

---

### Task 2: Create `DreamEngine` class with `run()` method

**Files:**
- Create: `packages/core/src/dream/dream-engine.ts`
- Modify: `packages/core/src/dream/dream.test.ts`

**Steps:**

1. Write failing test — dream run returns report

```typescript
// append to dream.test.ts
import { DreamEngine } from './dream-engine';
import { Curator } from '../curator/curator';

describe('DreamEngine', () => {
  let engine: DreamEngine;

  beforeEach(() => {
    const db = createTestDb();
    ensureDreamSchema(db);
    const curator = new Curator(db); // uses test db
    engine = new DreamEngine(db, curator);
  });

  it('run() returns a dream report', async () => {
    const report = await engine.run();
    expect(report).toHaveProperty('durationMs');
    expect(report).toHaveProperty('duplicatesFound');
    expect(report).toHaveProperty('staleArchived');
    expect(report).toHaveProperty('contradictionsFound');
    expect(report).toHaveProperty('totalDreams');
    expect(report.totalDreams).toBe(1);
  });

  it('run() resets sessions_since_last_dream to 0', async () => {
    // Simulate 5 sessions
    engine.incrementSessionCount();
    engine.incrementSessionCount();
    engine.incrementSessionCount();
    engine.incrementSessionCount();
    engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(5);

    await engine.run();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(0);
  });
});
```

1. Verify test fails

1. Implement DreamEngine

```typescript
// packages/core/src/dream/dream-engine.ts
import type { DbProvider } from '../db/types';
import type { Curator } from '../curator/curator';

export interface DreamReport {
  durationMs: number;
  duplicatesFound: number;
  staleArchived: number;
  contradictionsFound: number;
  totalDreams: number;
  timestamp: string;
}

export interface DreamStatus {
  sessionsSinceLastDream: number;
  lastDreamAt: string | null;
  lastDreamDurationMs: number | null;
  totalDreams: number;
  gateEligible: boolean;
}

export class DreamEngine {
  constructor(
    private db: DbProvider,
    private curator: Curator,
    private sessionThreshold: number = 5,
    private hourThreshold: number = 24,
  ) {}

  async run(): Promise<DreamReport> {
    const start = Date.now();

    // Run full consolidation (not dry-run)
    const result = this.curator.consolidate({
      dryRun: false,
      staleDaysThreshold: 90,
      duplicateThreshold: 0.45,
      contradictionThreshold: 0.4,
    });

    const durationMs = Date.now() - start;
    const now = new Date().toISOString();

    // Update dream metadata
    this.db.run(
      `UPDATE dream_meta SET
        sessions_since_last_dream = 0,
        last_dream_at = ?,
        last_dream_duration_ms = ?,
        last_dream_report = ?,
        total_dreams = total_dreams + 1,
        updated_at = ?
      WHERE id = 1`,
      [now, durationMs, JSON.stringify(result), now],
    );

    const meta = this.getMeta();

    return {
      durationMs,
      duplicatesFound: result.duplicates?.length ?? 0,
      staleArchived: result.staleEntries?.length ?? 0,
      contradictionsFound: result.contradictions?.length ?? 0,
      totalDreams: meta.total_dreams,
      timestamp: now,
    };
  }

  incrementSessionCount(): void {
    this.db.run(
      `UPDATE dream_meta SET sessions_since_last_dream = sessions_since_last_dream + 1, updated_at = datetime('now') WHERE id = 1`,
    );
  }

  getStatus(): DreamStatus {
    const meta = this.getMeta();
    return {
      sessionsSinceLastDream: meta.sessions_since_last_dream,
      lastDreamAt: meta.last_dream_at,
      lastDreamDurationMs: meta.last_dream_duration_ms,
      totalDreams: meta.total_dreams,
      gateEligible: this.isGateEligible(meta),
    };
  }

  checkGate(): { eligible: boolean; reason: string } {
    const meta = this.getMeta();
    if (meta.sessions_since_last_dream < this.sessionThreshold) {
      return { eligible: false, reason: `Only ${meta.sessions_since_last_dream}/${this.sessionThreshold} sessions since last dream` };
    }
    if (meta.last_dream_at) {
      const hoursSince = (Date.now() - new Date(meta.last_dream_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < this.hourThreshold) {
        return { eligible: false, reason: `Only ${Math.round(hoursSince)}h/${this.hourThreshold}h since last dream` };
      }
    }
    return { eligible: true, reason: 'Gate conditions met' };
  }

  private isGateEligible(meta: any): boolean {
    if (meta.sessions_since_last_dream < this.sessionThreshold) return false;
    if (!meta.last_dream_at) return true; // Never dreamed — eligible
    const hoursSince = (Date.now() - new Date(meta.last_dream_at).getTime()) / (1000 * 60 * 60);
    return hoursSince >= this.hourThreshold;
  }

  private getMeta(): any {
    return this.db.prepare('SELECT * FROM dream_meta WHERE id = 1').get();
  }
}
```

1. Verify tests pass

1. Commit: `feat(dream): add DreamEngine with run, gate, status`

---

### Task 3: Create dream runtime ops

**Files:**
- Create: `packages/core/src/dream/dream-ops.ts`
- Modify: `packages/core/src/dream/dream.test.ts`

**Steps:**

1. Write failing test — ops return expected shapes

```typescript
// append to dream.test.ts
import { createDreamOps } from './dream-ops';

describe('dream ops', () => {
  it('exports dream_run, dream_status, dream_check_gate ops', () => {
    const db = createTestDb();
    ensureDreamSchema(db);
    const curator = new Curator(db);
    const ops = createDreamOps(db, curator);
    const names = ops.map(op => op.name);
    expect(names).toContain('dream_run');
    expect(names).toContain('dream_status');
    expect(names).toContain('dream_check_gate');
  });
});
```

1. Verify test fails

1. Implement ops factory

```typescript
// packages/core/src/dream/dream-ops.ts
import { z } from 'zod';
import type { DbProvider } from '../db/types';
import type { Curator } from '../curator/curator';
import type { OpDefinition } from '../runtime/types';
import { DreamEngine } from './dream-engine';
import { ensureDreamSchema } from './schema';

export function createDreamOps(db: DbProvider, curator: Curator): OpDefinition[] {
  ensureDreamSchema(db);
  const engine = new DreamEngine(db, curator);

  return [
    {
      name: 'dream_run',
      description: 'Run a full dream pass — consolidate vault memory: dedup, archive stale, resolve contradictions. Returns a dream report.',
      auth: 'write' as const,
      schema: z.object({
        force: z.boolean().optional().default(false).describe('Bypass gate check and run immediately'),
      }),
      handler: async (params) => {
        if (!params.force) {
          const gate = engine.checkGate();
          if (!gate.eligible) {
            return { skipped: true, reason: gate.reason, status: engine.getStatus() };
          }
        }
        return engine.run();
      },
    },
    {
      name: 'dream_status',
      description: 'Show dream state: last dream timestamp, sessions since, next eligible trigger.',
      auth: 'read' as const,
      schema: z.object({}),
      handler: async () => engine.getStatus(),
    },
    {
      name: 'dream_check_gate',
      description: 'Check if auto-dream trigger conditions are met (5+ sessions AND 24+ hours since last dream).',
      auth: 'read' as const,
      schema: z.object({}),
      handler: async () => engine.checkGate(),
    },
  ];
}

export { DreamEngine, ensureDreamSchema };
```

1. Verify tests pass

1. Commit: `feat(dream): add dream runtime ops`

---

### Task 4: Register dream ops in facade index

**Files:**
- Modify: `packages/core/src/runtime/facades/index.ts`
- Create: `packages/core/src/dream/index.ts` (barrel export)

**Steps:**

1. Create barrel export

```typescript
// packages/core/src/dream/index.ts
export { DreamEngine } from './dream-engine';
export { ensureDreamSchema } from './schema';
export { createDreamOps } from './dream-ops';
```

1. Add dream facade to `createSemanticFacades()` in `facades/index.ts`

```typescript
// In the facades array, add:
{
  name: `${agentId}_dream`,
  description: 'Dream — automatic memory consolidation, vault cleanup, and maintenance scheduling.',
  ops: createDreamOps(runtime.db, runtime.curator),
},
```

1. Add import at top of `facades/index.ts`:

```typescript
import { createDreamOps } from '../../dream/dream-ops';
```

1. Verify build passes

1. Commit: `feat(dream): register dream facade in runtime`

---

### Task 5: Hook session_start to increment dream counter

**Files:**
- Modify: `packages/core/src/runtime/facades/orchestrate-facade.ts`
- Modify: `packages/core/src/dream/dream.test.ts`

**Steps:**

1. Write failing test — session start increments counter

```typescript
describe('session_start integration', () => {
  it('incrementSessionCount increases counter', () => {
    const db = createTestDb();
    ensureDreamSchema(db);
    const curator = new Curator(db);
    const engine = new DreamEngine(db, curator);

    expect(engine.getStatus().sessionsSinceLastDream).toBe(0);
    engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(1);
    engine.incrementSessionCount();
    expect(engine.getStatus().sessionsSinceLastDream).toBe(2);
  });
});
```

1. Verify test passes (already implemented in Task 2)

1. Modify `session_start` handler in `orchestrate-facade.ts` to call `engine.incrementSessionCount()` and `engine.checkGate()`:

```typescript
// Inside session_start handler, after project registration:
const dreamEngine = runtime.dreamEngine; // added to runtime
if (dreamEngine) {
  dreamEngine.incrementSessionCount();
  const gate = dreamEngine.checkGate();
  if (gate.eligible) {
    // Auto-dream in background — best-effort
    dreamEngine.run().catch(() => { /* silent */ });
  }
}
```

1. Add `dreamEngine` to `AgentRuntime` interface:

```typescript
// In packages/core/src/runtime/types.ts, add to AgentRuntime:
dreamEngine?: DreamEngine;
```

1. Initialize `DreamEngine` in runtime factory (where curator is created):

```typescript
// In the runtime factory function:
import { DreamEngine, ensureDreamSchema } from '../dream';
ensureDreamSchema(db);
const dreamEngine = new DreamEngine(db, curator);
```

1. Verify build passes, run tests

1. Commit: `feat(dream): hook session_start to auto-trigger dream`

---

### Task 6: Write gate condition tests

**Files:**
- Modify: `packages/core/src/dream/dream.test.ts`

**Steps:**

1. Write gate tests

```typescript
describe('dream gate', () => {
  let engine: DreamEngine;
  let db: DbProvider;

  beforeEach(() => {
    db = createTestDb();
    ensureDreamSchema(db);
    const curator = new Curator(db);
    engine = new DreamEngine(db, curator);
  });

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

  it('not eligible if dreamed less than 24h ago', async () => {
    for (let i = 0; i < 5; i++) engine.incrementSessionCount();
    await engine.run(); // dream now

    // Simulate 5 more sessions
    for (let i = 0; i < 5; i++) engine.incrementSessionCount();
    const gate = engine.checkGate();
    expect(gate.eligible).toBe(false);
    expect(gate.reason).toContain('h/24h');
  });

  it('dream_run with force=true bypasses gate', async () => {
    // 0 sessions, should be gated
    const gate = engine.checkGate();
    expect(gate.eligible).toBe(false);

    // Force run anyway
    const report = await engine.run();
    expect(report.totalDreams).toBe(1);
  });
});
```

1. Verify all tests pass

1. Commit: `test(dream): add gate condition tests`

---

### Task 7: Create `/dream` skill file

**Files:**
- Create: `skills/dream/SKILL.md` (in both `~/projects/soleri/packages/forge/src/skills/` template AND `~/projects/ernesto/skills/`)

**Steps:**

1. Write skill definition

```markdown
---
name: dream
description: >
  Use when the user says "dream", "consolidate memory", "clean up memory",
  "vault maintenance", "memory cleanup", or wants to run automatic memory
  consolidation. Also triggers on "dream status", "when was last dream".
---

# /dream — Automatic Memory Consolidation

Runs a full "dream" pass over the vault: dedup, archive stale entries, resolve
contradictions, and produce a summary report. Inspired by how REM sleep
consolidates biological memory.

## Quick Commands

| Command | What it does |
|---------|-------------|
| `/dream` | Run dream if gate allows, force if not eligible |
| `/dream status` | Show dream state |

## Orchestration

### Step 1: Check Dream Status

```
ernesto_dream op:dream_status
```

Report current state to user: sessions since last dream, last dream timestamp,
gate eligibility.

### Step 2: Run Dream

If user explicitly asked to dream, force it regardless of gate:

```
ernesto_dream op:dream_run
  params: { force: true }
```

If auto-triggered (session start), respect the gate:

```
ernesto_dream op:dream_run
  params: { force: false }
```

### Step 3: Present Report

Format the dream report as a table:

| Metric | Value |
|--------|-------|
| **Duration** | {durationMs}ms |
| **Duplicates found** | {duplicatesFound} |
| **Stale entries archived** | {staleArchived} |
| **Contradictions found** | {contradictionsFound} |
| **Total dreams** | {totalDreams} |
| **Timestamp** | {timestamp} |

### Step 4: Capture to Memory

```
ernesto_memory op:session_capture
  params: { summary: "Dream pass completed: {duplicatesFound} dupes, {staleArchived} stale archived, {contradictionsFound} contradictions" }
```

## Gate Logic

Auto-dream triggers when BOTH conditions are met:
- **5+ sessions** since last dream
- **24+ hours** since last dream

Manual `/dream` always runs (force=true).
```

1. Copy to Ernesto skills directory

1. Commit: `feat(dream): add /dream skill definition`

---

### Task 8: Add barrel export and update package index

**Files:**
- Modify: `packages/core/src/index.ts` (add dream exports)

**Steps:**

1. Add to package barrel:

```typescript
export { DreamEngine, ensureDreamSchema, createDreamOps } from './dream';
```

1. Verify build passes: `npm run build`

1. Run full test suite: `npm test`

1. Commit: `feat(dream): export dream module from core package`

---

## Dependency Graph

```
Task 1 (schema) ──► Task 2 (engine) ──► Task 3 (ops) ──► Task 4 (facade registration)
                                                                    │
                                                    Task 5 (session_start hook)
                                                                    │
                                                    Task 6 (gate tests)
                                                                    │
                                                    Task 7 (skill file)
                                                                    │
                                                    Task 8 (barrel export + final build)
```

Tasks 1-4 are sequential (each depends on the previous).
Tasks 5-8 are sequential (each depends on the previous).
Tasks 1-4 must complete before Task 5.

## Parallel Execution Opportunities

- Task 7 (skill file) could run in parallel with Tasks 5-6 since it's just a markdown file
- But keeping sequential ensures the skill references ops that actually exist

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| curator.consolidate() is slow on large vaults | Already batched; dream runs best-effort in background |
| Auto-dream during session_start adds latency | Runs async (fire-and-forget), doesn't block session |
| dream_meta table conflicts with future schema changes | Single-row table is minimal; easy to migrate |
| Gate time check unreliable across timezones | Uses ISO timestamps from SQLite `datetime('now')` — UTC |
