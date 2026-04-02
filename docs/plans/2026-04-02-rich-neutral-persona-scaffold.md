# Rich Neutral Persona Scaffold

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Plan ID:** `plan-1775152829196-gfgwnn`
**GH Issue:** #545
**Goal:** Replace the two-option persona wizard with: (1) Italian Craftsperson default stays, (2) Custom option generates a rich neutral persona file that user edits later — no description prompt, no LLM at scaffold time
**Architecture:** Add a `NEUTRAL_PERSONA` constant alongside the existing `ITALIAN_CRAFTSPERSON`. The wizard's "custom" option switches from asking for a description to directly using the neutral template. The full persona lands in `agent.yaml` as an editable block.
**Tech Stack:** TypeScript, @clack/prompts, YAML (agent.yaml)

## Scope

| Included | Excluded |
|----------|----------|
| Keep Italian Craftsperson as default | LLM persona generation at scaffold time |
| Create NEUTRAL_PERSONA constant | Runtime persona refinement skill |
| Remove description text prompt from wizard | Template picker (Forge/Muse/Atlas/Sage/Compass) |
| Write full persona to agent.yaml | Changes to persona loader/prompt-generator runtime |
| Update tests | Changes to how existing agents activate |

## Rejected Alternatives

| Alternative | Why rejected |
|-------------|-------------|
| LLM-generated persona at scaffold time | Requires API key, slow, fails offline, non-deterministic. LLM refinement belongs in runtime, not creation. |
| Remove custom entirely — Italian Craftsperson only | Kills personalization. A neutral editable file gives users a starting point they own. |

## Tasks

### Task 1: Create NEUTRAL_PERSONA constant in defaults.ts (Low)

**Files:** `packages/core/src/persona/defaults.ts`

Add `NEUTRAL_PERSONA` — a full `PersonaConfig` with:
- `template: 'neutral-custom'`
- Professional neutral voice: "A helpful assistant — clear, direct, and adaptable to your style."
- `culture: ''` (no cultural flavor)
- Generic metaphors: `['tools', 'building', 'systems', 'patterns', 'craft']`
- 5+ traits: helpful, precise, patient, pragmatic, curious
- 4+ quirks: clear communication patterns (not cultural — structural)
- 5+ opinions about craft quality
- 3+ greetings, 3+ signoffs
- Neutral language/name rules

Register in `PERSONA_TEMPLATES` as `'neutral-custom'`. Export.

### Task 2: Unit test NEUTRAL_PERSONA (Low) — depends on Task 1

**Files:** `packages/core/src/persona/defaults.test.ts`

- Verify all `PersonaConfig` fields are non-empty (no empty strings, no empty arrays)
- At least 3 traits, 3 quirks, 3 opinions, 2 greetings, 2 signoffs
- `PERSONA_TEMPLATES['neutral-custom']` exists and equals `NEUTRAL_PERSONA`
- `createDefaultPersona()` still returns Italian Craftsperson (unchanged)

```bash
npm run test --workspace=@soleri/core -- --reporter=verbose src/persona/defaults.test.ts
```

### Task 3: Update create-wizard.ts — remove description prompt (Medium) — depends on Task 1

**Files:** `packages/cli/src/prompts/create-wizard.ts`

1. Import `NEUTRAL_PERSONA` from `@soleri/core/personas`
2. Remove the entire `if (personaChoice === 'custom')` block that asks for description text
3. Remove `personaDescription` variable
4. When custom selected, build persona as `{ ...NEUTRAL_PERSONA, name: name.trim() }`
5. Update custom option label: `'Custom (editable neutral persona)'`
6. Update hint: `'Full persona file — customize later via agent.yaml'`

### Task 4: Verify full persona in agent.yaml output (Medium) — depends on Task 1, 3

**Files:** `packages/forge/src/scaffold-filetree.ts` (if fix needed)

Scaffold a test agent with neutral-custom persona and inspect generated `agent.yaml`. Verify ALL fields appear:
- `voice`, `traits`, `quirks`, `opinions`, `greetings`, `signoffs`
- `metaphors`, `culture`, `languageRule`, `nameRule`
- `template`, `inspiration`

If `buildAgentYaml()` omits any fields, fix it.

### Task 5: Update E2E and forge tests (Medium) — depends on Task 1, 3, 4

**Files:** E2E test files, forge scaffold tests

- Remove any mocks for the old description text prompt
- Add test: scaffold with `neutral-custom` persona produces `agent.yaml` with all persona fields populated
- Verify existing Italian Craftsperson scaffold path still works unchanged

```bash
npm run test:e2e
npm run test --workspace=@soleri/forge
```

### Task 6: Update GH issue #545 (Low) — independent

Update issue body to reflect final approved design.

## Verification

```bash
npm run build
npm run test --workspace=@soleri/core
npm run test --workspace=@soleri/forge
npm run test --workspace=@soleri/cli
npm run test:e2e
```
