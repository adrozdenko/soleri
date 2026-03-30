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
        Head: './src/components/starlight/Head.astro',
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
            { slug: 'docs/guides/workflow' },
            { slug: 'docs/guides/workflow-frontend' },
            { slug: 'docs/guides/workflow-backend' },
            { slug: 'docs/guides/workflow-ux' },
            { slug: 'docs/guides/first-10-minutes' },
            { slug: 'docs/guides/knowledge-base' },
            { slug: 'docs/guides/code-review' },
            { slug: 'docs/guides/dashboard' },
            { slug: 'docs/guides/yolo-mode' },
            { slug: 'docs/guides/telegram' },
          ],
        },
        {
          label: 'Knowledge Management',
          translations: { uk: 'Управління знаннями', it: 'Gestione della conoscenza' },
          items: [
            { slug: 'docs/guides/vault-branching' },
            { slug: 'docs/guides/entry-linking' },
            { slug: 'docs/guides/content-ingestion' },
            { slug: 'docs/guides/knowledge-review' },
            { slug: 'docs/guides/vault-sync' },
            { slug: 'docs/guides/operator-learning' },
          ],
        },
        {
          label: 'Extensibility',
          translations: { uk: 'Розширюваність', it: 'Estensibilità' },
          items: [
            { slug: 'docs/guides/pack-authoring' },
            { slug: 'docs/guides/skills-catalog' },
            { slug: 'docs/guides/domain-packs' },
          ],
        },
        {
          label: 'Deep Dives',
          translations: { uk: 'Поглиблено', it: 'Approfondimenti' },
          items: [
            { slug: 'docs/guides/knowledge-driven-development' },
            { slug: 'docs/guides/planning' },
            { slug: 'docs/guides/subagent-dispatch' },
            { slug: 'docs/guides/subagent-tutorial' },
            { slug: 'docs/guides/loops' },
            { slug: 'docs/guides/cross-project-knowledge' },
            { slug: 'docs/guides/customizing' },
            { slug: 'docs/guides/transports' },
            { slug: 'docs/guides/testing' },
            { slug: 'docs/guides/cognee' },
            { slug: 'docs/guides/team-workflows' },
            { slug: 'docs/guides/under-the-hood' },
            { slug: 'docs/guides/security' },
          ],
        },
        {
          label: 'Reference',
          translations: { uk: 'Довідка', it: 'Riferimento' },
          items: [
            { slug: 'docs/capabilities' },
            { slug: 'docs/api-reference' },
            { slug: 'docs/cli-reference' },
            { slug: 'docs/extending' },
            { slug: 'docs/glossary' },
            { slug: 'docs/troubleshooting' },
          ],
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
