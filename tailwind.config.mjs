/**
 * Tailwind config for the docs/marketing site.
 *
 * Replaces the deprecated @astrojs/tailwind integration (no Astro 6 support).
 * The content globs mirror the defaults that integration applied.
 */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
};
