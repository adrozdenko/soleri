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
      description: 'Documentation for the Soleri agent forge — build AI assistants that learn, remember, and grow.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        uk: { label: 'Ukrainian', lang: 'uk' },
        it: { label: 'Italiano', lang: 'it' },
      },
      sidebar: [
        {
          label: 'Start Here',
          items: [
            { slug: 'docs/getting-started' },
            { slug: 'docs/your-agent' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { slug: 'docs/capabilities' },
            { slug: 'docs/api-reference' },
            { slug: 'docs/cli-reference' },
          ],
        },
        {
          label: 'Advanced',
          items: [
            { slug: 'docs/extending' },
          ],
        },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/adrozdenko/soleri' },
      ],
      customCss: ['./src/styles/docs-custom.css'],
      editLink: {
        baseUrl: 'https://github.com/adrozdenko/soleri/edit/main/',
      },
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
