import { describe, it, expect } from 'vitest';
import { colors, colorChannels, rayChannels, shadows, radii } from '../primitives.js';
import {
  lightThemeProperties,
  darkThemeProperties,
  backgrounds,
  foregrounds,
  borders,
  accents,
} from '../semantic.js';
import { soleriPreset } from '../tailwind.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssDir = resolve(__dirname, '../css');

describe('primitives', () => {
  it('all color values are valid hex', () => {
    const hexPattern = /^#[0-9A-Fa-f]{3,6}$/;
    for (const [scale, shades] of Object.entries(colors)) {
      if (typeof shades === 'string') {
        expect(shades, `colors.${scale}`).toMatch(hexPattern);
        continue;
      }
      for (const [shade, value] of Object.entries(shades as Record<string, string>)) {
        expect(value, `colors.${scale}.${shade}`).toMatch(hexPattern);
      }
    }
  });

  it('all shadow values reference channel vars (no raw rgb)', () => {
    for (const [name, value] of Object.entries(shadows)) {
      expect(value, `shadows.${name}`).toBeTruthy();
      expect(value, `shadows.${name}`).toContain('var(--color-');
    }
  });

  it('all radii are valid CSS lengths', () => {
    const lengthPattern = /^\d+px$|^9999px$/;
    for (const [name, value] of Object.entries(radii)) {
      expect(value, `radii.${name}`).toMatch(lengthPattern);
    }
  });

  it('includes extended neutral shades (550, 940, 950, 975)', () => {
    expect(colors.neutral[550]).toBe('#5C6B7F');
    expect(colors.neutral[940]).toBe('#1E2530');
    expect(colors.neutral[950]).toBe('#1A1F26');
    expect(colors.neutral[975]).toBe('#151A21');
  });

  it('includes primary-25', () => {
    expect(colors.primary[25]).toBe('#FBF6ED');
  });

  it('includes zinc scale for toggle', () => {
    expect(colors.zinc[200]).toBe('#e4e4e7');
    expect(colors.zinc[600]).toBe('#52525b');
    expect(colors.zinc[700]).toBe('#3f3f46');
    expect(colors.zinc[800]).toBe('#27272a');
    expect(colors.zinc[950]).toBe('#09090b');
  });

  it('includes error colors', () => {
    expect(colors.error[500]).toBe('#FF5F57');
    expect(colors.error[600]).toBe('#C05050');
  });

  it('all color channels are valid space-separated RGB triples', () => {
    const rgbPattern = /^\d{1,3} \d{1,3} \d{1,3}$/;
    for (const [name, value] of Object.entries(colorChannels)) {
      expect(value, `colorChannels.${name}`).toMatch(rgbPattern);
    }
  });

  it('all ray channels are valid space-separated RGB triples', () => {
    const rgbPattern = /^\d{1,3} \d{1,3} \d{1,3}$/;
    for (const [name, value] of Object.entries(rayChannels)) {
      expect(value, `rayChannels.${name}`).toMatch(rgbPattern);
    }
  });
});

describe('semantic tokens', () => {
  it('light and dark themes define the same set of properties', () => {
    expect(lightThemeProperties).toEqual(darkThemeProperties);
  });

  it('all background tokens use var() syntax', () => {
    for (const [name, value] of Object.entries(backgrounds)) {
      expect(value, `backgrounds.${name}`).toMatch(/^var\(--.+\)$/);
    }
  });

  it('all foreground tokens use var() syntax', () => {
    for (const [name, value] of Object.entries(foregrounds)) {
      expect(value, `foregrounds.${name}`).toMatch(/^var\(--.+\)$/);
    }
  });

  it('all border tokens use var() syntax', () => {
    for (const [name, value] of Object.entries(borders)) {
      expect(value, `borders.${name}`).toMatch(/^var\(--.+\)$/);
    }
  });

  it('all accent tokens use var() syntax', () => {
    for (const [name, value] of Object.entries(accents)) {
      expect(value, `accents.${name}`).toMatch(/^var\(--.+\)$/);
    }
  });
});

describe('tailwind preset', () => {
  it('exports a valid config with theme.extend.colors', () => {
    expect(soleriPreset).toBeDefined();
    expect(soleriPreset.theme?.extend?.colors).toBeDefined();
  });

  it('includes all four primitive color scales', () => {
    const extColors = soleriPreset.theme?.extend?.colors as Record<string, unknown>;
    expect(extColors.primary).toBeDefined();
    expect(extColors.secondary).toBeDefined();
    expect(extColors.tertiary).toBeDefined();
    expect(extColors.neutral).toBeDefined();
  });

  it('includes semantic color keys', () => {
    const extColors = soleriPreset.theme?.extend?.colors as Record<string, unknown>;
    expect(extColors.background).toBe('var(--bg)');
    expect(extColors.foreground).toBe('var(--foreground)');
    expect(extColors.surface).toBe('var(--surface)');
    expect(extColors.muted).toBe('var(--muted)');
    expect(extColors.border).toBe('var(--border)');
  });

  it('includes box shadows', () => {
    const extShadows = soleriPreset.theme?.extend?.boxShadow as Record<string, string>;
    expect(extShadows).toBeDefined();
    expect(extShadows['glow-amber']).toBeTruthy();
    expect(extShadows['glow-teal']).toBeTruthy();
    expect(extShadows['glow-green']).toBeTruthy();
  });

  it('includes border radii', () => {
    const extRadii = soleriPreset.theme?.extend?.borderRadius as Record<string, string>;
    expect(extRadii).toBeDefined();
    expect(extRadii.xl).toBe('20px');
    expect(extRadii['2xl']).toBe('24px');
  });
});

describe('CSS files — zero raw colors outside primitives', () => {
  it('primitives.css defines all primitive color scales in :root', () => {
    const css = readFileSync(resolve(cssDir, 'primitives.css'), 'utf-8');
    expect(css).toContain(':root');
    expect(css).toContain('--color-primary-400');
    expect(css).toContain('--color-secondary-600');
    expect(css).toContain('--color-tertiary-300');
    expect(css).toContain('--color-neutral-940');
    expect(css).toContain('--color-neutral-950');
    expect(css).toContain('--color-neutral-975');
    expect(css).toContain('--color-neutral-550');
    expect(css).toContain('--color-primary-25');
    expect(css).toContain('--color-zinc-200');
    expect(css).toContain('--color-error-500');
  });

  it('primitives.css defines RGB channels', () => {
    const css = readFileSync(resolve(cssDir, 'primitives.css'), 'utf-8');
    expect(css).toContain('--color-primary-400-rgb:');
    expect(css).toContain('--color-secondary-500-rgb:');
    expect(css).toContain('--color-tertiary-400-rgb:');
    expect(css).toContain('--color-white-rgb:');
    expect(css).toContain('--color-black-rgb:');
    expect(css).toContain('--color-ray-amber-soft-rgb:');
    expect(css).toContain('--color-ray-teal-tip-rgb:');
  });

  it('light.css has zero raw hex values', () => {
    const css = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    const hexMatches = css.match(/#[0-9A-Fa-f]{3,8}\b/g);
    expect(hexMatches, 'light.css should contain no raw hex').toBeNull();
  });

  it('dark.css has zero raw hex values', () => {
    const css = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    const hexMatches = css.match(/#[0-9A-Fa-f]{3,8}\b/g);
    expect(hexMatches, 'dark.css should contain no raw hex').toBeNull();
  });

  it('light.css has zero raw rgba() with numeric RGB', () => {
    const css = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    const rgbaMatches = css.match(/rgba?\(\s*\d/g);
    expect(rgbaMatches, 'light.css should contain no raw rgba()').toBeNull();
  });

  it('dark.css has zero raw rgba() with numeric RGB', () => {
    const css = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    const rgbaMatches = css.match(/rgba?\(\s*\d/g);
    expect(rgbaMatches, 'dark.css should contain no raw rgba()').toBeNull();
  });

  it('light.css targets [data-theme="light"]', () => {
    const css = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    expect(css).toContain("[data-theme='light']");
    expect(css).toContain('--bg:');
    expect(css).toContain('--foreground:');
    expect(css).toContain('--toggle-track-bg:');
  });

  it('dark.css targets [data-theme="dark"]', () => {
    const css = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('--bg:');
    expect(css).toContain('--foreground:');
    expect(css).toContain('--toggle-track-bg:');
  });

  it('dark.css uses primitive refs for bg, code-bg, bg-warm', () => {
    const css = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    expect(css).toContain('--bg: var(--color-neutral-950)');
    expect(css).toContain('--code-bg: var(--color-neutral-975)');
    expect(css).toContain('--surface-elevated: var(--color-neutral-800)');
    expect(css).toContain('--bg-warm: var(--color-neutral-940)');
  });

  it('light.css uses primitive refs for bg-warm, muted, toggle', () => {
    const css = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    expect(css).toContain('--bg-warm: var(--color-primary-25)');
    expect(css).toContain('--muted: var(--color-neutral-550)');
    expect(css).toContain('--toggle-track-border: var(--color-zinc-200)');
    expect(css).toContain('--toggle-thumb-bg: var(--color-zinc-200)');
    expect(css).toContain('--toggle-icon-fg: var(--color-zinc-700)');
  });

  it('dark.css toggle uses zinc primitive refs', () => {
    const css = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    expect(css).toContain('--toggle-track-bg: var(--color-zinc-950)');
    expect(css).toContain('--toggle-track-border: var(--color-zinc-800)');
    expect(css).toContain('--toggle-thumb-bg: var(--color-zinc-800)');
    expect(css).toContain('--toggle-icon-fg: var(--color-white)');
  });

  it('alpha variants use rgb(var(--channel) / alpha) syntax', () => {
    const light = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    const dark = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    expect(light).toContain('rgb(var(--color-primary-400-rgb) / 0.15)');
    expect(light).toContain('rgb(var(--color-secondary-500-rgb) / 0.08)');
    expect(light).toContain('rgb(var(--color-neutral-700-rgb) / 0.6)');
    expect(dark).toContain('rgb(var(--color-primary-400-rgb) / 0.15)');
    expect(dark).toContain('rgb(var(--color-neutral-800-rgb) / 0.7)');
  });

  it('tokens.css barrel imports all three', () => {
    const css = readFileSync(resolve(cssDir, 'tokens.css'), 'utf-8');
    expect(css).toContain("'./primitives.css'");
    expect(css).toContain("'./light.css'");
    expect(css).toContain("'./dark.css'");
  });

  it('light and dark themes define the same alpha variants', () => {
    const light = readFileSync(resolve(cssDir, 'light.css'), 'utf-8');
    const dark = readFileSync(resolve(cssDir, 'dark.css'), 'utf-8');
    const alphaPattern = /--(accent-\w+-\d+|neutral-\d+-\d+):/g;
    const lightAlphas = [...light.matchAll(alphaPattern)].map((m) => m[1]).sort();
    const darkAlphas = [...dark.matchAll(alphaPattern)].map((m) => m[1]).sort();
    expect(lightAlphas).toEqual(darkAlphas);
  });
});
