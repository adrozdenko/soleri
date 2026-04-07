---
title: 'Domain Packs'
description: 'Specialized intelligence modules that add domain-specific operations to your agent.'
---

Domain packs are npm packages that register specialized operations with the Soleri engine. Unlike knowledge packs (which add static vault entries), domain packs add algorithmic capabilities — operations that compute results, validate data, and enforce rules.

Domain packs are **standalone community packages** — they live in their own repositories, have their own release cycles, and are installed via npm. The Soleri engine provides the infrastructure (loader, types, runtime) but ships with zero domain-specific code.

## Available packs

Discover available packs with `soleri pack registry` or install directly with `soleri pack add <name>`.

## @soleri/domain-design

Design system intelligence — 45 operations across three facades.

### Design facade (20 ops)

| Operation                  | Type          | What it does                                                 |
| -------------------------- | ------------- | ------------------------------------------------------------ |
| `check_contrast`           | Algorithmic   | WCAG 2.1 contrast ratio check between two colors             |
| `get_color_pairs`          | Algorithmic   | Suggest accessible foreground colors for a background        |
| `validate_token`           | Algorithmic   | Validate a design token name against the token schema        |
| `validate_component_code`  | Algorithmic   | Check component code for design system compliance            |
| `check_button_semantics`   | Algorithmic   | Verify button variant matches its action intent              |
| `check_action_overflow`    | Algorithmic   | Recommend buttons vs. dropdown menu based on action count    |
| `generate_image`           | LLM-dependent | Generate images via Google Gemini                            |
| `get_typography_guidance`  | Data-serving  | Typography scales, rules, and recommendations                |
| `get_spacing_guidance`     | Data-serving  | Spacing system and scale guidance                            |
| `get_icon_guidance`        | Data-serving  | Icon usage patterns                                          |
| `get_animation_patterns`   | Data-serving  | Animation and transition patterns                            |
| `get_dark_mode_colors`     | Data-serving  | Dark mode color mappings                                     |
| `get_responsive_patterns`  | Data-serving  | Responsive design patterns                                   |
| `get_ux_law`               | Data-serving  | UX laws and principles                                       |
| `get_guidance`             | Data-serving  | General design guidance                                      |
| `recommend_style`          | Data-serving  | Style recommendations                                        |
| `recommend_palette`        | Data-serving  | Color palette recommendations                                |
| `recommend_typography`     | Data-serving  | Typography pairing suggestions                               |
| `recommend_design_system`  | Data-serving  | Design system recommendations                                |
| `get_stack_guidelines`     | Data-serving  | Stack-specific guidelines (React, Vue, Svelte, etc.)         |

### Design Rules facade (15 ops)

Clean code rules, architecture patterns, variant philosophy, API constraints, stabilization patterns, delivery workflow, UX writing rules, performance constraints, component dev rules, defensive design rules, dialog patterns, component usage patterns, UI patterns, operational expertise, and error handling patterns.

### Design Patterns facade (10 ops)

Container pattern recommendations, radius guidance, depth layering, component workflows, Storybook patterns, testing patterns, font requirements, shadcn components, plus orchestration packs for fix workflows and theming.

## @soleri/domain-component

Component registry lifecycle — 7 operations.

| Operation               | Type          | What it does                                                  |
| ----------------------- | ------------- | ------------------------------------------------------------- |
| `search`                | Data-serving  | Search vault for components by query                          |
| `get`                   | Data-serving  | Get a component by ID                                         |
| `list`                  | Data-serving  | List components with optional filters                         |
| `create`                | Algorithmic   | Register a new component with metadata                        |
| `detect_drift`          | Algorithmic   | Compare component code against stored vault metadata          |
| `analyze_dependencies`  | Algorithmic   | Parse imports to build a dependency graph                     |
| `sync_status`           | Algorithmic   | Check sync between vault registry and filesystem              |

## @soleri/domain-code-review

Code review intelligence — 8 operations split between GitHub PR review and Playwright validation.

### GitHub-sourced ops (4)

| Operation                | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `review_pr_design`       | Review a PR diff for design-relevant issues (tokens, hex, inline styles) |
| `check_architecture`     | Check imports for architecture boundary violations                  |
| `search_review_context`  | Search knowledge base for review patterns matching a query          |
| `generate_review_summary`| Generate a structured summary from an array of issues               |

### Playwright-sourced ops (4)

| Operation                  | What it does                                                        |
| -------------------------- | ------------------------------------------------------------------- |
| `validate_page_styles`     | Validate computed styles against design system scales               |
| `accessibility_audit`      | Audit accessibility data — missing labels, bad contrast, roles      |
| `classify_visual_changes`  | Classify style changes as cosmetic, structural, or behavioral       |
| `validate_component_states`| Verify all required interaction states are implemented              |

## @soleri/domain-design-qa

Design QA — 5 operations for handoff quality assurance.

| Operation               | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `detect_token_drift`    | Compare design tokens against a token map with fuzzy matching        |
| `detect_hardcoded_colors`| Find hex colors that lack token mappings                            |
| `sync_components`       | Match design components against code components by name              |
| `accessibility_precheck`| WCAG contrast check on an array of color pairs                       |
| `handoff_audit`         | Audit component metadata completeness with composite scoring         |

All ops process pre-extracted data — no external API calls required. The `handoff_audit` produces a composite score weighted 40% token drift, 30% component sync, 30% accessibility when full data is provided.

## Installing domain packs

Domain packs are npm packages. Install them with the CLI or directly via npm:

```bash
# Via Soleri CLI
soleri pack add domain-design

# Or directly via npm
npm install @soleri/domain-design
```

Then add the pack to your `agent.yaml`:

```yaml
packs:
  - name: design
    package: '@soleri/domain-design'
```

The engine discovers domain pack ops automatically when the pack is installed and the agent starts.

## Creating your own domain pack

Scaffold a new pack with:

```bash
npm create soleri-pack my-pack
```

This generates a complete repo with `DomainPack` interface, TypeScript config, tests, and CI workflow. See [Creating Packs](/docs/guides/pack-authoring/) for the full authoring guide.

## When to use domain packs vs. knowledge packs

| Need                                | Use                |
| ----------------------------------- | ------------------ |
| Static patterns, rules, principles  | Knowledge pack     |
| Algorithmic validation and checks   | Domain pack        |
| Computed results (contrast ratios)  | Domain pack        |
| Best practices and anti-patterns    | Knowledge pack     |
| Both knowledge and operations       | Domain pack with bundled knowledge |

Domain packs can include bundled knowledge (the `knowledge` field in their manifest), so a single domain pack can provide both algorithmic ops and vault entries.

---

_Next: [Creating Packs](/docs/guides/pack-authoring/) — build your own packs to share expertise. See also [Skills Catalog](/docs/guides/skills-catalog/) for workflow skills, [Capabilities](/docs/capabilities/) for the full feature list, [Extending Your Agent](/docs/extending/) for custom ops and facades, and the [CLI Reference](/docs/cli-reference/) for `soleri pack` and domain management commands._
