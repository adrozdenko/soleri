# Website Repositioning: "Second Brain" to "Engine for Agents That Learn"

**Date:** 2026-04-10
**Status:** Design — awaiting approval
**Scope:** All website content (EN only — UK/IT translation is a follow-up task)

## Vision

Soleri is not "a second brain." It's an **engine for building agents that learn**. A second brain is one thing you can build with it. A tutoring companion for ADHD kids is another. A design system advisor is another. The engine is the product — what you build with it is up to you.

## Proof Point

**Ernesto** uses ~90% of the engine (vault, brain, curator, planner, governance, memory, orchestration, skills, facades).
**Rozumnyk** uses ~35% (vault, runtime pooling, LLM client, persona, domain pack — no planner, no curator, no governance).
Both are real, shipped products. Same engine.

## Golden Circle Mapping (Simon Sinek)

"People don't buy WHAT you do, they buy WHY you do it."
Most AI tool websites lead with WHAT (features, CLI commands). We lead inside-out.

| Circle | Soleri | Website Section |
|--------|--------|----------------|
| **WHY** | AI agents should learn and grow, not reset every session | Hero + Pain section |
| **HOW** | Open-source modular engine (vault, brain, curator, planner) | Spectrum + Engine sections |
| **WHAT** | `npm create soleri`, domain packs, MCP integration | Quick Start + Deep Dive |

The scroll order follows the Golden Circle: WHY first (hook), HOW second (architecture), WHAT last (get started).

## Messaging Hierarchy

1. **Hero** — WHY: The open-source engine for agents that learn (ambition, builder identity)
2. **Pain** — WHY: Your AI forgets everything between sessions (emotional hook, quick payoff)
3. **Spectrum** — HOW: Personal tool to shipped product (the range of what's possible)
4. **Engine** — HOW: Modular: pick what you need, skip what you don't (the architecture)
5. **Quick Start** — WHAT: 30 seconds to a running agent (the easy door)
6. **Deep Dive** — WHAT: 75/20/5 philosophy (for builders who scroll)

---

## File-by-File Change Spec

### 1. `src/i18n/ui.ts` — Global Strings

| Key | Current (EN) | Proposed (EN) |
|-----|-------------|---------------|
| `site.title` | "Soleri - One agent that remembers how you work" | "Soleri - The open-source engine for agents that learn" |
| `site.description` | "Open-source memory and shared knowledge for AI coding agents..." | "The open-source engine for building AI agents that learn. Ship a personal dev assistant or a product with thousands of users. Same engine, your rules." |
| `brand.meta` | "One agent. Shared knowledge. Open source." | "Build agents that learn. Open source." |
| `nav.agent` | "Your Agent" | "The Engine" |
| `cta.title` | "Start with one agent." | "Start building." |
| `cta.text` | "Keep it personal. Share knowledge when it helps." | "Personal agent or shipped product. The engine is the same." |
| `footer.tagline` | "Soleri — Personal agents with shared knowledge" | "Soleri — The engine for agents that learn" |

**No changes needed:** nav.how, nav.teams, nav.articles, nav.community, nav.docs, nav.start, hero.eyebrow, hero.img.alt, hero.btn.*, footer.contact, footer.copyright, named.after

---

### 2. `src/i18n/pages/home.ts` — Homepage

#### Hero

| Field | Current | Proposed |
|-------|---------|----------|
| `heroTitle` | "One agent that remembers how you work." | "The open-source <span>engine</span> for agents that <span>learn</span>." |
| `heroText` | "75% orchestration. 20% infrastructure. 5% AI..." | "Ship a personal dev assistant or a product with 50,000 users. Same engine. Your rules." |

#### Principle Section (Pain Hook)

| Field | Current | Proposed |
|-------|---------|----------|
| `principleTitle` | "Learns your project." | "Your AI starts from zero every session." |
| `principleSubtitle` | "Onboard once, work forever" | "Soleri agents don't." |
| `principleText` | "Tell your agent to learn the codebase..." | "You explain the architecture. Again. The naming conventions. Again. The thing you fixed last Tuesday. Again. Soleri agents capture what works and use it next time — without you asking." |
| `compareAfter` | (Session 1/2 conversation) | Keep as-is — the code example still works perfectly with the new framing. |

#### Features Array (3 sections)

**Feature 0 — currently "Memory that compounds"**

| Field | Current | Proposed |
|-------|---------|----------|
| `sectionTitle` | "Your folders don't learn. Soleri does." | "Use 10% of the engine or 100%." |
| `title` | "Memory that compounds" | "A modular engine, not a monolith" |
| `text` | "Manual setups start from zero every session..." | "Some agents need the full stack — vault, brain, curator, planner, governance. Others just need persistent memory and an LLM client. Enable what you need. Skip what you don't. The engine scales from a personal assistant to a product serving thousands of users." |
| `code` | agent.yaml with vaults config | agent.yaml with engine feature flags — show vault: true, brain: true, curator: false, planner: false to demonstrate modularity |

**Feature 1 — currently "Map. Rooms. Tools."**

| Field | Current | Proposed |
|-------|---------|----------|
| `sectionTitle` | "Map. Rooms. Tools." | "A folder. A YAML file. An agent." |
| `title` | "Three layers, instantly clear" | "Your agent is plain files" |
| `text` | "The Map routes every task to the right workspace..." | "No build step. No TypeScript project. Your agent is a folder with a YAML config, instructions in markdown, and skills that plug in. The engine handles persistence, search, learning, and planning underneath." |
| `code` | (folder structure) | Keep as-is with minor label tweaks |

**Feature 2 — currently "One command, your agent"**

| Field | Current | Proposed |
|-------|---------|----------|
| `sectionTitle` | "Pick your starting point." | "30 seconds to a running agent." |
| `title` | "One command, your agent" | "One command. Start building." |
| `text` | "Name it, pick a persona, and start working..." | "Name it, pick what engine features you need, and start working. The scaffold gives you everything to customize. Your agent learns the rest from your projects." |
| `code` | (npm create soleri) | Keep as-is |

#### Cards Section

| Field | Current | Proposed |
|-------|---------|----------|
| `cardsTitle` | "One agent. Personal, project, and team knowledge." | "From personal tool to shipped product." |

**Card 0 — currently "Personal"**

| Field | Current | Proposed |
|-------|---------|----------|
| `title` | "Personal" | "Personal Agent" |
| `domain` | "Your machine" | "For yourself" |
| `capabilities` | Your preferences, Recurring fixes, Working style, Private notes | Remembers your codebase, Captures what works, Surfaces patterns when you plan, Gets sharper every session |
| `ships` | "Keep the parts of the agent that should stay yours." | "The agent that knows your project better than you do." |

**Card 1 — currently "Project"**

| Field | Current | Proposed |
|-------|---------|----------|
| `title` | "Project" | "Team Agent" |
| `domain` | "This repo" | "For your team" |
| `capabilities` | Project rules, Architecture decisions, Shared playbooks, Recent context | Shared standards via packs, Review patterns that stick, New teammate onboarding in minutes, Knowledge that syncs via Git |
| `ships` | "Link the knowledge that helps on this codebase." | "Everyone gets an agent. Knowledge stays in sync." |

**Card 2 — currently "Team"**

| Field | Current | Proposed |
|-------|---------|----------|
| `title` | "Team" | "Product Agent" |
| `domain` | "Across repos" | "For your users" |
| `cls` | "sentinel" | "sentinel" (keep) |
| `capabilities` | Common standards, Review patterns, Reusable packs, Promoted learnings | Per-user memory via runtime pooling, Domain packs for vertical intelligence, Custom ops for your product's workflow, Scales to thousands of concurrent agents |
| `ships` | "Share what helps without maintaining a custom stack for each teammate." | "Ship agents to your users — each with their own memory." |

#### Terminal Section

No changes needed — the quick start code is still correct.

#### Architecture Section

| Field | Current | Proposed |
|-------|---------|----------|
| `archTitle` | "75/20/5 — The engine behind the folder" | "75/20/5 — The model is 5%. The engine is everything else." |
| `archSubtitle` | "75% orchestration. 20% infrastructure. 5% AI calls..." | "Most AI tools are wrappers around an API call. Soleri is the other 95% — the orchestration, persistence, and learning that make the 5% reliable." |

**Layers array:**

| Layer | Current label | Proposed label | Text change? |
|-------|-------------|---------------|-------------|
| 0 | "The Map" | "Vault" | "Persistent memory that compounds across sessions. SQLite-based, local-first, searchable. Your agent's long-term memory." |
| 1 | "The Rooms" | "Brain" | "Tracks which patterns work and which don't. Surfaces the right knowledge at the right time. Gets sharper with use." |
| 2 | "The Tools" | "Curator" | "Deduplicates, grooms, detects contradictions. Keeps the vault clean so search stays useful as knowledge grows." |
| 3 | "The Engine" | "Planner" | "Breaks work into tasks, grades plans, tracks execution, reconciles drift. The orchestration layer that turns intent into action." |

---

### 3. `src/i18n/pages/how-it-works.ts` — How It Works

#### Hero

| Field | Current | Proposed |
|-------|---------|----------|
| Hero title | "75% orchestration. 20% infrastructure. 5% AI." | "An engine, not a wrapper." |
| Hero subtitle | "Plans. Executes. Captures. Remembers" | "Most AI tools wrap an API. Soleri is the 95% that makes the 5% reliable." |

#### Section 1 — currently "The model is 5% of the system"

| Field | Current | Proposed |
|-------|---------|----------|
| Subtitle | "Most AI products are wrappers around an API. Soleri is an engine." | "Six systems working together." |
| Text | Explains 75/20/5 breakdown | Reframe around modularity: "Vault remembers. Brain ranks. Curator cleans. Planner orchestrates. Memory persists. Governance gates. Pick the ones your agent needs." |

#### Section 2 — currently "Next time, it already knows"

Keep as-is. The "pattern reuse across sessions" demo is still on-message for an engine that learns.

#### Section 3 — currently "Gets sharper, not messier"

Keep as-is. Brain intelligence and curator are engine features — this section demonstrates the engine working.

#### Section 4 — currently "Everything stays on your machine"

Keep as-is. Local-first, open source messaging doesn't change with the repositioning.

---

### 4. `src/i18n/pages/personas.ts` — Your Agent (rename to "The Engine")

Since nav changes from "Your Agent" to "The Engine", this page needs a significant rewrite.

#### Hero

| Field | Current | Proposed |
|-------|---------|----------|
| Eyebrow | "Your agent" | "The Engine" |
| Title | "A folder that learns. An engine that remembers." | "Six systems. Use what you need." |
| Subtitle | "Your agent is a folder with plain files..." | "The engine has six modules: Vault, Brain, Curator, Planner, Memory, and Governance. Enable all of them for a full knowledge agent. Or enable just the Vault for persistent memory. Your agent, your choice." |

#### Sections

Rewrite the feature sections to showcase each engine module:

1. **Vault** — "Memory that persists" (SQLite, search, per-user isolation)
2. **Brain** — "Intelligence that compounds" (pattern strength, signal tracking)
3. **Curator** — "Quality that scales" (dedup, grooming, contradictions)
4. **Planner** — "Work that ships" (plan lifecycle, grading, reconciliation)
5. **Domain Packs** — "Expertise that plugs in" (community packs, custom ops)

Each section gets a code example showing the feature in use.

#### Skills section

Keep the "Seven skills" section — it's still relevant. Skills are part of the engine.

---

### 5. `src/i18n/pages/getting-started.ts` — Getting Started

#### Hero

| Field | Current | Proposed |
|-------|---------|----------|
| Eyebrow | "From zero to a learning agent in 30 seconds" | "From zero to a running agent in 30 seconds" |
| Title | "Set up your first Soleri agent." | "Build your first agent." |
| Subtitle | "One command creates it. Open your editor and start working." | "One command scaffolds it. The engine does the rest." |

#### Steps

Step 1 and Step 2 content can stay mostly as-is. The `npm create soleri` flow is unchanged.

#### Next Steps links

| Current | Proposed |
|---------|----------|
| "See how it learns" | "See the engine" |
| "Set up your team" | "Set up your team" (keep) |
| "Full docs" | "Full docs" (keep) |

---

### 6. `src/i18n/pages/teams.ts` — Teams

The Teams page is already well-positioned and doesn't conflict with the engine vision. Teams is a use case of the engine.

#### Minor changes

| Field | Current | Proposed |
|-------|---------|----------|
| Hero title | "Every teammate gets an agent. Knowledge stays in sync." | Keep as-is — already works. |
| Hero subtitle | "Personal by default. Shared when it helps..." | Keep as-is. |

No major rewrite needed. This page already tells the "shared knowledge" story without saying "second brain."

---

### 7. `src/i18n/pages/community.ts` — Community

#### Minor changes

| Field | Current | Proposed |
|-------|---------|----------|
| Subtitle | "Build with us. Share what you learn. Shape what comes next." | Keep as-is — already works. |

Add one contribution path: **"Build a domain pack"** (if not already present). Domain packs are the engine's extensibility story.

---

### 8. `src/i18n/pages/articles.ts` — Articles

#### Minor change

| Field | Current | Proposed |
|-------|---------|----------|
| Subtitle | "On knowledge compounding, agent architecture, and building AI that learns." | "On agent architecture, knowledge engines, and building AI that ships." |

---

## Change Summary

| File | Change Level | Description |
|------|-------------|-------------|
| `ui.ts` | **Medium** | 7 string updates (title, description, meta, nav, CTA, footer) |
| `home.ts` | **Heavy** | Hero rewrite, features rewrite, cards restructure, arch section update |
| `how-it-works.ts` | **Light** | Hero rewrite, Section 1 reframe. Sections 2-4 keep. |
| `personas.ts` | **Heavy** | Full page rewrite — from "Your Agent" to "The Engine" module showcase |
| `getting-started.ts` | **Light** | Hero text updates, one link label change |
| `teams.ts` | **None/Minimal** | Already works with engine positioning |
| `community.ts` | **None/Minimal** | Possibly add "Build a domain pack" contribution path |
| `articles.ts` | **Minimal** | One subtitle update |

## What Does NOT Change

- Site structure / page count / URLs — no pages added or removed
- Astro components / layouts / styling — pure content changes
- Code examples that show CLI commands — `npm create soleri` flow is unchanged
- Paolo Soleri attribution
- Open source / Apache 2.0 / local-first messaging
- GitHub / Discord / Substack links
- i18n architecture — same TypeScript content files

## Follow-Up Tasks (Not In This Scope)

1. **UK/IT translation** — After EN is approved and implemented
2. **Docs site updates** — The /docs/ Starlight section may need similar reframing
3. **README.md update** — Monorepo README should match new positioning
4. **OG image / social cards** — May want new hero image for social shares
