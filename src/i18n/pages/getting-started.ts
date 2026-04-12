import type { Locale } from '../types';

export const gettingStartedContent = (locale: Locale) => content[locale];

const content: Record<Locale, GettingStartedContent> = {
  en: {
    title: 'Getting Started -- Soleri',
    description:
      'One command to create your agent. One command to run it. About 30 seconds.',
    eyebrow: 'From zero to a running agent in 30 seconds',
    heroTitle: 'Create your first agent.',
    heroSubtitle:
      'One command sets it up. Open your editor and go.',
    steps: [
      {
        title: 'Create your agent',
        text: 'One command. It scaffolds a full agent with config, instructions, skills, and workflows. Registers itself with Claude Code automatically. You need Node.js and an MCP-compatible editor.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(43 files, 7 skills, 4 workflows)</span>
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Start using it',
        text: 'Open your editor. The agent\'s already connected. Start talking to it and it starts learning.',
        code: `<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="hl">You:</span>   Learn this project.
<span class="hl">Agent:</span> On it. I'll go through the codebase and
        remember how everything is structured.

<span class="dim">// Next session — your agent already knows</span>
<span class="hl">You:</span>   Add a new billing event type.
<span class="hl">Agent:</span> You already have a pattern for events —
        I'll wire it up the same way.`,
        isInstallCmd: false,
      },
    ],
    nextTitle: "It's running. What's next?",
    nextLinks: [
      {
        title: 'Try the engine',
        desc: 'Give it a task that needs planning. Watch it remember the approach for next time.',
        href: 'how-it-works.html',
      },
      {
        title: 'Set up your team',
        desc: 'Connect a shared vault so teammates can pull from the same conventions.',
        href: 'teams.html',
      },
      {
        title: 'Read the docs',
        desc: 'Commands, configuration, guides. Everything\'s there.',
        href: '/docs/',
      },
    ],
  },
  uk: {
    title: 'Початок роботи - Soleri',
    description:
      'Одна команда, щоб створити агента. Одна команда, щоб запустити. Приблизно 30 секунд.',
    eyebrow: 'Від нуля до працюючого агента за 30 секунд',
    heroTitle: 'Створи свого першого агента.',
    heroSubtitle:
      'Одна команда все налаштує. Відкрий редактор і працюй.',
    steps: [
      {
        title: 'Створи агента',
        text: 'Одна команда. Генерує повного агента з конфігурацією, інструкціями, навичками та робочими процесами. Реєструється в Claude Code автоматично. Потрібні Node.js та MCP-сумісний редактор.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Агента створено! <span class="cmt">(43 файли, 7 навичок, 4 робочі процеси)</span>
<span class="ok">✓</span> Зареєстровано my-agent у <span class="val">~/.claude.json</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Почни працювати',
        text: 'Відкрий редактор. Агент вже підключений. Починай розмову, і він починає вчитися.',
        code: `<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="hl">Ти:</span>    Вивчи цей проєкт.
<span class="hl">Агент:</span> Вже на цьому. Пройдуся по кодовій базі
         і запам'ятаю як все влаштовано.

<span class="dim">// Наступна сесія — агент вже знає</span>
<span class="hl">Ти:</span>    Додай новий тип події для білінгу.
<span class="hl">Агент:</span> У тебе вже є патерн для подій,
         підключу так само.`,
        isInstallCmd: false,
      },
    ],
    nextTitle: 'Працює. Що далі?',
    nextLinks: [
      {
        title: 'Спробуй рушій',
        desc: 'Дай задачу, яка потребує планування. Подивися, як він запам\'ятає підхід на наступний раз.',
        href: 'how-it-works.html',
      },
      {
        title: 'Налаштуй команду',
        desc: 'Підключи спільний vault, щоб колеги могли тягнути з тих самих конвенцій.',
        href: 'teams.html',
      },
      {
        title: 'Читай документацію',
        desc: 'Команди, конфігурація, гайди. Все там є.',
        href: '/docs/',
      },
    ],
  },
  it: {
    title: 'Inizia -- Soleri',
    description:
      'Un comando per creare il tuo agente. Un comando per avviarlo. Circa 30 secondi.',
    eyebrow: 'Da zero a un agente funzionante in 30 secondi',
    heroTitle: 'Crea il tuo primo agente.',
    heroSubtitle:
      'Un comando lo configura. Apri il tuo editor e vai.',
    steps: [
      {
        title: 'Crea il tuo agente',
        text: 'Un comando. Genera un agente completo con config, istruzioni, skill e workflow. Si registra in Claude Code automaticamente. Ti servono Node.js e un editor compatibile MCP.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Agente creato! <span class="cmt">(43 file, 7 skill, 4 workflow)</span>
<span class="ok">✓</span> Registrato my-agent in <span class="val">~/.claude.json</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Inizia a usarlo',
        text: 'Apri il tuo editor. L\'agente è già connesso. Inizia a parlarci e lui inizia a imparare.',
        code: `<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="hl">Tu:</span>      Impara questo progetto.
<span class="hl">Agente:</span> Ci penso io. Analizzo la codebase e
          mi ricordo come è strutturato tutto.

<span class="dim">// Sessione successiva, l'agente già sa</span>
<span class="hl">Tu:</span>      Aggiungi un nuovo tipo di evento billing.
<span class="hl">Agente:</span> Hai già un pattern per gli eventi,
          lo collego allo stesso modo.`,
        isInstallCmd: false,
      },
    ],
    nextTitle: 'Funziona. E adesso?',
    nextLinks: [
      {
        title: 'Prova il motore',
        desc: 'Dagli un task che richiede pianificazione. Guarda come si ricorda l\'approccio per la prossima volta.',
        href: 'how-it-works.html',
      },
      {
        title: 'Configura il team',
        desc: 'Collega un vault condiviso perché i colleghi possano attingere dalle stesse convenzioni.',
        href: 'teams.html',
      },
      {
        title: 'Leggi la documentazione',
        desc: 'Comandi, configurazione, guide. Tutto lì.',
        href: '/docs/',
      },
    ],
  },
};

interface Step {
  title: string;
  text: string;
  code: string;
  isInstallCmd: boolean;
}

interface NextLink {
  title: string;
  desc: string;
  href: string;
}

interface GettingStartedContent {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  steps: Step[];
  nextTitle: string;
  nextLinks: NextLink[];
}
