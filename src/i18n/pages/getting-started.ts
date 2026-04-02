import type { Locale } from '../types';

export const gettingStartedContent = (locale: Locale) => content[locale];

const content: Record<Locale, GettingStartedContent> = {
  en: {
    title: 'Getting Started - Soleri',
    description:
      'One command to create. One command to start. Your agent remembers everything.',
    eyebrow: 'From zero to a learning agent in 30 seconds',
    heroTitle: 'Set up your first Soleri agent.',
    heroSubtitle:
      'One command creates it. Open your editor and start working.',
    steps: [
      {
        title: 'Create your agent',
        text: 'One command. Scaffolds a complete agent with instructions, workflows, skills, and knowledge. Auto-registers in Claude Code. Requires Node.js and an MCP-compatible editor.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(28 files, 7 skills, 4 workflows)</span>
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Start using it',
        text: 'Open your editor. Your agent is already connected. Start talking — it learns from every session.',
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
    nextTitle: "You're running. What now?",
    nextLinks: [
      {
        title: 'See how it learns',
        desc: 'Ask your agent to plan something. Watch it capture patterns and reuse them next time.',
        href: 'how-it-works.html',
      },
      {
        title: 'Set up your team',
        desc: 'Share knowledge across teammates with linked vaults and packs.',
        href: 'teams.html',
      },
      {
        title: 'Full docs',
        desc: 'Commands, guides, configuration, and everything else.',
        href: '/docs/',
      },
    ],
  },
  uk: {
    title: 'Початок роботи - Soleri',
    description:
      "Від нуля до другого мозку за п'ять хвилин. Встановіть Soleri, побудуйте свій перший мозок та починайте накопичувати знання.",
    eyebrow: 'Від нуля до агента, що навчається, за 30 секунд',
    heroTitle: 'Налаштуйте свого першого агента Soleri.',
    heroSubtitle:
      'Одна команда створює. Відкрий редактор і працюй.',
    steps: [
      {
        title: 'Створіть агента',
        text: 'Одна команда. Створює повного агента з інструкціями, робочими процесами, навичками та знаннями. Автоматично реєструється в Claude Code. Потрібні Node.js та MCP-сумісний редактор.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Агента створено! <span class="cmt">(28 файлів, 7 навичок, 4 робочі процеси)</span>
<span class="ok">✓</span> Зареєстровано my-agent у <span class="val">~/.claude.json</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Починайте працювати',
        text: 'Відкрийте редактор. Агент вже підключений. Починайте розмову — він вчиться з кожної сесії.',
        code: `<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="hl">Ви:</span>    Вивчи цей проєкт.
<span class="hl">Агент:</span> Вже на цьому. Пройдуся по кодовій базі
         і запам'ятаю як все влаштовано.

<span class="dim">// Наступна сесія — агент вже знає</span>
<span class="hl">Ви:</span>    Додай новий тип події для білінгу.
<span class="hl">Агент:</span> У вас вже є патерн для подій —
         підключу так само.`,
        isInstallCmd: false,
      },
    ],
    nextTitle: 'Працює. Що далі?',
    nextLinks: [
      {
        title: 'Спробуйте першу задачу',
        desc: 'Попросіть агента спланувати щось. Побачте як працює цикл план-фіксація.',
        href: 'how-it-works.html',
      },
      {
        title: 'Налаштуйте команду',
        desc: 'Діліться знаннями з колегами через підключені сховища та пакети.',
        href: 'teams.html',
      },
      {
        title: 'Повна документація',
        desc: 'Команди, гайди, конфігурація та все інше.',
        href: '/docs/',
      },
    ],
  },
  it: {
    title: 'Inizia - Soleri',
    description:
      'Da zero a un sistema di apprendimento in cinque minuti. Installa Soleri, crea il tuo primo agente e inizia ad accumulare conoscenza.',
    eyebrow: 'Da zero a un agente che impara in 30 secondi',
    heroTitle: 'Configura il tuo primo agente Soleri.',
    heroSubtitle:
      'Un comando lo crea. Apri il tuo editor e inizia a lavorare.',
    steps: [
      {
        title: 'Crea il tuo agente',
        text: 'Un comando. Crea un agente completo con istruzioni, workflow, skill e knowledge. Si registra automaticamente in Claude Code. Servono Node.js e un editor compatibile MCP.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>

<span class="ok">✓</span> Agente creato! <span class="cmt">(28 file, 7 skill, 4 workflow)</span>
<span class="ok">✓</span> Registrato my-agent in <span class="val">~/.claude.json</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Inizia a usarlo',
        text: 'Apri il tuo editor. Il tuo agente è già connesso. Inizia a parlare — impara da ogni sessione.',
        code: `<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="hl">Tu:</span>      Impara questo progetto.
<span class="hl">Agente:</span> Ci penso io. Analizzo la codebase e
          mi ricordo come è strutturato tutto.

<span class="dim">// Sessione successiva — l'agente già sa</span>
<span class="hl">Tu:</span>      Aggiungi un nuovo tipo di evento billing.
<span class="hl">Agente:</span> Avete già un pattern per gli eventi —
          lo collego allo stesso modo.`,
        isInstallCmd: false,
      },
    ],
    nextTitle: 'Funziona. E adesso?',
    nextLinks: [
      {
        title: 'Prova il tuo primo task',
        desc: 'Chiedi al tuo agente di pianificare qualcosa. Scopri come funziona il ciclo piano-cattura.',
        href: 'how-it-works.html',
      },
      {
        title: 'Configura il team',
        desc: 'Condividi conoscenza tra colleghi con vault collegati e pack.',
        href: 'teams.html',
      },
      {
        title: 'Documentazione completa',
        desc: 'Comandi, guide, configurazione e tutto il resto.',
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
