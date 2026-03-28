import type { Locale } from '../types';

export const gettingStartedContent = (locale: Locale) => content[locale];

const content: Record<Locale, GettingStartedContent> = {
  en: {
    title: 'Getting Started - Soleri',
    description:
      'Create a file-tree agent, register it with your editor, and start building reusable knowledge in a few minutes.',
    eyebrow: 'Create an agent folder and connect it in minutes',
    heroTitle: 'Set up your first Soleri agent.',
    heroSubtitle:
      'Three steps. Create, register, run. Under two minutes.',
    steps: [
      {
        title: 'Create the agent folder',
        text: 'Use the npm create shorthand or the CLI directly. The result is a plain folder with agent.yaml, instructions, workflows, knowledge, and skills.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Register it in your editor',
        text: 'From inside the new folder, register the MCP server. Claude Code is fully supported today. Codex and OpenCode support is planned.',
        code: `<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span> <span class="arg">--target claude</span>

<span class="ok">✓</span> Detected file-tree agent
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>
<span class="ok">✓</span> Launcher created`,
        isInstallCmd: false,
      },
      {
        title: 'Run the engine',
        text: 'Start the engine while you work. It watches the agent files and regenerates the editor instruction file when the folder changes.',
        code: `<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>

<span class="ok">✓</span> MCP server running
<span class="ok">✓</span> Watching agent.yaml, instructions/, workflows/, knowledge/
<span class="ok">✓</span> CLAUDE.md regenerates on change
<span class="ok">✓</span> Claude Code token discovered <span class="cmt">(if available)</span>`,
        isInstallCmd: false,
      },
    ],
    nextTitle: "You're running. What now?",
    nextLinks: [
      {
        title: 'Try your first task',
        desc: 'Ask your agent to plan something. See how the plan-capture loop works.',
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
    eyebrow: 'Створіть теку агента та підключіть за лічені хвилини',
    heroTitle: 'Налаштуйте свого першого агента Soleri.',
    heroSubtitle:
      'Три кроки. Створити, зареєструвати, запустити. Менше двох хвилин.',
    steps: [
      {
        title: 'Створіть теку агента',
        text: 'Використовуйте npm create або CLI напряму. Результат — звичайна тека з agent.yaml, instructions, workflows, knowledge та skills.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Зареєструйте в редакторі',
        text: 'З нової теки зареєструйте MCP-сервер. Claude Code повністю підтримується. Підтримка Codex та OpenCode планується.',
        code: `<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span> <span class="arg">--target claude</span>

<span class="ok">✓</span> Виявлено файловий агент
<span class="ok">✓</span> Зареєстровано my-agent у <span class="val">~/.claude.json</span>
<span class="ok">✓</span> Лаунчер створено`,
        isInstallCmd: false,
      },
      {
        title: 'Запустіть рушій',
        text: 'Запустіть рушій під час роботи. Він спостерігає за файлами агента та перегенеровує інструкційний файл редактора при зміні теки.',
        code: `<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>

<span class="ok">✓</span> MCP-сервер працює
<span class="ok">✓</span> Спостереження за agent.yaml, instructions/, workflows/, knowledge/
<span class="ok">✓</span> CLAUDE.md перегенеровується при змінах
<span class="ok">✓</span> Токен Claude Code знайдено <span class="cmt">(якщо доступний)</span>`,
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
    eyebrow: 'Crea una cartella agente e collegala in pochi minuti',
    heroTitle: 'Configura il tuo primo agente Soleri.',
    heroSubtitle:
      'Tre passaggi. Crea, registra, avvia. Meno di due minuti.',
    steps: [
      {
        title: "Crea la cartella dell'agente",
        text: 'Usa la scorciatoia npm create o il CLI direttamente. Il risultato è una cartella semplice con agent.yaml, instructions, workflows, knowledge e skills.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Registralo nel tuo editor',
        text: 'Dalla nuova cartella, registra il server MCP. Claude Code è completamente supportato. Il supporto per Codex e OpenCode è in programma.',
        code: `<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span> <span class="arg">--target claude</span>

<span class="ok">✓</span> Rilevato agente file-tree
<span class="ok">✓</span> Registrato my-agent in <span class="val">~/.claude.json</span>
<span class="ok">✓</span> Launcher creato`,
        isInstallCmd: false,
      },
      {
        title: 'Avvia il motore',
        text: "Avvia il motore mentre lavori. Osserva i file dell'agente e rigenera il file di istruzioni dell'editor quando la cartella cambia.",
        code: `<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>

<span class="ok">✓</span> Server MCP in esecuzione
<span class="ok">✓</span> Osservando agent.yaml, instructions/, workflows/, knowledge/
<span class="ok">✓</span> CLAUDE.md si rigenera ad ogni modifica
<span class="ok">✓</span> Token Claude Code scoperto <span class="cmt">(se disponibile)</span>`,
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
