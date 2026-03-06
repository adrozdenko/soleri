---
title: 'Code Review with Your Agent'
description: 'Turn your knowledge base into an active safety net that catches mistakes before they ship.'
---

You've been capturing patterns and anti-patterns. Now put them to work. In this tutorial, your agent reviews code using your own rules — not generic linting, but the specific standards your team agreed on.

## Step 1: Set up some rules

If you followed the previous tutorials, you already have patterns in your vault. If not, let's capture a few quick ones:

> **You:** "Capture these patterns:
>
> 1. Critical: never use hardcoded hex colors — always use CSS custom properties
> 2. Critical: all interactive elements must be at least 44px touch target on mobile
> 3. Warning: prefer semantic HTML elements over divs with ARIA roles"
>    **Agent:** _Captured 3 patterns._

These are now your standards. Your agent will reference them whenever they're relevant.

## Step 2: Ask for a review

You just built a button component. Ask your agent to look at it:

> **You:** "Review this component for design system compliance:
> `.btn { background: #3b82f6; color: white; padding: 6px 12px; font-size: 14px; }`"
> **Agent:** _Found 2 issues based on your captured patterns:_
>
> 1. **Hardcoded color** — `#3b82f6` should be `var(--color-primary)`. Your rule: always use CSS custom properties.
> 2. **Touch target too small** — 6px padding on 14px text gives roughly 26px height. Your rule: minimum 44px for interactive elements on mobile.

The agent didn't use generic rules — it used yours. The ones you captured because they matter to your project.

## Step 3: Fix and learn

Fix the issues and capture what you learned:

> **You:** "Capture this: when calculating touch targets, account for both padding and line-height. A 14px font with 1.5 line-height and 12px vertical padding gives 45px — just above the 44px minimum."
> **Agent:** _Captured: "Touch Target Calculation Method"_

Next time someone on your team wonders "how much padding do I need?", the agent has the answer — with the math.

## Step 4: Create a playbook

You keep checking the same things for every component. Turn that into a playbook — a repeatable checklist your agent can run:

> **You:** "Create a playbook called Component Review with these steps:
>
> 1. Check all colors use CSS custom properties (validate: no hex values in styles)
> 2. Verify touch targets are at least 44px (validate: padding + line-height calculation)
> 3. Check for semantic HTML (validate: no div-with-role where a native element works)
> 4. Verify spacing uses the design grid (validate: values are multiples of 4 or 8)"
>    **Agent:** _Created playbook: "Component Review" — 4 steps with validation criteria._

A playbook is different from individual patterns — it's a step-by-step procedure with specific things to check at each step.

## Step 5: Run the playbook

Next time you build a component, run it:

> **You:** "Run the Component Review playbook on this card component:
> `.card { background: var(--color-surface); padding: 16px; border-radius: 8px; }`
> `.card-title { font-size: 18px; color: var(--color-text); }`
> `.card-action { padding: 8px 16px; font-size: 14px; }`"
> **Agent:** _Running Component Review..._
> Step 1: Colors — all using custom properties. **Pass.**
> Step 2: Touch targets — `.card-action` is ~30px height. **Fail.** Increase vertical padding to 12px.
> Step 3: Semantic HTML — can't verify from CSS alone, check your markup.
> Step 4: Spacing — 16px, 8px are grid-aligned. **Pass.**
> Result: 2 passed, 1 failed, 1 needs manual check.

Your agent just ran a design review using your team's exact standards. Not generic rules from the internet — your rules, built from your experience.

## What you've built

You now have:

- **Rules** — your team's standards, captured as patterns and anti-patterns
- **Reviews** — your agent checks code against those rules, automatically
- **Playbooks** — repeatable checklists for consistent quality

Every pattern you capture makes reviews smarter. Every playbook you create saves time on the next component. The agent gets better because you're teaching it what matters to your project.

---

_Want to go deeper? See [Capabilities](/docs/capabilities/) for the full list of things your agent can do, or [Extending](/docs/extending/) to add more domains and knowledge packs._
