import type { Locale } from '../types';

export const communityContent = (locale: Locale) => content[locale];

const content: Record<Locale, CommunityContent> = {
  en: {
    title: 'Community -- Soleri',
    description:
      'Where people building with Soleri hang out. Share what you\'ve built, ask questions, help shape what comes next.',
    eyebrow: 'Open source',
    heading: 'Community',
    subtitle: 'Build something. Share what you learn. Help us figure out what\'s next.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Questions, ideas, architecture debates, knowledge pack proposals. This is where most of the conversation happens.',
        action: 'Join the discussion \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'For quick stuff. Questions, pair debugging, just hanging out. Coming soon.',
        action: 'Coming soon',
        href: '#',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: 'Longer pieces on how we think about agent architecture and what we\'re building. Subscribe if you want them in your inbox.',
        action: 'Subscribe \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
      {
        name: 'Email',
        desc: 'For everything else. Questions, feedback, partnerships.',
        action: 'Write to us \u2192',
        href: 'mailto:hello@soleri.ai',
        icon: 'email',
      },
    ],
    contributeTitle: 'Ways to contribute',
    contributeSubtitle:
      'Soleri is open source under Apache 2.0. Code, knowledge packs, or just showing up and talking. It all helps.',
    contributeCards: [
      {
        title: 'Share a knowledge pack',
        desc: 'You know a domain well? Package it so other teams can skip the learning curve. Patterns, anti-patterns, workflows.',
      },
      {
        title: 'Report bugs and ideas',
        desc: 'Open a GitHub issue. Reproduction steps for bugs, use cases for feature ideas. Helps us figure out what to work on.',
      },
      {
        title: 'Fix the docs',
        desc: 'Found something that doesn\'t make sense? Fix it. The best docs come from people who just had to figure something out.',
      },
      {
        title: 'Build an agent',
        desc: 'Make your own, give it a personality, share what you learn.',
      },
      {
        title: 'Build a domain pack',
        desc: 'Deep in React, Rails, security, accessibility? Turn that knowledge into a pack any agent can use.',
      },
    ],
    announcementsTitle: 'Announcements',
    announcementsSubtitle: 'Latest updates from the team.',
    announcementsEmpty: 'No announcements yet. Check back soon.',
    announcementsLoading: 'Loading announcements...',
    announcementsRead: 'Read more \u2192',
    announcementsAll: 'View all discussions \u2192',
  },
  uk: {
    title: 'Спільнота - Soleri',
    description:
      'Тут збираються люди, що будують із Soleri. Діліться тим, що створили, ставте запитання, допомагайте визначати, що далі.',
    eyebrow: 'Відкритий код',
    heading: 'Спільнота',
    subtitle: 'Будуй щось. Діліся тим, що дізнався. Допоможи нам зрозуміти, що далі.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Запитання, ідеї, архітектурні дебати, пропозиції пакетів знань. Тут відбувається більшість розмов.',
        action: 'Приєднатися до обговорення \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'Для швидкого. Запитання, парний дебаг, просто потусити. Скоро.',
        action: 'Скоро',
        href: '#',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: 'Довші тексти про те, як ми думаємо про архітектуру агентів і що будуємо. Підпишись, якщо хочеш отримувати на пошту.',
        action: 'Підписатись \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
      {
        name: 'Електронна пошта',
        desc: 'Для всього іншого. Запитання, фідбек, партнерство.',
        action: 'Написати нам \u2192',
        href: 'mailto:hello@soleri.ai',
        icon: 'email',
      },
    ],
    contributeTitle: 'Як долучитися',
    contributeSubtitle:
      'Soleri -- open source під Apache 2.0. Код, пакети знань або просто прийти і поговорити. Все допомагає.',
    contributeCards: [
      {
        title: 'Поділись пакетом знань',
        desc: 'Добре знаєш якийсь домен? Запакуй, щоб інші команди пропустили криву навчання. Патерни, анти-патерни, робочі процеси.',
      },
      {
        title: 'Повідом про баги та ідеї',
        desc: 'Відкрий issue на GitHub. Кроки відтворення для багів, юзкейси для ідей. Допомагає нам зрозуміти, над чим працювати.',
      },
      {
        title: 'Покращ документацію',
        desc: 'Знайшов щось незрозуміле? Виправ. Найкраща документація приходить від людей, яким щойно довелося з чимось розібратися.',
      },
      {
        title: 'Створи агента',
        desc: 'Зроби свого, дай йому персональність, поділися тим, що дізнався.',
      },
      {
        title: 'Створи доменний пакет',
        desc: 'Глибоко в React, Rails, безпеці, доступності? Перетвори ці знання на пакет, який зможе використати будь-який агент.',
      },
    ],
    announcementsTitle: 'Оголошення',
    announcementsSubtitle: 'Останні новини від команди.',
    announcementsEmpty: 'Оголошень поки немає. Заходь пізніше.',
    announcementsLoading: 'Завантажуємо оголошення...',
    announcementsRead: 'Читати далі \u2192',
    announcementsAll: 'Усі обговорення \u2192',
  },
  it: {
    title: 'Community -- Soleri',
    description:
      'Dove si ritrovano quelli che costruiscono con Soleri. Condividi quello che hai costruito, fai domande, aiuta a decidere cosa viene dopo.',
    eyebrow: 'Open source',
    heading: 'Community',
    subtitle: 'Costruisci qualcosa. Condividi quello che impari. Aiutaci a capire cosa viene dopo.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Domande, idee, dibattiti sull\'architettura, proposte di knowledge pack. Qui succede la maggior parte delle conversazioni.',
        action: 'Unisciti alla discussione \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'Per le cose veloci. Domande, debug in coppia, stare in compagnia. In arrivo.',
        action: 'In arrivo',
        href: '#',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: 'Pezzi più lunghi su come ragioniamo sull\'architettura degli agenti e cosa stiamo costruendo. Iscriviti se vuoi riceverli nella casella di posta.',
        action: 'Iscriviti \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
      {
        name: 'Email',
        desc: 'Per tutto il resto. Domande, feedback, partnership.',
        action: 'Scrivici \u2192',
        href: 'mailto:hello@soleri.ai',
        icon: 'email',
      },
    ],
    contributeTitle: 'Come contribuire',
    contributeSubtitle:
      'Soleri è open source sotto Apache 2.0. Codice, knowledge pack, o semplicemente farti vivo e parlare. Tutto aiuta.',
    contributeCards: [
      {
        title: 'Condividi un knowledge pack',
        desc: 'Conosci bene un dominio? Impacchettalo perché altri team possano saltare la curva di apprendimento. Pattern, anti-pattern, workflow.',
      },
      {
        title: 'Segnala bug e idee',
        desc: 'Apri una issue su GitHub. Passi per riprodurre i bug, use case per le idee. Ci aiuta a capire su cosa lavorare.',
      },
      {
        title: 'Migliora la documentazione',
        desc: 'Hai trovato qualcosa che non ha senso? Sistemalo. La migliore documentazione viene da chi ha appena dovuto capire qualcosa.',
      },
      {
        title: 'Costruisci un agente',
        desc: 'Fatti il tuo, dagli una personalità, condividi quello che impari.',
      },
      {
        title: 'Costruisci un domain pack',
        desc: 'Sei dentro fino al collo in React, Rails, sicurezza, accessibilità? Trasforma quella conoscenza in un pack che qualsiasi agente può usare.',
      },
    ],
    announcementsTitle: 'Annunci',
    announcementsSubtitle: 'Ultime novit\u00e0 dal team.',
    announcementsEmpty: 'Nessun annuncio ancora. Torna presto.',
    announcementsLoading: 'Caricamento annunci...',
    announcementsRead: 'Leggi tutto \u2192',
    announcementsAll: 'Vedi tutte le discussioni \u2192',
  },
};

interface Channel {
  name: string;
  desc: string;
  action: string;
  href: string;
  icon: 'github' | 'discord' | 'email';
}

interface ContributeCard {
  title: string;
  desc: string;
}

interface CommunityContent {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  subtitle: string;
  channels: Channel[];
  contributeTitle: string;
  contributeSubtitle: string;
  contributeCards: ContributeCard[];
  announcementsTitle: string;
  announcementsSubtitle: string;
  announcementsEmpty: string;
  announcementsLoading: string;
  announcementsRead: string;
  announcementsAll: string;
}
