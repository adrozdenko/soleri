---
title: 'Design Tokens'
description: 'Use @soleri/tokens to get a consistent color palette, semantic theming, and a Tailwind preset for Soleri projects.'
---

`@soleri/tokens` is the single source of truth for colors, shadows, radii, and theme-aware semantic tokens across Soleri. It ships as both CSS custom properties and a Tailwind preset, so it works whether you're writing utility classes or plain stylesheets.

## Install

```bash
npm install @soleri/tokens
```

The package has zero runtime dependencies. It exposes TypeScript source, compiled JS, and raw CSS files.

## What's in the box

The token system is split into two layers: _primitives_ and _semantics_.

Primitives are the raw values. Four color scales (each with 10+ shades from 25 to 900), plus shadows, border radii, and RGB channel values for alpha compositing. These don't change between themes.

Semantic tokens sit on top of primitives. They reference CSS custom properties like `var(--bg)` and `var(--foreground)`, which resolve to different primitive values depending on whether you're in light or dark mode. This is how a single `bg-background` class gives you white in light mode and deep slate in dark mode without any conditional logic.

## Usage with Tailwind CSS

Import the preset in your Tailwind config. It extends `theme.colors`, `theme.boxShadow`, `theme.borderRadius`, and `theme.backgroundImage` with all the Soleri tokens.

```typescript
// tailwind.config.ts
import { soleriPreset } from '@soleri/tokens/tailwind';

export default {
  presets: [soleriPreset],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
};
```

Then use the tokens as regular Tailwind utilities:

```html
<div class="bg-background text-foreground shadow-glow-amber rounded-lg">
  <h1 class="text-accent-primary">Hello</h1>
  <p class="text-muted">Some muted description text.</p>
</div>
```

Primitive color scales work with shade notation:

```html
<span class="text-primary-400">Amber highlight</span>
<span class="bg-secondary-600">Teal badge</span>
<span class="border-tertiary-500">Green border</span>
```

## Usage with plain CSS

If you're not using Tailwind, import the CSS directly. The `@soleri/tokens/css` entry bundles everything (primitives, light theme, dark theme) into one file:

```css
@import '@soleri/tokens/css';
```

Or import the layers individually if you only need part of the system:

```css
@import '@soleri/tokens/css/primitives'; /* color scales, shadows, radii */
@import '@soleri/tokens/css/light';      /* light theme semantic tokens */
@import '@soleri/tokens/css/dark';       /* dark theme semantic tokens */
```

Then reference the custom properties in your styles:

```css
body {
  background: var(--bg);
  color: var(--foreground);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.highlight {
  color: var(--accent-primary);
}
```

## Usage from JavaScript

You can import the raw values directly if you need them in JS (for charting libraries, canvas rendering, or anything outside CSS):

```typescript
import { colors, shadows, radii } from '@soleri/tokens';

colors.primary[400];  // '#E8A847'
colors.neutral[950];  // '#1A1F26'
shadows.md;           // '0 8px 24px -8px rgb(var(--color-black-rgb) / 0.12)'
radii.lg;             // '16px'
```

## Color primitives

The palette is built around four scales, each with a warm-to-cool character that fits the solarpunk aesthetic.

| Scale | Character | Light shades (50-400) | Dark shades (500-900) |
|---|---|---|---|
| Primary | Amber / Gold | `#F9EAD6` to `#E8A847` | `#C88F37` to `#41321F` |
| Secondary | Teal / Cyan | `#D7E2E7` to `#50B1D3` | `#239DC3` to `#0F323F` |
| Tertiary | Green / Leaf | `#E4F1DD` to `#91C96E` | `#7AAC5B` to `#2D3A26` |
| Neutral | Slate / Steel | `#D9DCDF` to `#919EB2` | `#7A899F` to `#151A21` |

There's also a small `zinc` scale used for toggle components, `error` with two shades (500, 600), and the usual `white`/`black` absolutes.

For alpha compositing, the package provides RGB channel values as space-separated triples. These let you do things like `rgb(var(--color-primary-400-rgb) / 0.15)` without parsing hex values at runtime.

## Semantic tokens

Semantic tokens are the ones you'll reach for most often. They adapt to the active theme automatically.

| Category | Tokens | What they control |
|---|---|---|
| Backgrounds | `background`, `background-warm`, `surface`, `surface-glass`, `surface-elevated` | Page backgrounds, card surfaces, glass effects |
| Foregrounds | `foreground`, `foreground-strong`, `muted` | Body text, headings, secondary text |
| Borders | `border`, `border-subtle` | Card edges, dividers |
| Accents | `accent-primary`, `accent-teal`, `accent-green`, `ring` | Highlights, links, focus rings |
| Code | `code-bg`, `code-fg`, `code-border`, `code-prompt`, `code-cmd`, `code-arg`, `code-comment`, `code-key`, `code-val`, `code-ok` | Syntax highlighting in code blocks |
| Effects | `hero-gradient`, `card-gradient` | Background gradients |
| Opacities | `glow-amber`, `glow-green`, `glow-teal`, `botanical` | Glow intensity per theme |

## Theming

Themes are activated with the `data-theme` attribute on a parent element (typically `<html>`):

```html
<html data-theme="light">
  <!-- light theme active -->
</html>
```

```html
<html data-theme="dark">
  <!-- dark theme active -->
</html>
```

Both themes define the exact same set of properties, so switching is just a matter of changing the attribute. No class swaps, no conditional imports.

The light theme uses a warm, sunlit feel. Backgrounds are white or near-white, accents pull from the deeper shades (600-level), and surfaces mix in subtle secondary/tertiary tints. The dark theme goes for a bioluminescent look. Backgrounds use the deep neutral shades (940-975), accents shift to brighter variants (300-400 level), and surfaces use semi-transparent layers over the base.

Neither theme file contains a single raw hex value. They reference only primitives, which means you could swap out the entire color palette just by changing `primitives.css`.

## Package exports

| Import path | What you get |
|---|---|
| `@soleri/tokens` | All primitives + semantic tokens + Tailwind preset |
| `@soleri/tokens/tailwind` | Tailwind preset only |
| `@soleri/tokens/css` | All CSS (primitives + both themes) |
| `@soleri/tokens/css/primitives` | Color scales, shadows, radii as CSS custom properties |
| `@soleri/tokens/css/light` | Light theme semantic properties |
| `@soleri/tokens/css/dark` | Dark theme semantic properties |
