---
title: 'Frontend Workflow'
description: 'Search → Plan → Work → Capture → Complete for component development, styling, and UI work.'
---

This is the [development workflow](/docs/guides/workflow/) applied to frontend work — components, state management, accessibility, and UI patterns.

## Search: what do we already know?

Before building a component or touching UI logic, search for existing patterns:

> **You:** "What do we know about modal components?"
>
> **Agent:** _Found 3 entries:_
>
> 1. Always trap focus inside modals (critical, accessibility)
> 2. Close on Escape key and backdrop click (pattern)
> 3. Restore focus to trigger element on close (pattern)
>
> **You:** "Any anti-patterns for forms?"
>
> **Agent:** _Found 2 entries:_
>
> 1. Never disable the submit button without explanation (anti-pattern)
> 2. Don't clear form on validation error — users lose their input (anti-pattern, critical)

These 10-second searches prevent you from rebuilding what the team already solved and repeating mistakes someone already documented.

## Plan: break down the UI work

For anything beyond a quick fix, plan it:

> **You:** "Plan: build a notification banner with success, error, and warning variants, dismiss button, and auto-dismiss after 5 seconds"
>
> **Agent:** _Plan created:_
>
> 1. Define component API — props, variants, events
> 2. Build base layout with semantic HTML
> 3. Add variant styles for each state
> 4. Implement dismiss — button click and auto-timeout
> 5. Add focus management and ARIA attributes
> 6. Test all variants at mobile and desktop breakpoints
>
> _Brain recommendation: "Always provide keyboard navigation for dismissible elements" (strength: 0.85)_
> _Brain recommendation: "Use aria-live regions for dynamic content updates" (strength: 0.78)_

The brain pulls in relevant patterns automatically. You didn't have to remember the keyboard navigation rule — it surfaced because it's been useful in past component work.

## Work: build with the agent checking your decisions

During implementation, use the agent at decision points:

> **You:** "Review this component for accessibility:
> The banner uses a div with an onClick handler for dismiss."
>
> **Agent:** _1 issue found:_
> _Interactive dismiss should be a button element, not a div with onClick. Your rule: prefer semantic HTML elements — buttons are keyboard-accessible by default._

Run playbooks for thorough checks:

> **You:** "Run the component review playbook on this banner"
>
> **Agent:** _Running..._
> _Step 1: Semantic HTML — using div for dismiss, should be button. Fail._
> _Step 2: Keyboard navigation — no Escape key handler. Fail._
> _Step 3: Error handling — missing fallback for empty message prop. Fail._
> _Step 4: Responsiveness — layout tested at mobile breakpoint. Pass._

## Capture: save what you learned

During the build, you figured out something worth keeping:

> **You:** "Capture this pattern: for auto-dismissing notifications, always provide a pause-on-hover so users can read longer messages. Use aria-live='polite' so screen readers announce without interrupting."
>
> **You:** "Capture this anti-pattern: don't use CSS transitions on display:none — they don't animate. Use opacity + visibility + height instead for smooth dismiss animations."

## Complete: close the loop

> **You:** "Complete the plan"
>
> **Agent:** _Plan complete. Accuracy: 90%. 2 patterns extracted._

The banner knowledge is now in the vault. Next time anyone on the team builds a notification component, the search step will surface everything you learned — keyboard handling, auto-dismiss UX, animation approach, accessibility attributes.

## Frontend patterns worth capturing early

Start your vault with these high-value capture areas:

| Area                          | What to capture                                                 |
| ----------------------------- | --------------------------------------------------------------- |
| **Component API conventions** | Prop naming, variant patterns, composition approach             |
| **Accessibility**             | Focus management, ARIA usage, keyboard navigation               |
| **State management**          | When to use local vs global state, caching strategies           |
| **Responsive**                | Breakpoint conventions, mobile-first rules, layout patterns     |
| **Animation**                 | Timing conventions, reduced-motion handling, performance limits |
| **Error states**              | Loading, empty, error UI patterns for each component type       |

---

_See also: [Backend Workflow](/docs/guides/workflow-backend/) and [UX Workflow](/docs/guides/workflow-ux/) for domain-specific variants._
