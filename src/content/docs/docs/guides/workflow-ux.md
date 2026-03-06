---
title: 'UX Workflow'
description: 'Search → Plan → Work → Capture → Complete for design decisions, user experience, and interaction patterns.'
---

This is the [development workflow](/docs/guides/workflow/) applied to UX work — design decisions, interaction patterns, and usability standards.

## Search: what design decisions exist?

Before making a UX decision, check what's been established:

> **You:** "What do we know about form design?"
>
> **Agent:** _Found 5 entries:_
> 1. Show errors inline next to the field, not at the top (critical)
> 2. Use optimistic updates for submissions — don't make users wait (pattern)
> 3. Preserve input on validation error — never clear the form (critical)
> 4. Place primary action on the right, secondary on the left (pattern)
> 5. Use loading skeletons instead of spinners for content areas (suggestion)
>
> **You:** "Any patterns for navigation?"
>
> **Agent:** _Found 3 entries:_
> 1. Breadcrumbs for anything deeper than 2 levels (pattern)
> 2. Keep mobile navigation to 5 items max — Hick's Law (critical)
> 3. Always show the current location visually — active state on nav items (pattern)

These are your team's design decisions — not generic UX advice, but choices made for your specific product.

## Plan: structure the design work

> **You:** "Plan: redesign the settings page — it's grown to 40+ options across 6 categories, users can't find anything"
>
> **Agent:** _Plan created:_
> 1. Audit current settings — group by frequency of use
> 2. Define information architecture — primary vs advanced settings
> 3. Design navigation pattern for settings categories
> 4. Create progressive disclosure for advanced options
> 5. Test with 3 common user tasks — can they find what they need?
>
> _Brain recommendation: "Keep mobile navigation to 5 items max" (strength: 0.87)_
> _Brain recommendation: "Breadcrumbs for anything deeper than 2 levels" (strength: 0.82)_

The brain pulled in navigation patterns because a settings redesign with 6 categories is fundamentally a navigation problem.

## Work: make decisions with context

During the redesign, check your choices:

> **You:** "We're thinking of using tabs for the 6 settings categories. Good idea?"
>
> **Agent:** _Found relevant pattern: "Keep mobile navigation to 5 items max." 6 tabs will overflow on mobile. Consider: a sidebar navigation on desktop that collapses to a select dropdown on mobile, or group the 6 categories into 4 by merging related ones._
>
> **You:** "Should we hide advanced settings behind a toggle or put them on a separate page?"
>
> **Agent:** _No direct pattern found. This is a good candidate for capture after you decide._

When the vault has nothing, that's a signal — this is a new decision worth documenting once you make it.

## Capture: save design decisions with rationale

UX captures are especially valuable because design decisions are easy to forget and hard to reverse:

> **You:** "Capture this pattern: for settings pages with many options, use a two-level hierarchy — categories in a sidebar, options in the main area. Don't use tabs — they don't scale beyond 5 items and break on mobile."
>
> **You:** "Capture this: hide advanced settings behind a 'Show advanced' toggle, not on a separate page. Users who need them shouldn't have to navigate away. We tested both — toggle had 3x more discovery than the separate page."
>
> **You:** "Capture this anti-pattern: don't use toggle switches for settings that require a save action. Toggles imply instant effect. Use checkboxes with a save button instead, or make the toggle actually save immediately."

Notice the last one includes the **why** — "toggles imply instant effect." This is what makes UX captures valuable. The pattern alone is useful, but the rationale prevents future designers from questioning it without understanding the context.

## Complete: close the loop

> **You:** "Complete the plan"
>
> **Agent:** _Plan complete. Accuracy: 85%. Drift: testing step was replaced with stakeholder review. 3 patterns extracted._

The settings page redesign knowledge is now captured. Next time someone adds a new settings category or redesigns another complex page, the search step surfaces all of this — the two-level hierarchy, the toggle vs checkbox rule, the mobile navigation constraint.

## UX patterns worth capturing early

| Area | What to capture |
|------|----------------|
| **Layout** | Grid system, spacing scale, responsive breakpoints |
| **Navigation** | Menu structure, breadcrumb rules, mobile patterns |
| **Forms** | Validation display, field ordering, error handling |
| **Feedback** | Loading states, success/error messages, empty states |
| **Interaction** | Touch targets, hover vs click, gesture conventions |
| **Accessibility** | Color contrast rules, focus management, screen reader patterns |
| **Content** | Tone of voice, error message style, label conventions |

---

_See also: [Frontend Workflow](/docs/guides/workflow-frontend/) and [Backend Workflow](/docs/guides/workflow-backend/) for domain-specific variants._
