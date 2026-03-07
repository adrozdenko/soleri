# CLI Archetype Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement multi-archetype selection with merge strategy, domain-specific principles, 2 new free archetypes, tier field, and tone rationalization (issue #184, v6.3.0).

**Architecture:** Three files change: `playbook.ts` (new domains, new principles, move skills to core), `archetypes.ts` (tier field, 2 new archetypes, enriched principles/tones), `create-wizard.ts` (multiselect + merge logic). Changes are additive — no breaking changes to `AgentConfig` or forge.

**Tech Stack:** TypeScript, @clack/prompts, vitest

---

### Task 1: Add new domains and principles to playbook

**Files:**
- Modify: `packages/cli/src/prompts/playbook.ts`

**Step 1: Add `developer-experience` domain to `DOMAIN_OPTIONS` array**

After the existing `devops` entry (line 62), add:

```typescript
{ value: 'developer-experience', label: 'developer-experience', hint: 'Developer tooling, onboarding, and ergonomics' },
```

Note: `accessibility` and `documentation` domains already exist (lines 44–46, 58–61).

**Step 2: Add domain-specific principles to `PRINCIPLE_CATEGORIES`**

Add a new `'Code Review'` category after the existing `'Quality'` category:

```typescript
{
  label: 'Code Review',
  options: [
    { value: 'Readable over clever', label: 'Readable over clever' },
    { value: 'Small PR scope', label: 'Small PR scope' },
  ],
},
```

Add new options to the existing `'Safety'` category (after `'Least privilege always'`):

```typescript
{ value: 'Defense in depth', label: 'Defense in depth' },
```

Add a new `'API Design'` category:

```typescript
{
  label: 'API Design',
  options: [
    { value: 'Backward compatibility by default', label: 'Backward compatibility by default' },
    { value: 'Consumer-driven contracts', label: 'Consumer-driven contracts' },
  ],
},
```

Add a new `'Testing'` category:

```typescript
{
  label: 'Testing',
  options: [
    { value: 'Deterministic tests only', label: 'Deterministic tests only' },
    { value: 'Test at boundaries, not internals', label: 'Test at boundaries, not internals' },
  ],
},
```

Add a new `'Operations'` category:

```typescript
{
  label: 'Operations',
  options: [
    { value: 'Infrastructure as code', label: 'Infrastructure as code' },
    { value: 'Blast radius awareness', label: 'Blast radius awareness' },
  ],
},
```

Add a new `'Data'` category:

```typescript
{
  label: 'Data',
  options: [
    { value: 'Schema evolution over breaking changes', label: 'Schema evolution over breaking changes' },
    { value: 'Query performance first', label: 'Query performance first' },
  ],
},
```

Add a new `'Accessibility'` category:

```typescript
{
  label: 'Accessibility',
  options: [
    { value: 'WCAG compliance is non-negotiable', label: 'WCAG compliance is non-negotiable' },
    { value: 'Semantic HTML before ARIA', label: 'Semantic HTML before ARIA' },
    { value: 'Keyboard navigation for every interaction', label: 'Keyboard navigation for every interaction' },
  ],
},
```

Add a new `'Documentation'` category:

```typescript
{
  label: 'Documentation',
  options: [
    { value: 'Clarity over completeness', label: 'Clarity over completeness' },
    { value: 'Every concept needs an example', label: 'Every concept needs an example' },
    { value: 'Docs rot faster than code — keep current', label: 'Docs rot faster than code — keep current' },
  ],
},
```

Add `'Progressive enhancement'` to the existing `'Quality'` category:

```typescript
{ value: 'Progressive enhancement', label: 'Progressive enhancement' },
```

**Step 3: Move `writing-plans` and `executing-plans` to `CORE_SKILLS`**

Update `CORE_SKILLS` (line 157–163):

```typescript
export const CORE_SKILLS = [
  'brainstorming',
  'systematic-debugging',
  'verification-before-completion',
  'health-check',
  'context-resume',
  'writing-plans',
  'executing-plans',
] as const;
```

Remove the `'Planning & Execution'` category from `SKILL_CATEGORIES` (lines 177–191 — the entire first category object).

**Step 4: Verify the file compiles**

Run: `cd /Users/adrozdenko/projects/soleri && npx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/cli/src/prompts/playbook.ts
git commit -m "feat(cli): add domain-specific principles, move planning skills to core"
```

---

### Task 2: Add tier field and 2 new archetypes

**Files:**
- Modify: `packages/cli/src/prompts/archetypes.ts`

**Step 1: Add `tier` field to the `Archetype` interface**

Update the interface (lines 8–21):

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

**Step 2: Add `tier: 'free'` to all 7 existing archetypes**

For each archetype object in the `ARCHETYPES` array, add `tier: 'free',` after the `hint` property. Example for the first one:

```typescript
{
  value: 'code-reviewer',
  label: 'Code Reviewer',
  hint: 'Catches bugs, enforces patterns, reviews PRs before merge',
  tier: 'free',
  defaults: { ... },
},
```

Repeat for all 7.

**Step 3: Add Accessibility Guardian archetype**

Add after the `full-stack` archetype (before the closing `]`):

```typescript
{
  value: 'accessibility-guardian',
  label: 'Accessibility Guardian',
  hint: 'WCAG compliance, semantic HTML, keyboard navigation audits',
  tier: 'free',
  defaults: {
    role: 'Audits code for WCAG compliance and accessibility best practices',
    description:
      'This agent reviews components and pages for accessibility issues including WCAG 2.1 violations, missing ARIA labels, keyboard navigation gaps, color contrast failures, and semantic HTML problems. It provides fix suggestions with severity ratings.',
    domains: ['accessibility', 'code-review'],
    principles: [
      'WCAG compliance is non-negotiable',
      'Semantic HTML before ARIA',
      'Keyboard navigation for every interaction',
      'Actionable feedback only',
    ],
    skills: [
      'code-patrol',
      'second-opinion',
    ],
    tone: 'precise',
    greetingTemplate: (name) =>
      `Hello! I'm ${name}. I audit your code for accessibility — WCAG compliance, keyboard navigation, screen reader support, and more.`,
  },
},
```

**Step 4: Add Documentation Writer archetype**

Add after the Accessibility Guardian:

```typescript
{
  value: 'documentation-writer',
  label: 'Documentation Writer',
  hint: 'Technical docs, API references, example-driven guides',
  tier: 'free',
  defaults: {
    role: 'Creates and maintains clear, example-driven technical documentation',
    description:
      'This agent helps write and maintain technical documentation including API references, getting-started guides, architecture docs, and changelogs. It follows docs-as-code practices and ensures every concept has a working example.',
    domains: ['documentation', 'developer-experience'],
    principles: [
      'Clarity over completeness',
      'Every concept needs an example',
      'Docs rot faster than code — keep current',
      'Design for the consumer, not the implementer',
    ],
    skills: [
      'knowledge-harvest',
      'vault-navigator',
    ],
    tone: 'mentor',
    greetingTemplate: (name) =>
      `Hello! I'm ${name}. I help write and maintain clear, example-driven documentation. What needs documenting?`,
  },
},
```

**Step 5: Verify the file compiles**

Run: `cd /Users/adrozdenko/projects/soleri && npx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/cli/src/prompts/archetypes.ts
git commit -m "feat(cli): add tier field, Accessibility Guardian and Documentation Writer archetypes"
```

---

### Task 3: Enrich existing archetype principles and rationalize tones

**Files:**
- Modify: `packages/cli/src/prompts/archetypes.ts`

**Step 1: Update Code Reviewer archetype**

Change tone from `'pragmatic'` to `'mentor'` and update principles:

```typescript
principles: [
  'Actionable feedback only',
  'Readable over clever',
  'Small PR scope',
  'Respect existing patterns',
],
tone: 'mentor',
```

Remove `writing-plans` and `executing-plans` from skills (now core):

```typescript
skills: [
  'code-patrol',
  'fix-and-learn',
  'second-opinion',
],
```

**Step 2: Update Security Auditor archetype**

Add `'Defense in depth'` to principles and remove `writing-plans`/`executing-plans` from skills:

```typescript
principles: [
  'Security first',
  'Fail closed, not open',
  'Zero trust by default',
  'Least privilege always',
  'Defense in depth',
],
skills: [
  'code-patrol',
  'fix-and-learn',
  'vault-navigator',
],
```

Tone stays `'precise'` — correct.

**Step 3: Update API Architect archetype**

Update principles to be API-specific and remove `writing-plans`/`executing-plans` from skills:

```typescript
principles: [
  'Backward compatibility by default',
  'Consumer-driven contracts',
  'Design for the consumer, not the implementer',
  'Every migration must be reversible',
],
skills: [
  'vault-navigator',
  'vault-capture',
  'second-opinion',
],
```

Change tone from `'mentor'` to `'pragmatic'`:

```typescript
tone: 'pragmatic',
```

**Step 4: Update Test Engineer archetype**

Update principles to be testing-specific and remove `writing-plans`/`executing-plans`:

```typescript
principles: [
  'Test everything that can break',
  'Deterministic tests only',
  'Test at boundaries, not internals',
  'Simplicity over cleverness',
],
skills: [
  'test-driven-development',
  'fix-and-learn',
  'code-patrol',
],
```

Change tone from `'pragmatic'` to `'mentor'`:

```typescript
tone: 'mentor',
```

**Step 5: Update DevOps Pilot archetype**

Update principles to be ops-specific and remove `writing-plans`/`executing-plans`:

```typescript
principles: [
  'Automate everything repeatable',
  'Infrastructure as code',
  'Blast radius awareness',
  'Observability built in from day one',
],
skills: [
  'vault-navigator',
  'fix-and-learn',
  'knowledge-harvest',
],
```

Tone stays `'pragmatic'` — correct.

**Step 6: Update Database Architect archetype**

Update principles to be data-specific and remove `writing-plans`/`executing-plans`:

```typescript
principles: [
  'Schema evolution over breaking changes',
  'Query performance first',
  'Every migration must be reversible',
  'Convention over configuration',
],
skills: [
  'vault-navigator',
  'vault-capture',
  'knowledge-harvest',
],
```

Tone stays `'precise'` — correct.

**Step 7: Update Full-Stack Assistant archetype**

Update principles and remove `writing-plans`/`executing-plans`:

```typescript
principles: [
  'Simplicity over cleverness',
  'Progressive enhancement',
  'Test everything that can break',
  'Respect existing patterns',
],
skills: [
  'test-driven-development',
  'code-patrol',
  'fix-and-learn',
  'vault-navigator',
],
```

Tone stays `'mentor'` — correct.

**Step 8: Verify the file compiles**

Run: `cd /Users/adrozdenko/projects/soleri && npx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No errors

**Step 9: Commit**

```bash
git add packages/cli/src/prompts/archetypes.ts
git commit -m "feat(cli): enrich archetype principles and rationalize tone assignments"
```

---

### Task 4: Implement multi-archetype selection in wizard

**Files:**
- Modify: `packages/cli/src/prompts/create-wizard.ts`

**Step 1: Change archetype step from `p.select` to `p.multiselect`**

Replace lines 54–58 (the `p.select` call) with:

```typescript
const archetypeValues = await p.multiselect({
  message: 'What kind of agent are you building? (select one or more)',
  options: archetypeChoices,
  required: false,
});

if (p.isCancel(archetypeValues)) return null;
```

**Step 2: Replace the single-archetype resolution with merge logic**

Replace lines 61–62 (the `archetype` and `isCustom` resolution) with:

```typescript
const selectedValues = archetypeValues as string[];
const isCustom = selectedValues.includes('_custom') || selectedValues.length === 0;
const selectedArchetypes = ARCHETYPES.filter((a) => selectedValues.includes(a.value));

// Merge defaults from all selected archetypes
function mergeDefaults(archetypes: Archetype[]) {
  if (archetypes.length === 0) return null;
  const domains = [...new Set(archetypes.flatMap((a) => a.defaults.domains))];
  const principles = [...new Set(archetypes.flatMap((a) => a.defaults.principles))];
  const skills = [...new Set(archetypes.flatMap((a) => a.defaults.skills))];
  const tones = [...new Set(archetypes.map((a) => a.defaults.tone))];
  return { domains, principles, skills, tones };
}

const merged = mergeDefaults(selectedArchetypes);
```

Also add the import for `Archetype` type at the top — it's already imported from `./archetypes.js`.

**Step 3: Update the display name default**

Replace line 65 (`const nameDefault = archetype ? archetype.label : undefined;`) with:

```typescript
const nameDefault = selectedArchetypes.length === 1
  ? selectedArchetypes[0].label
  : selectedArchetypes.length > 1
    ? selectedArchetypes.map((a) => a.label).join(' + ')
    : undefined;
```

**Step 4: Update the role step**

Replace lines 93–128 (the role step). When multiple archetypes are selected, don't pre-fill:

```typescript
let role: string;

if (isCustom || selectedArchetypes.length > 1) {
  if (isCustom) {
    p.note(
      [
        CUSTOM_ROLE_GUIDANCE.instruction,
        '',
        'Examples:',
        ...CUSTOM_ROLE_GUIDANCE.examples.map((e) => `  "${e}"`),
      ].join('\n'),
      '\u2726 Custom Agent Playbook',
    );
  }

  const rolePrompt = (await p.text({
    message: selectedArchetypes.length > 1
      ? 'Combined role (describe what this multi-purpose agent does)'
      : 'What does your agent do? (one sentence)',
    placeholder: 'Validates GraphQL schemas against federation rules',
    validate: (v) => {
      if (!v || v.length > 100) return 'Required (max 100 chars)';
    },
  })) as string;

  if (p.isCancel(rolePrompt)) return null;
  role = rolePrompt;
} else {
  const prefilledRole = selectedArchetypes[0].defaults.role;
  const editedRole = (await p.text({
    message: 'Role (pre-filled, press Enter to accept)',
    initialValue: prefilledRole,
    validate: (v) => {
      if (!v || v.length > 100) return 'Required (max 100 chars)';
    },
  })) as string;

  if (p.isCancel(editedRole)) return null;
  role = editedRole;
}
```

**Step 5: Update the description step**

Replace lines 130–166 (the description step). Same pattern — don't pre-fill for multi:

```typescript
let description: string;

if (isCustom || selectedArchetypes.length > 1) {
  if (isCustom) {
    p.note(
      [
        CUSTOM_DESCRIPTION_GUIDANCE.instruction,
        '',
        'Example:',
        ...CUSTOM_DESCRIPTION_GUIDANCE.examples.map((e) => `  "${e}"`),
      ].join('\n'),
      '\u2726 Description',
    );
  }

  const descPrompt = (await p.text({
    message: selectedArchetypes.length > 1
      ? 'Combined description (what does this multi-purpose agent do?)'
      : 'Describe your agent in detail',
    placeholder: 'This agent helps developers with...',
    validate: (v) => {
      if (!v || v.length < 10 || v.length > 500) return 'Required (10-500 chars)';
    },
  })) as string;

  if (p.isCancel(descPrompt)) return null;
  description = descPrompt;
} else {
  const prefilledDesc = selectedArchetypes[0].defaults.description;
  const editedDesc = (await p.text({
    message: 'Description (pre-filled, press Enter to accept)',
    initialValue: prefilledDesc,
    validate: (v) => {
      if (!v || v.length < 10 || v.length > 500) return 'Required (10-500 chars)';
    },
  })) as string;

  if (p.isCancel(editedDesc)) return null;
  description = editedDesc;
}
```

**Step 6: Update domain pre-selection**

Replace line 169 with:

```typescript
const preselectedDomains = new Set(merged?.domains ?? []);
```

**Step 7: Update principle pre-selection**

Replace line 231 with:

```typescript
const preselectedPrinciples = new Set(merged?.principles ?? []);
```

**Step 8: Update tone step**

Replace line 292 with logic that handles tone conflicts:

```typescript
let defaultTone: 'precise' | 'mentor' | 'pragmatic';

if (merged && merged.tones.length === 1) {
  defaultTone = merged.tones[0];
} else if (merged && merged.tones.length > 1) {
  p.note(
    `Selected archetypes use different tones: ${merged.tones.join(', ')}`,
    'Tone Conflict',
  );
  defaultTone = 'pragmatic'; // neutral default when tones conflict
} else {
  defaultTone = 'pragmatic';
}
```

**Step 9: Update skill pre-selection**

Replace line 307 with:

```typescript
const preselectedSkills = new Set(merged?.skills ?? []);
```

**Step 10: Update greeting step**

Replace lines 331–333 (the `autoGreeting` logic) with:

```typescript
const autoGreeting = selectedArchetypes.length === 1
  ? selectedArchetypes[0].defaults.greetingTemplate(name)
  : `Hello! I'm ${name}. I ${role[0].toLowerCase()}${role.slice(1)}.`;
```

**Step 11: Verify the file compiles**

Run: `cd /Users/adrozdenko/projects/soleri && npx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No errors

**Step 12: Commit**

```bash
git add packages/cli/src/prompts/create-wizard.ts
git commit -m "feat(cli): multi-archetype selection with union merge strategy"
```

---

### Task 5: Write tests

**Files:**
- Create: `packages/cli/src/__tests__/archetypes.test.ts`

**Step 1: Write archetype validation tests**

```typescript
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../prompts/archetypes.js';
import { CORE_SKILLS, SKILL_CATEGORIES, DOMAIN_OPTIONS, PRINCIPLE_CATEGORIES } from '../prompts/playbook.js';

const allDomainValues = DOMAIN_OPTIONS.map((d) => d.value);
const allPrincipleValues = PRINCIPLE_CATEGORIES.flatMap((c) => c.options.map((o) => o.value));
const allOptionalSkillValues = SKILL_CATEGORIES.flatMap((c) => c.options.map((o) => o.value));

describe('Archetypes', () => {
  it('should have unique values', () => {
    const values = ARCHETYPES.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('should all have tier field', () => {
    for (const a of ARCHETYPES) {
      expect(a.tier).toMatch(/^(free|premium)$/);
    }
  });

  it('should have at least 9 archetypes', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(9);
  });

  it('should reference only valid domains', () => {
    for (const a of ARCHETYPES) {
      for (const d of a.defaults.domains) {
        expect(allDomainValues).toContain(d);
      }
    }
  });

  it('should reference only valid principles', () => {
    for (const a of ARCHETYPES) {
      for (const p of a.defaults.principles) {
        expect(allPrincipleValues).toContain(p);
      }
    }
  });

  it('should not include core skills in archetype skills', () => {
    const coreSet = new Set<string>(CORE_SKILLS);
    for (const a of ARCHETYPES) {
      for (const s of a.defaults.skills) {
        expect(coreSet.has(s)).toBe(false);
      }
    }
  });

  it('should reference only valid optional skills', () => {
    for (const a of ARCHETYPES) {
      for (const s of a.defaults.skills) {
        expect(allOptionalSkillValues).toContain(s);
      }
    }
  });

  it('should include Accessibility Guardian', () => {
    expect(ARCHETYPES.find((a) => a.value === 'accessibility-guardian')).toBeDefined();
  });

  it('should include Documentation Writer', () => {
    expect(ARCHETYPES.find((a) => a.value === 'documentation-writer')).toBeDefined();
  });
});

describe('Core Skills', () => {
  it('should include writing-plans and executing-plans', () => {
    expect(CORE_SKILLS).toContain('writing-plans');
    expect(CORE_SKILLS).toContain('executing-plans');
  });

  it('should not appear in optional skill categories', () => {
    const coreSet = new Set<string>(CORE_SKILLS);
    for (const s of allOptionalSkillValues) {
      expect(coreSet.has(s)).toBe(false);
    }
  });
});
```

**Step 2: Run the tests**

Run: `cd /Users/adrozdenko/projects/soleri && npx vitest run packages/cli/src/__tests__/archetypes.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/cli/src/__tests__/archetypes.test.ts
git commit -m "test(cli): add archetype validation and core skills tests"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run CLI typecheck**

Run: `cd /Users/adrozdenko/projects/soleri && npx tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No errors

**Step 2: Run CLI tests**

Run: `cd /Users/adrozdenko/projects/soleri && cd packages/cli && npx vitest run`
Expected: All tests pass

**Step 3: Run forge tests (to verify no breakage)**

Run: `cd /Users/adrozdenko/projects/soleri && cd packages/forge && npx vitest run`
Expected: All tests pass

**Step 4: Build CLI**

Run: `cd /Users/adrozdenko/projects/soleri && cd packages/cli && npm run build`
Expected: Clean build, no errors
