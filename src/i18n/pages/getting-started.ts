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
      'Pick a template. Register. Run. Under two minutes.',
    steps: [
      {
        title: 'Pick a template and create',
        text: 'Choose a starter agent that matches your work — content creator, freelancer, developer, researcher, or business operator. Or start blank. The result is a plain folder with workspaces, routing, skills, and instructions.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Pick a template:</span>
  <span class="ok">❯</span> <span class="val">Forge</span>       <span class="cmt">— software development</span>
    <span class="val">Muse</span>        <span class="cmt">— content creation</span>
    <span class="val">Atlas</span>       <span class="cmt">— freelance & consulting</span>
    <span class="val">Sage</span>        <span class="cmt">— research & academic</span>
    <span class="val">Compass</span>     <span class="cmt">— business operations</span>
    <span class="val">Blank</span>       <span class="cmt">— start from scratch</span>

<span class="ok">✓</span> Created my-agent <span class="cmt">(7 skills, 3 workspaces)</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Register it in your editor',
        text: 'From inside the new folder, register the MCP server. Claude Code, Cursor, and OpenCode are supported.',
        code: `<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span> <span class="arg">--target claude</span>

<span class="ok">✓</span> Detected file-tree agent <span class="cmt">(Forge template)</span>
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>
<span class="ok">✓</span> Launcher created`,
        isInstallCmd: false,
      },
      {
        title: 'Run the engine',
        text: 'Start the engine while you work. It watches your agent files, regenerates CLAUDE.md on change, and keeps the knowledge engine running.',
        code: `<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>

<span class="ok">✓</span> MCP server running
<span class="ok">✓</span> Watching agent.yaml, instructions/, workspaces/, skills/
<span class="ok">✓</span> CLAUDE.md regenerates on change
<span class="ok">✓</span> 3 workspaces loaded <span class="cmt">(planning, src, docs)</span>
<span class="ok">✓</span> 7 essential skills active`,
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
