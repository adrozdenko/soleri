# CLI Archetype Improvements — Design

**Issue**: #184 (v6.3.0)
**Date**: 2026-03-08
**Status**: Approved

## Objective

Improve CLI create wizard archetypes: multi-archetype selection with merge strategy, domain-specific principles, rationalized tones, 2 new free archetypes, and `tier` field for future premium support (#185).

## Scope

| Included                                                             | Excluded                                       |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| Multi-archetype selection (`p.multiselect`)                          | Premium vault-backed archetypes (#185, v7.1.0) |
| Union merge strategy for domains/principles/skills                   | SRE/Ops archetype (future)                     |
| Tone conflict resolution prompt                                      | Changes to forge scaffolder                    |
| 2 new free archetypes (Accessibility Guardian, Documentation Writer) |                                                |
| `tier` field on Archetype type                                       |                                                |
| Domain-specific principle enrichment                                 |                                                |
| Move `writing-plans` + `executing-plans` to core skills              |                                                |
| Tone rationalization across archetypes                               |                                                |

## Design

### 1. Type Changes — `archetypes.ts`

Add `tier` field to `Archetype` interface:

```typescript
export interface Archetype {
  value: string;
  label: string;
  hint: string;
  tier: 'free' | 'premium';
  defaults: {
    role: string;
    description: string;
    domains: string[];
    principles: string[];
    skills: string[];
    tone: 'precise' | 'mentor' | 'pragmatic';
    greetingTemplate: (name: string) => string;
  };
}
```

All 9 archetypes (7 existing + 2 new) get `tier: 'free'`.

### 2. Multi-Archetype Selection — `create-wizard.ts`

Replace `p.select` with `p.multiselect` for archetype step. The `_custom` option remains as a choice alongside archetypes.

**Merge strategy** when multiple archetypes selected:

| Field       | Strategy                                                 |
| ----------- | -------------------------------------------------------- |
| domains     | Union (deduplicated)                                     |
| principles  | Union (deduplicated)                                     |
| skills      | Union (deduplicated)                                     |
| tone        | If all agree → use it; if disagree → prompt user to pick |
| role        | Always prompt user (too specific to merge)               |
| description | Always prompt user (too specific to merge)               |
| greeting    | Auto-generate from name + role, or prompt for custom     |

When a single archetype is selected, behavior is identical to today (pre-filled fields with Enter to accept).

When multiple are selected, role and description fields show as empty text inputs (no pre-fill) since merging free-text doesn't produce good results.

### 3. Core Skills Update — `playbook.ts`

Move `writing-plans` and `executing-plans` from optional to `CORE_SKILLS`:

```
CORE_SKILLS = [
  'brainstorming',
  'systematic-debugging',
  'verification-before-completion',
  'health-check',
  'context-resume',
  'writing-plans',      // moved from optional
  'executing-plans',    // moved from optional
]
```

Remove these two from `SKILL_CATEGORIES` optional lists.

### 4. New Free Archetypes — `archetypes.ts`

**Accessibility Guardian**:

- value: `accessibility-guardian`
- Domains: `accessibility`, `frontend`
- Principles: `wcag-compliance`, `semantic-html`, `keyboard-navigation`
- Skills: `code-patrol`, `second-opinion`
- Tone: `precise`
- Role: "Audits code for WCAG compliance and accessibility best practices"

**Documentation Writer**:

- value: `documentation-writer`
- Domains: `documentation`, `developer-experience`
- Principles: `clarity-over-completeness`, `example-driven`, `keep-current`
- Skills: `knowledge-harvest`, `vault-navigator`
- Tone: `mentor`
- Role: "Creates and maintains clear, example-driven technical documentation"

### 5. Principle Enrichment — `playbook.ts` + `archetypes.ts`

Add ~10 new domain-specific principles to `PRINCIPLE_CATEGORIES`:

| Category      | New Principles                                                |
| ------------- | ------------------------------------------------------------- |
| Code Quality  | `readable-over-clever`, `small-pr-scope`                      |
| Security      | `least-privilege`, `defense-in-depth`                         |
| API Design    | `backward-compatibility`, `consumer-driven-contracts`         |
| Testing       | `deterministic-tests`, `test-at-boundaries`                   |
| Operations    | `infrastructure-as-code`, `blast-radius-awareness`            |
| Data          | `schema-evolution`, `query-performance-first`                 |
| Accessibility | `wcag-compliance`, `semantic-html`, `keyboard-navigation`     |
| Documentation | `clarity-over-completeness`, `example-driven`, `keep-current` |
| Frontend      | `progressive-enhancement`                                     |

Update each archetype's `defaults.principles` to use domain-specific principles instead of generic ones.

### 6. Tone Rationalization — `archetypes.ts`

| Tone        | Archetypes                                                   | Rationale                             |
| ----------- | ------------------------------------------------------------ | ------------------------------------- |
| `precise`   | Security Auditor, Accessibility Guardian, Database Architect | Audit/compliance roles need exactness |
| `mentor`    | Code Reviewer, Test Engineer, Documentation Writer           | Teaching/guiding roles                |
| `pragmatic` | API Architect, DevOps Pilot, Full-Stack Assistant            | Builder/integrator roles              |

Change: Code Reviewer moves from `precise` → `mentor`.

### 7. New Domains — `playbook.ts`

Add to `DOMAIN_OPTIONS`:

- `accessibility` — "Web accessibility and WCAG compliance"
- `documentation` — "Technical writing and API documentation"
- `developer-experience` — "Developer tooling, onboarding, and ergonomics"

## Files Changed

| File                                        | Change                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/cli/src/prompts/archetypes.ts`    | Add `tier` field, 2 new archetypes, update principles/tones per archetype |
| `packages/cli/src/prompts/create-wizard.ts` | `p.select` → `p.multiselect`, merge logic, tone conflict prompt           |
| `packages/cli/src/prompts/playbook.ts`      | Move 2 skills to core, add ~10 new principles, add 3 new domains          |

## Testing

- Existing wizard flow (single archetype) must work identically
- Multi-select with 2+ archetypes merges correctly
- Tone conflict triggers user prompt
- All 9 archetypes have unique, domain-specific principle sets
- Core skills list includes 7 items
- `tier` field present on all archetypes
