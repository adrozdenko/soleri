import type { Locale } from '../types';

export const communityContent = (locale: Locale) => content[locale];

const content: Record<Locale, CommunityContent> = {
  en: {
    title: 'Community - Soleri',
    description:
      'Join the Soleri community. Discuss knowledge architecture, share agents, contribute knowledge packs, and shape the future of agentic memory.',
    eyebrow: 'Open source',
    heading: 'Community',
    subtitle: 'Build with us. Share what you learn. Shape what comes next.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Ask questions, share ideas, propose knowledge packs, and discuss architecture decisions. The primary place for async conversations.',
        action: 'Join the discussion \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'Real-time chat for quick questions, pair debugging, and community hangouts. Coming soon.',
        action: 'Coming soon',
        href: 'https://discord.gg/soleri',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: 'Long-form articles on knowledge compounding, agent architecture, and the philosophy behind Soleri. Subscribe to get them in your inbox.',
        action: 'Subscribe \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
    ],
    contributeTitle: 'Ways to contribute',
    contributeSubtitle:
      'Soleri is Apache 2.0 open source. Every contribution \u2014 code, knowledge, or conversation \u2014 makes the system smarter.',
    contributeCards: [
      {
        title: 'Share a knowledge pack',
        desc: 'Package domain expertise into reusable vault entries. Share patterns, anti-patterns, and workflows that help other teams skip the learning curve.',
      },
      {
        title: 'Report bugs and ideas',
        desc: 'Open an issue on GitHub. Bug reports with reproduction steps, feature ideas with use cases \u2014 everything helps us prioritize.',
      },
      {
        title: 'Improve the docs',
        desc: 'Found something unclear? Fix it. The best documentation comes from people who just figured something out.',
      },
      {
        title: 'Build an agent',
        desc: 'Build your own agent with its own persona, vault, and workflows. Share what works so others can learn from your approach.',
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
      'Приєднуйся до спільноти Soleri. Обговорюй архітектуру знань, діліся агентами, створюй пакети знань та формуй майбутнє агентної пам\u2019яті.',
    eyebrow: 'Відкритий код',
    heading: 'Спільнота',
    subtitle: 'Будуй разом з нами. Діліся досвідом. Формуй те, що буде далі.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Став запитання, діліся ідеями, пропонуй пакети знань та обговорюй архітектурні рішення. Основне місце для асинхронних розмов.',
        action: 'Приєднатися до обговорення \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'Чат у реальному часі для швидких запитань, парного дебагу та спілкування. Скоро.',
        action: 'Скоро',
        href: 'https://discord.gg/soleri',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: 'Розгорнуті статті про накопичення знань, архітектуру агентів та філософію Soleri. Підпишись, щоб отримувати на пошту.',
        action: 'Підписатись \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
    ],
    contributeTitle: 'Як долучитися',
    contributeSubtitle:
      'Soleri \u2014 open source проєкт під ліцензією Apache 2.0. Кожен внесок \u2014 код, знання чи розмова \u2014 робить систему розумнішою.',
    contributeCards: [
      {
        title: 'Поділись пакетом знань',
        desc: 'Упакуй доменну експертизу в записи сховища для повторного використання. Діліся патернами, анти-патернами та робочими процесами, що допомагають іншим командам скоротити криву навчання.',
      },
      {
        title: 'Повідом про баги та ідеї',
        desc: 'Відкрий issue на GitHub. Звіти про баги з кроками відтворення, ідеї функцій з прикладами використання \u2014 усе допомагає нам розставити пріоритети.',
      },
      {
        title: 'Покращ документацію',
        desc: 'Знайшов щось незрозуміле? Виправ. Найкраща документація приходить від людей, які щойно з цим розібралися.',
      },
      {
        title: 'Створи агента',
        desc: 'Створи власного агента зі своїми налаштуваннями та робочими процесами. Поділись тим, що працює, щоб інші могли вчитися з твого підходу.',
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
    title: 'Community - Soleri',
    description:
      'Unisciti alla community di Soleri. Discuti di architettura della conoscenza, condividi agenti, contribuisci con pacchetti di conoscenza e plasma il futuro della memoria agentica.',
    eyebrow: 'Open source',
    heading: 'Community',
    subtitle: 'Costruisci con noi. Condividi quello che impari. Dai forma a quello che verrà.',
    channels: [
      {
        name: 'GitHub Discussions',
        desc: 'Fai domande, condividi idee, proponi pacchetti di conoscenza e discuti decisioni architetturali. Il posto principale per le conversazioni asincrone.',
        action: 'Unisciti alla discussione \u2192',
        href: 'https://github.com/adrozdenko/soleri/discussions',
        icon: 'github',
      },
      {
        name: 'Discord',
        desc: 'Chat in tempo reale per domande veloci, debug in coppia e ritrovi della community. In arrivo.',
        action: 'In arrivo',
        href: 'https://discord.gg/soleri',
        icon: 'discord',
      },
      {
        name: 'Substack',
        desc: "Articoli approfonditi sull'accumulo di conoscenza, l'architettura degli agenti e la filosofia di Soleri. Iscriviti per riceverli nella tua casella di posta.",
        action: 'Iscriviti \u2192',
        href: 'https://drozdnco.substack.com',
        icon: 'email',
      },
    ],
    contributeTitle: 'Come contribuire',
    contributeSubtitle:
      'Soleri \u00e8 open source, con licenza Apache 2.0. Ogni contributo \u2014 codice, conoscenza o conversazione \u2014 rende il sistema pi\u00f9 intelligente.',
    contributeCards: [
      {
        title: 'Condividi un pacchetto di conoscenza',
        desc: "Impacchetta l'expertise di dominio in voci del vault riutilizzabili. Condividi pattern, anti-pattern e workflow che aiutano altri team ad accorciare la curva di apprendimento.",
      },
      {
        title: 'Segnala bug e idee',
        desc: "Apri una issue su GitHub. Segnalazioni di bug con passi per riprodurli, idee per funzionalit\u00e0 con casi d'uso \u2014 tutto ci aiuta a stabilire le priorit\u00e0.",
      },
      {
        title: 'Migliora la documentazione',
        desc: 'Hai trovato qualcosa di poco chiaro? Sistemalo. La migliore documentazione viene da chi ha appena capito qualcosa.',
      },
      {
        title: 'Costruisci un agente',
        desc: 'Costruisci il tuo agente con le tue impostazioni e i tuoi workflow. Condividi quello che funziona, cos\u00ec che altri possano imparare dal tuo approccio.',
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
