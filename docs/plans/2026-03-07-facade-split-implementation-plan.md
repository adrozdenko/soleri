# Facade Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the mega-core facade (209+ ops in one MCP tool) into 10 semantic facades matching Salvador's architecture.

**Architecture:** Create `packages/core/src/runtime/facades/` with one builder function per semantic domain. Each returns `OpDefinition[]`. An index module assembles all 10 into `FacadeConfig[]`. The forge entry-point template registers these instead of the old single mega-facade.

**Tech Stack:** TypeScript, Zod (schemas), @modelcontextprotocol/sdk, vitest

---

## Task 1: Create vault-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/vault-facade.ts`

**Step 1: Create the vault facade builder**

This file collects all vault-related ops: the 4 inline vault ops from core-ops.ts (`search`, `vault_stats`, `list_all`, `export`), plus `capture_enriched` (line 843-960 of core-ops.ts), plus satellite modules `createVaultExtraOps`, `createCaptureOps`, and `createIntakeOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { IntelligenceEntry } from '../../intelligence/types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultExtraOps } from '../vault-extra-ops.js';
import { createCaptureOps } from '../capture-ops.js';
import { createIntakeOps } from '../intake-ops.js';

export function createVaultFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, brain, cognee, llmClient, syncManager, intakePipeline } = runtime;

  return [
    // search, vault_stats, list_all, export — moved from core-ops.ts lines 62-279
    // capture_enriched — moved from core-ops.ts lines 843-960
    // ... (exact code from core-ops.ts, no changes)

    ...createVaultExtraOps(runtime),
    ...createCaptureOps(runtime),
    ...createIntakeOps(intakePipeline),
  ];
}
```

Move the following inline ops verbatim from `core-ops.ts`:

- `search` (lines 63-85)
- `vault_stats` (lines 86-91)
- `list_all` (lines 93-113)
- `export` (lines 255-279)
- `capture_enriched` (lines 843-960)

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/vault-facade.ts
git commit -m "feat(core): add vault-facade.ts — vault ops builder (#167)"
```

---

## Task 2: Create plan-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/plan-facade.ts`

**Step 1: Create the plan facade builder**

Collects: 5 inline planning ops (`create_plan`, `get_plan`, `approve_plan`, `update_task`, `complete_plan` — lines 282-378), plus `createPlanningExtraOps` and `createGradingOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createPlanningExtraOps } from '../planning-extra-ops.js';
import { createGradingOps } from '../grading-ops.js';

export function createPlanFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { planner } = runtime;

  return [
    // create_plan, get_plan, approve_plan, update_task, complete_plan
    // ... (exact code from core-ops.ts lines 282-378)

    ...createPlanningExtraOps(runtime),
    ...createGradingOps(runtime),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/plan-facade.ts
git commit -m "feat(core): add plan-facade.ts — planning ops builder (#167)"
```

---

## Task 3: Create brain-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/brain-facade.ts`

**Step 1: Create the brain facade builder**

Collects all brain + brain intelligence inline ops (lines 380-696): `record_feedback`, `brain_feedback`, `brain_feedback_stats`, `rebuild_vocabulary`, `brain_stats`, `brain_decay_report`, `llm_status`, `brain_session_context`, `brain_strengths`, `brain_global_patterns`, `brain_recommend`, `brain_build_intelligence`, `brain_export`, `brain_import`, `brain_extract_knowledge`, `brain_archive_sessions`, `brain_promote_proposals`, `brain_lifecycle`, `brain_reset_extracted`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

export function createBrainFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { brain, brainIntelligence, llmClient, keyPool, governance } = runtime;

  return [
    // All 19 brain ops moved verbatim from core-ops.ts lines 380-696
  ];
}
```

Note: `llm_status` goes here because it's about brain/LLM introspection. `llm_rotate` and `llm_call` go to admin (infrastructure).

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/brain-facade.ts
git commit -m "feat(core): add brain-facade.ts — brain/intelligence ops builder (#167)"
```

---

## Task 4: Create memory-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/memory-facade.ts`

**Step 1: Create the memory facade builder**

Collects: 4 inline memory ops (`memory_search`, `memory_capture`, `memory_list`, `session_capture` — lines 160-252), plus `createMemoryExtraOps` and `createMemoryCrossProjectOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createMemoryExtraOps } from '../memory-extra-ops.js';
import { createMemoryCrossProjectOps } from '../memory-cross-project-ops.js';

export function createMemoryFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault } = runtime;

  return [
    // memory_search, memory_capture, memory_list, session_capture
    // ... (exact code from core-ops.ts lines 160-252)

    ...createMemoryExtraOps(runtime),
    ...createMemoryCrossProjectOps(runtime),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/memory-facade.ts
git commit -m "feat(core): add memory-facade.ts — memory ops builder (#167)"
```

---

## Task 5: Create admin-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/admin-facade.ts`

**Step 1: Create the admin facade builder**

Collects: 2 inline LLM ops (`llm_rotate`, `llm_call` — lines 962-1013), 2 inline prompt ops (`render_prompt`, `list_templates` — lines 1415-1441), plus `createAdminOps` and `createAdminExtraOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createAdminOps } from '../admin-ops.js';
import { createAdminExtraOps } from '../admin-extra-ops.js';

export function createAdminFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { llmClient, keyPool, templateManager } = runtime;

  return [
    // llm_rotate, llm_call — from core-ops.ts lines 962-1013
    // render_prompt, list_templates — from core-ops.ts lines 1415-1441
    // ... (exact code)

    ...createAdminOps(runtime),
    ...createAdminExtraOps(runtime),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/admin-facade.ts
git commit -m "feat(core): add admin-facade.ts — admin/infra ops builder (#167)"
```

---

## Task 6: Create curator-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/curator-facade.ts`

**Step 1: Create the curator facade builder**

Collects: 8 inline curator ops (`curator_status`, `curator_detect_duplicates`, `curator_contradictions`, `curator_resolve_contradiction`, `curator_groom`, `curator_groom_all`, `curator_consolidate`, `curator_health_audit` — lines 1014-1128), plus `createCuratorExtraOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createCuratorExtraOps } from '../curator-extra-ops.js';

export function createCuratorFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { curator, vault, llmClient } = runtime;

  return [
    // 8 inline curator ops from core-ops.ts lines 1014-1128
    // ... (exact code)

    ...createCuratorExtraOps(runtime),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/curator-facade.ts
git commit -m "feat(core): add curator-facade.ts — quality ops builder (#167)"
```

---

## Task 7: Create loop-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/loop-facade.ts`

**Step 1: Create the loop facade builder**

This is a thin wrapper — just re-exports `createLoopOps`.

```typescript
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createLoopOps } from '../loop-ops.js';

export function createLoopFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  return createLoopOps(runtime);
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/loop-facade.ts
git commit -m "feat(core): add loop-facade.ts — loop ops builder (#167)"
```

---

## Task 8: Create orchestrate-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/orchestrate-facade.ts`

**Step 1: Create the orchestrate facade builder**

Collects: the `register` inline op (lines 116-157), plus `createOrchestrateOps`, `createProjectOps`, and `createPlaybookOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createOrchestrateOps } from '../orchestrate-ops.js';
import { createProjectOps } from '../project-ops.js';
import { createPlaybookOps } from '../playbook-ops.js';

export function createOrchestrateFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { vault, governance, projectRegistry } = runtime;

  return [
    // register — from core-ops.ts lines 116-157
    // ... (exact code)

    ...createOrchestrateOps(runtime),
    ...createProjectOps(runtime),
    ...createPlaybookOps(runtime),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/orchestrate-facade.ts
git commit -m "feat(core): add orchestrate-facade.ts — orchestration ops builder (#167)"
```

---

## Task 9: Create control-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/control-facade.ts`

**Step 1: Create the control facade builder**

Collects: 8 inline control ops (`get_identity`, `update_identity`, `add_guideline`, `remove_guideline`, `rollback_identity`, `route_intent`, `morph`, `get_behavior_rules` — lines 1128-1252) and 5 inline governance ops (`governance_policy`, `governance_proposals`, `governance_stats`, `governance_expire`, `governance_dashboard` — lines 1253-1389).

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import type { GuidelineCategory, OperationalMode } from '../../control/types.js';
import type { PolicyType, PolicyPreset } from '../../governance/types.js';

export function createControlFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { identityManager, intentRouter, governance } = runtime;

  return [
    // 8 control ops from core-ops.ts lines 1128-1252
    // 5 governance ops from core-ops.ts lines 1253-1389
    // ... (exact code)
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/control-facade.ts
git commit -m "feat(core): add control-facade.ts — identity/governance ops builder (#167)"
```

---

## Task 10: Create cognee-facade.ts

**Files:**

- Create: `packages/core/src/runtime/facades/cognee-facade.ts`

**Step 1: Create the cognee facade builder**

Collects: 8 inline cognee ops (`cognee_status`, `cognee_search`, `cognee_add`, `cognee_cognify`, `cognee_config`, `cognee_get_node`, `cognee_graph_stats`, `cognee_export_status` — lines 698-839), plus `createCogneeSyncOps`.

```typescript
import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import type { CogneeSearchType } from '../../cognee/types.js';
import { createCogneeSyncOps } from '../cognee-sync-ops.js';

export function createCogneeFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { cognee, syncManager } = runtime;

  return [
    // 8 cognee ops from core-ops.ts lines 698-839
    // ... (exact code)

    ...createCogneeSyncOps(syncManager),
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/cognee-facade.ts
git commit -m "feat(core): add cognee-facade.ts — knowledge graph ops builder (#167)"
```

---

## Task 11: Create facades/index.ts — the assembler

**Files:**

- Create: `packages/core/src/runtime/facades/index.ts`

**Step 1: Create the index module**

```typescript
import type { FacadeConfig } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createVaultFacadeOps } from './vault-facade.js';
import { createPlanFacadeOps } from './plan-facade.js';
import { createBrainFacadeOps } from './brain-facade.js';
import { createMemoryFacadeOps } from './memory-facade.js';
import { createAdminFacadeOps } from './admin-facade.js';
import { createCuratorFacadeOps } from './curator-facade.js';
import { createLoopFacadeOps } from './loop-facade.js';
import { createOrchestrateFacadeOps } from './orchestrate-facade.js';
import { createControlFacadeOps } from './control-facade.js';
import { createCogneeFacadeOps } from './cognee-facade.js';

/**
 * Create 10 semantic facades matching Salvador's engine-level architecture.
 * Each facade becomes its own MCP tool with op dispatch.
 */
export function createSemanticFacades(runtime: AgentRuntime, agentId: string): FacadeConfig[] {
  return [
    {
      name: `${agentId}_vault`,
      description: 'Knowledge management — search, CRUD, import/export, intake, archival.',
      ops: createVaultFacadeOps(runtime),
    },
    {
      name: `${agentId}_plan`,
      description: 'Plan lifecycle — create, approve, execute, reconcile, complete, grading.',
      ops: createPlanFacadeOps(runtime),
    },
    {
      name: `${agentId}_brain`,
      description: 'Learning system — intelligence pipeline, strengths, feedback, sessions.',
      ops: createBrainFacadeOps(runtime),
    },
    {
      name: `${agentId}_memory`,
      description: 'Session & cross-project memory — capture, search, dedup, promote.',
      ops: createMemoryFacadeOps(runtime),
    },
    {
      name: `${agentId}_admin`,
      description: 'Infrastructure — health, config, telemetry, tokens, LLM, prompts.',
      ops: createAdminFacadeOps(runtime),
    },
    {
      name: `${agentId}_curator`,
      description: 'Quality — duplicate detection, contradictions, grooming, health audit.',
      ops: createCuratorFacadeOps(runtime),
    },
    {
      name: `${agentId}_loop`,
      description: 'Iterative validation loops — start, iterate, cancel, complete, history.',
      ops: createLoopFacadeOps(runtime),
    },
    {
      name: `${agentId}_orchestrate`,
      description: 'Execution orchestration — project registration, playbooks, plan/execute/complete.',
      ops: createOrchestrateFacadeOps(runtime),
    },
    {
      name: `${agentId}_control`,
      description: 'Agent behavior — identity, intent routing, morphing, guidelines, governance.',
      ops: createControlFacadeOps(runtime),
    },
    {
      name: `${agentId}_cognee`,
      description: 'Knowledge graph — Cognee search, sync, export, graph stats.',
      ops: createCogneeFacadeOps(runtime),
    },
  ];
}
```

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/runtime/facades/index.ts
git commit -m "feat(core): add facades/index.ts — createSemanticFacades assembler (#167)"
```

---

## Task 12: Update core/src/index.ts exports

**Files:**

- Modify: `packages/core/src/index.ts`

**Step 1: Replace createCoreOps export with createSemanticFacades**

Change line 288:

```typescript
// Before:
export { createCoreOps } from './runtime/core-ops.js';

// After:
export { createSemanticFacades } from './runtime/facades/index.js';
```

Also remove the now-unnecessary individual satellite op exports (lines 290-303) since they're internal to facades now. Keep `createDomainFacade` and `createDomainFacades`.

Keep `AgentRuntime` and `AgentRuntimeConfig` exports.

**Step 2: Verify it compiles**

Run: `cd packages/core && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "refactor(core): export createSemanticFacades, remove createCoreOps (#167)"
```

---

## Task 13: Update entry-point.ts template

**Files:**

- Modify: `packages/forge/src/templates/entry-point.ts`

**Step 1: Update imports and facade assembly**

Change the import (line 20-27):

```typescript
// Before:
import {
  createAgentRuntime,
  createCoreOps,
  createDomainFacades,
  registerAllFacades,
  seedDefaultPlaybooks,
} from '@soleri/core';

// After:
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  registerAllFacades,
  seedDefaultPlaybooks,
} from '@soleri/core';
```

Change the facade assembly (lines 203-209):

```typescript
// Before:
const coreOps = createCoreOps(runtime);
const coreFacade = {
  name: '${config.id}_core',
  description: 'Core operations — vault stats, cross-domain search, health check, identity, and activation system.',
  ops: [...coreOps, ...agentOps],
};

// After:
const semanticFacades = createSemanticFacades(runtime, '${config.id}');
const agentFacade = {
  name: '${config.id}_core',
  description: 'Agent-specific operations — health, identity, activation, CLAUDE.md injection, setup.',
  ops: agentOps,
};
```

Change the facades array (line 223):

```typescript
// Before:
const facades = [coreFacade, ...domainFacades];

// After:
const facades = [...semanticFacades, agentFacade, ...domainFacades];
```

**Step 2: Verify forge compiles**

Run: `cd packages/forge && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/forge/src/templates/entry-point.ts
git commit -m "feat(forge): update entry-point template to use semantic facades (#167)"
```

---

## Task 14: Update test-facades.ts template

**Files:**

- Modify: `packages/forge/src/templates/test-facades.ts`

**Step 1: Update imports**

```typescript
// Before:
import {
  createAgentRuntime,
  createCoreOps,
  createDomainFacade,
} from '@soleri/core';

// After:
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacade,
} from '@soleri/core';
```

**Step 2: Replace the single core describe block with per-facade tests**

Replace the `describe('${config.id}_core', ...)` block (lines 60-541) with:

```typescript
  describe('semantic facades', () => {
    function buildSemanticFacades(): FacadeConfig[] {
      return createSemanticFacades(runtime, '${config.id}');
    }

    it('should create 10 semantic facades', () => {
      const facades = buildSemanticFacades();
      expect(facades).toHaveLength(10);
      const names = facades.map(f => f.name);
      expect(names).toContain('${config.id}_vault');
      expect(names).toContain('${config.id}_plan');
      expect(names).toContain('${config.id}_brain');
      expect(names).toContain('${config.id}_memory');
      expect(names).toContain('${config.id}_admin');
      expect(names).toContain('${config.id}_curator');
      expect(names).toContain('${config.id}_loop');
      expect(names).toContain('${config.id}_orchestrate');
      expect(names).toContain('${config.id}_control');
      expect(names).toContain('${config.id}_cognee');
    });

    it('total ops across all facades should be 209', () => {
      const facades = buildSemanticFacades();
      const totalOps = facades.reduce((sum, f) => sum + f.ops.length, 0);
      expect(totalOps).toBe(209);
    });
  });

  describe('${config.id}_vault', () => {
    function getFacade(): FacadeConfig {
      return createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
    }

    it('should contain vault ops', () => {
      const opNames = getFacade().ops.map(o => o.name);
      expect(opNames).toContain('search');
      expect(opNames).toContain('vault_stats');
      expect(opNames).toContain('list_all');
      expect(opNames).toContain('export');
      expect(opNames).toContain('vault_get');
      expect(opNames).toContain('vault_import');
      expect(opNames).toContain('capture_knowledge');
      expect(opNames).toContain('intake_ingest_book');
    });

    it('search should query across all domains', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      runtime = createAgentRuntime({ agentId: '${config.id}', vaultPath: ':memory:', plansPath: join(plannerDir, 'plans2.json') });
      runtime.vault.seed([
        makeEntry({ id: 'c1', domain: 'alpha', title: 'Alpha pattern', tags: ['a'] }),
        makeEntry({ id: 'c2', domain: 'beta', title: 'Beta pattern', tags: ['b'] }),
      ]);
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
      const searchOp = facade.ops.find(o => o.name === 'search')!;
      const results = (await searchOp.handler({ query: 'pattern' })) as Array<{ entry: unknown; score: number }>;
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });

    it('vault_stats should return counts', async () => {
      runtime.vault.seed([
        makeEntry({ id: 'vs1', domain: 'd1', tags: ['x'] }),
        makeEntry({ id: 'vs2', domain: 'd2', tags: ['y'] }),
      ]);
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_vault')!;
      const statsOp = facade.ops.find(o => o.name === 'vault_stats')!;
      const stats = (await statsOp.handler({})) as { totalEntries: number };
      expect(stats.totalEntries).toBe(2);
    });
  });

  describe('${config.id}_plan', () => {
    it('should contain planning ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_plan')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('create_plan');
      expect(opNames).toContain('get_plan');
      expect(opNames).toContain('approve_plan');
      expect(opNames).toContain('plan_iterate');
      expect(opNames).toContain('plan_grade');
    });

    it('create_plan should create a draft plan', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_plan')!;
      const createOp = facade.ops.find(o => o.name === 'create_plan')!;
      const result = (await createOp.handler({
        objective: 'Add caching',
        scope: 'api layer',
        tasks: [{ title: 'Add Redis', description: 'Set up Redis client' }],
      })) as { created: boolean; plan: { status: string } };
      expect(result.created).toBe(true);
      expect(result.plan.status).toBe('draft');
    });
  });

  describe('${config.id}_brain', () => {
    it('should contain brain ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_brain')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('brain_stats');
      expect(opNames).toContain('brain_strengths');
      expect(opNames).toContain('brain_build_intelligence');
      expect(opNames).toContain('brain_lifecycle');
      expect(opNames).toContain('brain_decay_report');
    });

    it('brain_stats should return intelligence stats', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_brain')!;
      const statsOp = facade.ops.find(o => o.name === 'brain_stats')!;
      const result = (await statsOp.handler({})) as { vocabularySize: number };
      expect(result.vocabularySize).toBe(0);
    });
  });

  describe('${config.id}_memory', () => {
    it('should contain memory ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_memory')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('memory_search');
      expect(opNames).toContain('memory_capture');
      expect(opNames).toContain('memory_promote_to_global');
    });
  });

  describe('${config.id}_admin', () => {
    it('should contain admin ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_admin')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('admin_health');
      expect(opNames).toContain('admin_tool_list');
      expect(opNames).toContain('llm_rotate');
      expect(opNames).toContain('render_prompt');
    });
  });

  describe('${config.id}_curator', () => {
    it('should contain curator ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_curator')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('curator_status');
      expect(opNames).toContain('curator_health_audit');
      expect(opNames).toContain('curator_hybrid_contradictions');
    });

    it('curator_status should return initialized', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_curator')!;
      const statusOp = facade.ops.find(o => o.name === 'curator_status')!;
      const result = (await statusOp.handler({})) as { initialized: boolean };
      expect(result.initialized).toBe(true);
    });
  });

  describe('${config.id}_loop', () => {
    it('should contain loop ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_loop')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('loop_start');
      expect(opNames).toContain('loop_iterate');
      expect(opNames).toContain('loop_cancel');
    });
  });

  describe('${config.id}_orchestrate', () => {
    it('should contain orchestrate ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_orchestrate')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('register');
      expect(opNames).toContain('orchestrate_plan');
      expect(opNames).toContain('project_get');
      expect(opNames).toContain('playbook_list');
    });
  });

  describe('${config.id}_control', () => {
    it('should contain control and governance ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_control')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('get_identity');
      expect(opNames).toContain('route_intent');
      expect(opNames).toContain('governance_policy');
      expect(opNames).toContain('governance_dashboard');
    });

    it('governance_policy should return default policy', async () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_control')!;
      const policyOp = facade.ops.find(o => o.name === 'governance_policy')!;
      const result = (await policyOp.handler({ action: 'get', projectPath: '/test' })) as {
        projectPath: string;
        quotas: { maxEntriesTotal: number };
      };
      expect(result.projectPath).toBe('/test');
      expect(result.quotas.maxEntriesTotal).toBe(500);
    });
  });

  describe('${config.id}_cognee', () => {
    it('should contain cognee ops', () => {
      const facade = createSemanticFacades(runtime, '${config.id}').find(f => f.name === '${config.id}_cognee')!;
      const opNames = facade.ops.map(o => o.name);
      expect(opNames).toContain('cognee_status');
      expect(opNames).toContain('cognee_search');
      expect(opNames).toContain('cognee_sync_status');
    });
  });

  describe('${config.id}_core (agent-specific)', () => {
    // Agent-specific ops (health, identity, activate, inject_claude_md, setup)
    // are tested via buildCoreFacade which is still created in entry-point.ts
    // These are NOT in createSemanticFacades — they reference agent modules.

    it('agent ops should not appear in semantic facades', () => {
      const facades = createSemanticFacades(runtime, '${config.id}');
      const allOps = facades.flatMap(f => f.ops.map(o => o.name));
      expect(allOps).not.toContain('health');
      expect(allOps).not.toContain('identity');
      expect(allOps).not.toContain('activate');
      expect(allOps).not.toContain('inject_claude_md');
      expect(allOps).not.toContain('setup');
    });
  });
```

Keep the agent-specific tests (health, identity, activate, inject_claude_md, setup) — they test the 5 ops defined in entry-point.ts. Wrap them in a separate describe that builds just the agentFacade.

**Step 3: Verify forge compiles**

Run: `cd packages/forge && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/forge/src/templates/test-facades.ts
git commit -m "feat(forge): update test-facades template for semantic facades (#167)"
```

---

## Task 15: Delete core-ops.ts

**Files:**

- Delete: `packages/core/src/runtime/core-ops.ts`

**Step 1: Verify no remaining imports of createCoreOps**

Run: `grep -r "createCoreOps\|core-ops" packages/ --include="*.ts" -l`

Should return nothing (or only the deleted file if not yet removed).

**Step 2: Delete the file**

```bash
rm packages/core/src/runtime/core-ops.ts
```

**Step 3: Verify full build**

Run: `cd packages/core && npx tsc --noEmit && cd ../forge && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add -u packages/core/src/runtime/core-ops.ts
git commit -m "refactor(core): delete core-ops.ts — replaced by semantic facades (#167)"
```

---

## Task 16: Build and scaffold test agent

**Step 1: Build all packages**

Run: `npm run build` (or `turbo build`)

Expected: Clean build, no errors.

**Step 2: Scaffold a test agent**

Run: `cd /tmp && npx create-soleri test-facade-agent --id test-facade --domains testing`

Or if using the CLI directly:

Run: `cd packages/cli && node dist/index.js create test-facade-agent --id test-facade --domains testing`

**Step 3: Build the scaffolded agent**

Run: `cd /tmp/test-facade-agent && npm install && npm run build`

Expected: Clean build.

**Step 4: Run the scaffolded agent's tests**

Run: `cd /tmp/test-facade-agent && npm test`

Expected: All tests pass. Key assertions:
- 10 semantic facades created
- Total ops = 209 across semantic facades
- Agent-specific ops not in semantic facades
- Per-facade op existence checks pass
- Handler invocation tests pass

**Step 5: Verify facade count in MCP registration**

Check the scaffolded agent's console output when started:

Run: `cd /tmp/test-facade-agent && timeout 3 node dist/index.js 2>&1 || true`

Expected: Log line showing `Registered 12 facades with 214 operations` (10 semantic + 1 agent core + 1 domain).

**Step 6: Cleanup**

```bash
rm -rf /tmp/test-facade-agent
```

**Step 7: Commit (if any fixes were needed)**

```bash
git commit -am "fix(core): address facade split issues found in integration test (#167)"
```

---

## Task 17: Run existing tests

**Step 1: Run core tests**

Run: `cd packages/core && npm test`

Expected: All pass.

**Step 2: Run forge tests**

Run: `cd packages/forge && npm test`

Expected: All pass.

**Step 3: Run full test suite**

Run: `npm test` (root)

Expected: All pass.

**Step 4: Final commit if any fixes needed**

```bash
git commit -am "fix: resolve remaining test failures from facade split (#167)"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1-10 | Create 10 facade builder files | `runtime/facades/*.ts` |
| 11 | Create assembler index | `runtime/facades/index.ts` |
| 12 | Update core exports | `core/src/index.ts` |
| 13 | Update entry-point template | `forge/src/templates/entry-point.ts` |
| 14 | Update test-facades template | `forge/src/templates/test-facades.ts` |
| 15 | Delete core-ops.ts | `runtime/core-ops.ts` |
| 16 | Integration test — scaffold agent | (temp directory) |
| 17 | Run full test suite | All packages |

Total: 17 tasks, ~13 files created/modified, 1 file deleted.
