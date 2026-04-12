import type { Locale } from '../types';

export const articlesContent = (locale: Locale) => content[locale];

const content: Record<Locale, ArticlesContent> = {
  en: {
    title: 'Articles -- Soleri',
    description:
      'We write about building AI agents that actually learn. Architecture decisions, design tradeoffs, and what we\'re learning as we go.',
    eyebrow: 'From the team behind Soleri',
    heading: 'Articles',
    subtitle: 'How we think about agent architecture, what we\'re building, and what we\'ve gotten wrong.',
    subscribeText: 'Get new articles delivered to your inbox.',
    subscribeLink: 'Subscribe on Substack',
    loading: 'Loading articles...',
    empty: 'No articles yet. First one is coming soon.',
    emptyLink: 'Subscribe to get notified \u2192',
    readLink: 'Read on Substack \u2192',
    errorLoading: 'Could not load articles.',
  },
  uk: {
    title: 'Статті - Soleri',
    description:
      'Ми пишемо про створення AI-агентів, які дійсно навчаються. Архітектурні рішення, дизайн-компроміси і те, що ми дізнаємося по дорозі.',
    eyebrow: 'Від команди Soleri',
    heading: 'Статті',
    subtitle: 'Як ми думаємо про архітектуру агентів, що будуємо і де помилялися.',
    subscribeText: 'Отримуй нові статті на пошту.',
    subscribeLink: 'Підписатися на Substack',
    loading: 'Завантажуємо статті...',
    empty: 'Статей поки немає. Перша вже скоро.',
    emptyLink: 'Підпишись, щоб не пропустити \u2192',
    readLink: 'Читати на Substack \u2192',
    errorLoading: 'Не вдалося завантажити статті.',
  },
  it: {
    title: 'Articoli -- Soleri',
    description:
      'Scriviamo di agenti AI che imparano davvero. Decisioni architetturali, compromessi di design e quello che stiamo imparando strada facendo.',
    eyebrow: 'Dal team dietro Soleri',
    heading: 'Articoli',
    subtitle: 'Come ragioniamo sull\'architettura degli agenti, cosa stiamo costruendo, e dove abbiamo sbagliato.',
    subscribeText: 'Ricevi i nuovi articoli nella tua casella di posta.',
    subscribeLink: 'Iscriviti su Substack',
    loading: 'Caricamento degli articoli...',
    empty: 'Nessun articolo ancora. Il primo arriva presto.',
    emptyLink: 'Iscriviti per non perdertelo \u2192',
    readLink: 'Leggi su Substack \u2192',
    errorLoading: 'Impossibile caricare gli articoli.',
  },
};

interface ArticlesContent {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  subtitle: string;
  subscribeText: string;
  subscribeLink: string;
  loading: string;
  empty: string;
  emptyLink: string;
  readLink: string;
  errorLoading: string;
}
