import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://soleri.ai',
  output: 'static',
  build: {
    format: 'preserve',
  },
  legacy: {
    collections: true,
  },
  integrations: [
    starlight({
      title: 'Soleri',
      description:
        'Documentation for the Soleri agent forge — build AI assistants that learn, remember, and grow.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        uk: { label: 'Ukrainian', lang: 'uk' },
        it: { label: 'Italiano', lang: 'it' },
      },
      components: {
        Header: './src/components/starlight/Header.astro',
        Footer: './src/components/starlight/Footer.astro',
      },
      sidebar: [
        {
          label: 'Start Here',
          translations: { uk: 'Почніть тут', it: 'Inizia qui' },
          items: [{ slug: 'docs/getting-started' }, { slug: 'docs/your-agent' }],
        },
        {
          label: 'Guides',
          translations: { uk: 'Посібники', it: 'Guide' },
          items: [
            { slug: 'docs/guides/first-10-minutes' },
            { slug: 'docs/guides/knowledge-base' },
            { slug: 'docs/guides/code-review' },
            { slug: 'docs/guides/dashboard' },
          ],
        },
        {
          label: 'Reference',
          translations: { uk: 'Довідка', it: 'Riferimento' },
          items: [
            { slug: 'docs/capabilities' },
            { slug: 'docs/api-reference' },
            { slug: 'docs/cli-reference' },
          ],
        },
        {
          label: 'Advanced',
          translations: { uk: 'Додатково', it: 'Avanzato' },
          items: [{ slug: 'docs/extending' }],
        },
      ],
      customCss: ['./src/styles/docs-custom.css'],
    }),
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', uk: 'uk', it: 'it' },
      },
    }),
  ],
});
