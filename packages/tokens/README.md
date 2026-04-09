# @soleri/tokens

Solarpunk design tokens for the Soleri design system. Primitives, semantic themes, and a Tailwind preset.

## Install

```bash
npm install @soleri/tokens
```

## Usage

### Tailwind CSS

```typescript
// tailwind.config.ts
import { soleriPreset } from '@soleri/tokens/tailwind';

export default {
  presets: [soleriPreset],
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
};
```

```html
<div class="bg-background text-foreground shadow-glow-amber rounded-lg">
  <h1 class="text-accent-primary">Title</h1>
  <p class="text-muted">Description</p>
</div>
```

### CSS Custom Properties

```html
<link rel="stylesheet" href="@soleri/tokens/css" />

<html data-theme="light">
  <body style="background: var(--bg); color: var(--foreground);">
    <button style="background: var(--accent-primary); border-radius: var(--radius-md);">
      Submit
    </button>
  </body>
</html>
```

Import individual layers:

```css
@import '@soleri/tokens/css/primitives'; /* color scales, shadows, radii */
@import '@soleri/tokens/css/light';      /* light theme */
@import '@soleri/tokens/css/dark';       /* dark theme */
```

### JavaScript

```typescript
import { colors, shadows, radii } from '@soleri/tokens';

colors.primary[400];   // '#e8a847'
shadows.md;            // '0 8px 24px -8px rgb(var(--color-black-rgb) / 0.12)'
radii.lg;              // '16px'
```

## Color Scales

Four primary scales, each with 10 shades (25-900):

| Scale | Character | Example shades |
| ----- | --------- | -------------- |
| **Primary** | Amber/Gold | `#E8A847` (400), `#C88F37` (500) |
| **Secondary** | Teal/Cyan | `#50B1D3` (400), `#239DC3` (500) |
| **Tertiary** | Green/Leaf | `#91C96E` (400), `#7AAC5B` (500) |
| **Neutral** | Slate/Steel | `#919EB2` (400), `#7A899F` (500) |

Plus: `white`, `black`, `error-500`, `error-600`, and `zinc` toggle scale.

## Semantic Tokens

Theme-aware tokens that resolve via CSS custom properties:

| Category | Tokens |
| -------- | ------ |
| Backgrounds | `background`, `background-warm`, `surface`, `surface-glass`, `surface-elevated` |
| Foregrounds | `foreground`, `foreground-strong`, `muted` |
| Borders | `border`, `border-subtle` |
| Accents | `accent-primary`, `accent-teal`, `accent-green`, `ring` |
| Code | `code-bg`, `code-fg`, `code-border`, `code-prompt`, `code-cmd`, `code-arg`, `code-comment`, `code-key`, `code-val`, `code-ok` |
| Effects | `glow-amber`, `glow-teal`, `glow-green` shadows, `hero-gradient`, `card-gradient` |

## Themes

Activate via `data-theme` attribute:

```html
<html data-theme="light"> <!-- or "dark" -->
```

Both themes define identical property names. Dark theme uses brighter accent shades, light theme uses deeper shades.

## Exports

| Import path | What you get |
| ----------- | ------------ |
| `@soleri/tokens` | All primitives + semantic tokens + Tailwind preset |
| `@soleri/tokens/tailwind` | Tailwind preset only |
| `@soleri/tokens/css` | All CSS (primitives + both themes) |
| `@soleri/tokens/css/primitives` | Color scales, shadows, radii |
| `@soleri/tokens/css/light` | Light theme properties |
| `@soleri/tokens/css/dark` | Dark theme properties |

## License

Apache 2.0
