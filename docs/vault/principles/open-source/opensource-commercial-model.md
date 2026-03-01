---
id: principle-open-source-opensource-commercial-model
title: Open Source Release — Commercial Model (Open-Core)
category: open-source
severity: critical
tags:
  - open-source
  - business
  - commercial
  - knowledge-packs
  - open-core
  - onboarding
  - cold-start
  - community
  - contribution
knowledge_type: principle
status: active
created: 2026-02-24
updated: 2026-02-24
curator_version: 3
confidence: 1
source: unknown
---

# Open Source Release — Commercial Model (Open-Core)

## Context

Starter knowledge pack ships free (gets people started). Premium packs per domain (design, security, API design, etc.) are paid. AGPL license option forces competitors who build commercial services to open-source modifications while allowing your own commercial packs as copyright holder. Knowledge packs can be npm packages or downloadable vault content synced via CLI.

## Principle

Open-core model: engine + forge + domains + reference personas = open source (MIT or AGPL). Knowledge packs = commercial product. Users can build their own knowledge (empty vault, capture_knowledge over time) or buy curated packs for instant value. The moat is not a lock — it's curation quality, maintenance, cross-project compounding, and speed of iteration.

## Three-Tier Onboarding (Solving Cold Start)

The vault is never truly empty on first run:

**Tier 1: Starter pack (immediate value)** — Every forged persona ships with a free starter knowledge pack for its domain. Design persona gets 30-40 basic patterns (contrast ratios, spacing scales, component naming). Security persona gets OWASP top 10, common vulnerabilities. Architecture persona gets SOLID principles, common design patterns. Not premium content — just enough to be useful on day one.

**Tier 2: Project scan (wow moment)** — On first activation, the engine offers to scan the project. It detects framework, language, structure, naming conventions, existing patterns. Auto-captures 10-15 patterns from the codebase. User sees the engine already understands their project. This is the "oh, this is different" moment.

**Tier 3: Guided learning (first week)** — Engine proactively suggests captures during normal work. "I noticed you've corrected this component structure 3 times. Want me to capture this as a pattern?" After a week the vault is personalized. After a month it's indispensable.

## Community Contribution Model

Open source means PRs. Each contribution type has a defined review process:

### Contribution Tiers

| Type | Review Process | Merged Into |
|------|---------------|-------------|
| Engine bug fix | Standard PR review, CI must pass | Core engine |
| Engine feature | RFC discussion → PR → 2 maintainer review | Core engine |
| New domain module | Architecture review + domain expert sign-off | `domains/community/` initially, promote to official after proven quality |
| Persona template | Quality/voice review + test coverage required | `personas/community/` initially |
| Knowledge entry | Domain expert review + pattern validation | Community knowledge pack (never official without editorial review) |
| Starter pack improvement | Domain expert + maintainer approval | Starter packs |

### Knowledge Contribution Rules

Community knowledge contributions are the most valuable but hardest to review:

1. **Community packs vs. official packs** — Community knowledge goes into `community/` namespace. Official packs are curated by maintainers only. Community packs can be promoted to official after sustained quality.

2. **Validation pipeline** — Knowledge PRs must include: pattern title, description, at least one concrete example, a "why" explanation. Automated checks verify format. Human reviewer verifies accuracy.

3. **Domain reviewers** — Each domain (design, security, architecture, etc.) has designated expert reviewers from the community. They review knowledge PRs for their domain. Builds a review community, not a bottleneck.

4. **Attribution** — Knowledge contributors are credited in the pack metadata. Top contributors can become domain reviewers.

### CONTRIBUTING.md Structure

```markdown
# Contributing to soleri

## Quick Fixes
Bug fixes, typos, docs → standard PR.

## Engine Features
Open an RFC issue first. Discuss. Then PR.

## Domain Modules
See domains/CONTRIBUTING.md for architecture requirements.

## Persona Templates
See personas/CONTRIBUTING.md for quality guidelines.

## Knowledge Entries
See knowledge/CONTRIBUTING.md for submission format and review process.
```

## Example

```bash
# Commercial packs
soleri packs install design-pro --license XXXX
npm install @engine/pack-design-pro
soleri packs sync  # subscription: pulls latest patterns

# Community packs
soleri packs install community/react-patterns  # free, community-maintained

# First activation wow moment:
# "I'm Salvador. I see this is a React + TypeScript project using Tailwind.
#  Scanning... found 47 components, design tokens in tailwind.config.ts,
#  3 naming conventions detected. Captured 12 patterns. Want to review them?"
```

## Why

Nothing stops users from building better knowledge — and that's fine. Curation is hard work, maintenance is the real moat, and teams value time over money. Solo devs DIY and evangelize the engine; teams/agencies/enterprises pay for curated maintained packs. The three-tier onboarding ensures no user faces an empty vault. The community contribution model channels external energy into the ecosystem without compromising quality — community packs grow the ecosystem, official packs maintain the standard.
