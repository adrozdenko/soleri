import type { Locale } from '../types';

export const articlesContent = (locale: Locale) => content[locale];

const content: Record<Locale, ArticlesContent> = {
  en: {
    title: 'Articles - Soleri',
    description:
      'Articles about building AI agents that learn, remember, and grow. Knowledge compounding, vault architecture, and the philosophy behind Soleri.',
    eyebrow: 'From the team behind Soleri',
    heading: 'Articles',
    subtitle: 'On agent architecture, knowledge engines, and building AI that ships.',
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
      "Статті про створення AI-агентів, які навчаються, запам'ятовують і зростають. Накопичення знань, архітектура сховища та філософія Soleri.",
    eyebrow: 'Від команди Soleri',
    heading: 'Статті',
    subtitle: 'Про накопичення знань, архітектуру агентів і AI, що вчиться.',
    subscribeText: 'Отримуй нові статті на пошту.',
    subscribeLink: 'Підписатися на Substack',
    loading: 'Завантажуємо статті...',
    empty: 'Статей поки немає. Перша вже скоро.',
    emptyLink: 'Підпишись, щоб не пропустити \u2192',
    readLink: 'Читати на Substack \u2192',
    errorLoading: 'Не вдалося завантажити статті.',
  },
  it: {
    title: 'Articoli - Soleri',
    description:
      'Articoli sulla creazione di agenti AI che apprendono, ricordano e crescono. Accumulo di conoscenze, architettura del vault e filosofia di Soleri.',
    eyebrow: 'Dal team di Soleri',
    heading: 'Articoli',
    subtitle: "Sull'accumulo di conoscenza, l'architettura degli agenti e l'AI che impara.",
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
