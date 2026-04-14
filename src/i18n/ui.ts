import type { Locale } from './types';

export const ui: Record<Locale, Record<string, string>> = {
  en: {
    'site.title': 'Soleri -- The open-source engine for agents that learn',
    'site.description':
      'Soleri is an open-source knowledge engine for AI agents. It handles what the model can\'t: remembering what worked, figuring out what\'s useful, and getting better over time. Build a personal agent or ship one to your users.',
    'brand.meta': 'Your agent forgets everything. Soleri fixes that.',
    'nav.how': 'How it works',
    'nav.agent': 'The Engine',
    'nav.teams': 'Teams',
    'nav.articles': 'Articles',
    'nav.community': 'Community',
    'nav.docs': 'Docs',
    'nav.start': 'Get started',
    'hero.eyebrow': 'Open source',
    'hero.img.alt':
      'Solarpunk cityscape with organic architecture, lush green vegetation, solar panels, and golden sunlight streaming through glass domes',
    'hero.btn.github': 'Explore on GitHub',
    'hero.btn.how': 'See how it works',
    'cta.title': 'Try it.',
    'cta.text':
      'One command to start. Works with Claude Code, Cursor, Codex, and OpenCode.',
    'cta.btn.github': 'Explore on GitHub',
    'cta.btn.start': 'Get started',
    'footer.tagline': 'Soleri -- the open-source engine for agents that learn',
    'footer.contact': 'Contact',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Named after <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Paolo Soleri</a>, the architect who designed buildings meant to grow and change over time.',
  },
  uk: {
    'site.title': 'Soleri -- Рушій з відкритим кодом для агентів, що навчаються',
    'site.description':
      'Soleri -- рушій знань з відкритим кодом для AI-агентів. Він робить те, що модель не може: зберігає те, що працює, оцінює корисність, планує роботу і стає кращим з часом. Створи персонального агента або вбудуй його у свій продукт.',
    'brand.meta': 'Твій агент забуває все. Soleri це виправляє.',
    'nav.how': 'Як це працює',
    'nav.agent': 'Рушій',
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
    'cta.title': 'Спробуй.',
    'cta.text':
      'Одна команда, щоб почати. Працює з Claude Code, Cursor, Codex та OpenCode.',
    'cta.btn.github': 'Переглянути на GitHub',
    'cta.btn.start': 'Почати',
    'footer.tagline': 'Soleri -- рушій з відкритим кодом для агентів, що навчаються',
    'footer.contact': 'Контакт',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Названо на честь <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Паоло Солері</a>, архітектора, який проєктував будівлі, здатні рости і змінюватися з часом.',
  },
  it: {
    'site.title': 'Soleri -- Il motore open-source per agenti che imparano',
    'site.description':
      'Soleri è un motore di conoscenza open-source per agenti AI. Gestisce quello che il modello non può: salvare cosa funziona, valutare cosa è utile, pianificare il lavoro e migliorare nel tempo. Costruisci un agente personale o distribuiscine uno ai tuoi utenti.',
    'brand.meta': 'Il tuo agente dimentica tutto. Soleri risolve questo.',
    'nav.how': 'Come funziona',
    'nav.agent': 'Il Motore',
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
    'cta.title': 'Provalo.',
    'cta.text':
      'Un comando per iniziare. Funziona con Claude Code, Cursor, Codex e OpenCode.',
    'cta.btn.github': 'Esplora su GitHub',
    'cta.btn.start': 'Inizia ora',
    'footer.tagline': 'Soleri -- il motore open-source per agenti che imparano',
    'footer.contact': 'Contatti',
    'footer.copyright': '© 2026 Drozd&Co',
    'named.after':
      'Il nome viene da <a href="https://en.wikipedia.org/wiki/Paolo_Soleri" target="_blank" rel="noreferrer">Paolo Soleri</a>, l\'architetto che progettava edifici pensati per crescere e cambiare nel tempo.',
  },
};

export function t(locale: Locale, key: string): string {
  return ui[locale][key] ?? ui.en[key] ?? key;
}

export function getNavLinks(locale: Locale) {
  const prefix = `/${locale}/`;

  return [
    { href: `${prefix}how-it-works.html`, label: t(locale, 'nav.how') },
    { href: `${prefix}engine.html`, label: t(locale, 'nav.agent') },
    { href: `${prefix}teams.html`, label: t(locale, 'nav.teams') },
    { href: '/docs/', label: t(locale, 'nav.docs') },
    { href: `${prefix}articles.html`, label: t(locale, 'nav.articles') },
    { href: `${prefix}community.html`, label: t(locale, 'nav.community') },
    { href: `${prefix}getting-started.html`, label: t(locale, 'nav.start') },
  ];
}
