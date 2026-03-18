import type { Locale } from './types';

export const ui: Record<Locale, Record<string, string>> = {
  en: {
    'site.title': 'Soleri - One agent that remembers how you work',
    'site.description':
      'Open-source memory and shared knowledge for AI coding agents. One agent, multiple domains, linked vaults, playbooks, and learning that compounds over time.',
    'brand.meta': 'One agent. Shared knowledge. Open source.',
    'nav.how': 'How it works',
    'nav.agent': 'Your Agent',
    'nav.teams': 'Teams',
    'nav.articles': 'Articles',
    'nav.community': 'Community',
    'nav.docs': 'Docs',
    'nav.start': 'Get started',
    'hero.eyebrow': 'Open source · one agent, many domains',
    'hero.img.alt':
      'Solarpunk cityscape with organic architecture, lush green vegetation, solar panels, and golden sunlight streaming through glass domes',
    'hero.btn.github': 'Explore on GitHub',
    'hero.btn.how': 'See how it works',
    'cta.title': 'Start with one agent.',
    'cta.text': 'Keep it personal. Share knowledge when it helps.',
    'cta.btn.github': 'Explore on GitHub',
    'cta.btn.start': 'Get started',
    'footer.tagline': 'Soleri — Personal agents with shared knowledge',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Named after <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Paolo Soleri</a>, the architect who believed structures should be alive, adaptive, and evolving.',
  },
  uk: {
    'site.title': "Soleri — Постійна пам'ять і структуровані знання для агентних систем",
    'site.description':
      "Soleri — це фреймворк з відкритим кодом для постійної пам'яті, структурованих знань і контексту, що накопичуються з часом.",
    'brand.meta': 'Виконувані стандарти для агентних систем',
    'nav.how': 'Як це працює',
    'nav.agent': 'Твій агент',
    'nav.teams': 'Команди',
    'nav.articles': 'Статті',
    'nav.community': 'Спільнота',
    'nav.docs': 'Документація',
    'nav.start': 'Почати',
    'hero.eyebrow': 'Відкритий код',
    'hero.img.alt':
      'Соларпанк-міський пейзаж з органічною архітектурою, пишною зеленою рослинністю, сонячними панелями та золотим сонячним світлом, що пробивається крізь скляні куполи',
    'hero.btn.github': 'Переглянути на GitHub',
    'hero.btn.how': 'Як це працює',
    'cta.title': 'Почни створювати.',
    'cta.text': 'Відкритий код. Apache 2.0.',
    'cta.btn.github': 'Переглянути на GitHub',
    'cta.btn.start': 'Почати',
    'footer.tagline': 'Soleri — Виконувані стандарти для агентних систем',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Названо на честь <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Паоло Солері</a> — архітектора, який вірив, що структури мають бути живими, адаптивними й здатними еволюціонувати.',
  },
  it: {
    'site.title': 'Soleri - Memoria persistente e conoscenza strutturata per sistemi agentici',
    'site.description':
      'Soleri è un framework open-source per memoria persistente, conoscenza strutturata e contesto che si accumulano nel tempo.',
    'brand.meta': 'Standard eseguibili per sistemi agentici',
    'nav.how': 'Come funziona',
    'nav.agent': 'Il tuo agente',
    'nav.teams': 'Team',
    'nav.articles': 'Articoli',
    'nav.community': 'Community',
    'nav.docs': 'Documentazione',
    'nav.start': 'Inizia ora',
    'hero.eyebrow': 'Open source',
    'hero.img.alt':
      'Paesaggio solarpunk con architettura organica, vegetazione rigogliosa, pannelli solari e luce dorata che filtra attraverso cupole di vetro',
    'hero.btn.github': 'Esplora su GitHub',
    'hero.btn.how': 'Come funziona',
    'cta.title': 'Inizia a costruire.',
    'cta.text': 'Open source. Apache 2.0.',
    'cta.btn.github': 'Esplora su GitHub',
    'cta.btn.start': 'Inizia ora',
    'footer.tagline': 'Soleri — Standard eseguibili per sistemi agentici',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Il nome viene da <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Paolo Soleri</a>, l\'architetto convinto che le strutture dovessero essere vive, adattive e in continua evoluzione.',
  },
};

export function t(locale: Locale, key: string): string {
  return ui[locale][key] ?? ui.en[key] ?? key;
}

export function getNavLinks(locale: Locale) {
  const prefix = `/${locale}/`;

  return [
    { href: `${prefix}how-it-works.html`, label: t(locale, 'nav.how') },
    { href: `${prefix}teams.html`, label: t(locale, 'nav.teams') },
    { href: '/docs/', label: t(locale, 'nav.docs') },
    { href: `${prefix}getting-started.html`, label: t(locale, 'nav.start') },
  ];
}
