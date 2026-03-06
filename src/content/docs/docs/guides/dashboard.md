---
title: 'Guide: Building a Dashboard'
description: 'Follow Maya, a UX designer, as her Soleri agent goes from blank slate to design system guardian in 20 days.'
---

Maya is a UX designer starting an analytics dashboard for a SaaS product. She's done this before — and every time, design decisions get buried in Slack threads and Figma comments. By month three, nobody remembers _why_ the team picked that shade of blue.

This time she's using a Soleri agent.

```bash
npm create soleri design-buddy
```

She names it **design-buddy**, picks `frontend` and `design` as domains, and connects it to Claude Code. Two minutes.

## Day 1 — First Decisions

Maya hasn't settled on a visual direction yet. She asks:

> **Maya:** "I'm building a SaaS analytics dashboard. What color palettes work for this?"
>
> **Agent:** _Found 3 relevant entries._ Here are proven approaches:
> **Trust & Clarity** — slate primary, teal accent. Projects authority. Best for enterprise.
> **Vibrant Data** — purple primary, gradient accents. Stands out when the dashboard IS the product.
> **Minimal & Clean** — near-white backgrounds, single accent. Reduces cognitive load for power users.
> All three pass WCAG AA contrast ratios.

The agent already knows SaaS palettes from its starter knowledge — Maya didn't teach it anything.

She picks Trust & Clarity, tweaks it in Figma, and captures the decision:

> **Maya:** "Capture this: slate-900 for text, teal-600 for interactive elements, amber-500 for alerts. Slate-50 light mode, slate-950 dark mode."
>
> **Agent:** _Captured: "Dashboard Color Palette" — critical severity, design domain._

She does the same for typography (Inter + JetBrains Mono) and spacing (8px grid). Three foundational decisions, all captured in her agent's vault — not in a doc she'll forget about.

**Agent vault: 3 patterns.**

## Day 3 — Catching Mistakes

Maya builds a status badge with green background and white text. She mentions it to her agent.

> **Maya:** "Status badge — green #22c55e background with white text. Does this work?"
>
> **Agent:** _Found: "WCAG contrast ratios" (critical)._ That combination is **2.8:1** — fails AA (needs 4.5:1). Consider: use a green dot indicator with dark text instead. Reduces visual noise for data-dense views.

She didn't ask for a review. The agent flagged it because WCAG baselines are marked `critical` — they always surface.

Later, she hardcodes a hex color in CSS. The agent catches that too:

> **Maya:** "Just styled the table headers. Slate background, light text."
>
> **Agent:** _Found: "Dashboard Color Palette" (critical)._ Your palette uses semantic names. Use `var(--color-slate-900)` instead of hardcoded hex — when the palette evolves, you change one file.

Maya captures both fixes as rules. Then she formalizes her workflow:

> **Maya:** "Create a playbook: Component Design Review — check palette compliance, WCAG contrast, 44px touch targets, 8px grid spacing."
>
> **Agent:** _Created playbook: "Component Design Review" — 4 steps with validation criteria._

**Agent vault: 8 patterns + 1 playbook.**

## Day 20 — The Compound Effect

Three weeks in. Maya's agent has 47 entries — every one earned through real work. She starts building a settings page. Before she asks a question:

> **Agent:** _Relevant patterns for settings page:_
> Form inputs: `var(--color-slate-900)` on `var(--color-slate-50)`. Spacing between groups: 24px. Touch targets: 44px minimum.
> **3 anti-patterns to avoid:**
> Don't use red for errors without an icon (Day 12 — colorblind users miss it). Don't put destructive actions next to save buttons (Day 15). Don't use placeholder text as labels (Day 8).

The agent warns her about mistakes she already made and fixed. She'll never make them twice.

Then Alex, a new frontend developer, joins the team. Instead of a half-day onboarding walkthrough, he scaffolds his own agent and links it to Maya's project:

> **Alex:** "I need to build a notification banner. What are the design conventions?"
>
> **Agent:** _Cross-project search — 47 entries from linked dashboard project._
> Colors: Trust & Clarity palette, always use CSS custom properties. Spacing: 8px grid. Accessibility: 44px touch targets, WCAG AA contrast. Typography: Inter for UI, JetBrains Mono for data.

Alex got a personalized onboarding in 30 seconds — not a generic style guide, but Maya's actual decisions, rules, and hard-won anti-patterns.

**Agent vault: 50+ patterns across 2 linked projects.**

## What Happened

| Milestone  | Patterns | Value                                                                  |
| ---------- | -------- | ---------------------------------------------------------------------- |
| **Day 1**  | 3        | Palette, type, spacing — captured, not forgotten                       |
| **Day 3**  | 8        | Agent catches contrast violation and hardcoded colors before they ship |
| **Day 20** | 50+      | New team member onboards in seconds. Knowledge flows both ways.        |

Each session makes the agent smarter. Each captured pattern prevents a future mistake. Each team member who links adds to the collective knowledge.

Maya's agent isn't a generic AI assistant anymore. It's _her_ design system — built from every decision, every fix, every "never do this again" moment.

The knowledge compounds.

---

_Ready to start? [Getting Started](/docs/getting-started/) — scaffold your agent in under 5 minutes._
