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
      'Install the prerequisites, scaffold your agent, and start learning.',
    steps: [
      {
        title: 'Install the prerequisites',
        text: 'You need Node.js 18+ and an MCP-compatible AI editor. Example below uses Claude Code; Codex and OpenCode are also supported.',
        code: `<span class="prompt">#</span> <span class="cmt">Install Node.js (if you don't have it)</span>
<span class="prompt">$</span> <span class="cmd">brew install node</span>          <span class="cmt">— macOS (or download from nodejs.org)</span>

<span class="prompt">#</span> <span class="cmt">Install an AI editor (pick one)</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @anthropic-ai/claude-code</span>  <span class="cmt">— Claude Code</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @openai/codex</span>              <span class="cmt">— Codex</span>
<span class="prompt">$</span> <span class="cmd">go install github.com/opencode-ai/opencode@latest</span> <span class="cmt">— OpenCode</span>

<span class="prompt">#</span> <span class="cmt">Verify</span>
<span class="prompt">$</span> <span class="cmd">node -v</span>                   <span class="cmt">— should print v18+</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Create your agent',
        text: 'One command scaffolds a complete agent folder with instructions, workflows, skills, and knowledge. Name it, pick a persona, and you\'re done.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">What should your agent be called?</span> <span class="val">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Persona:</span> <span class="val">Italian Craftsperson (default)</span>
<span class="prompt">?</span> <span class="cmd">Create this agent?</span> <span class="val">Yes</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(28 files, 7 skills, 4 workflows)</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Start using your agent',
        text: 'Your agent was auto-registered during scaffold. Open Claude Code and start talking — the MCP server launches automatically. No extra commands needed.',
        code: `<span class="cmt"># The scaffold already registered your agent:</span>
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>

<span class="cmt"># Just open Claude Code:</span>
<span class="prompt">$</span> <span class="cmd">claude</span>

<span class="cmt"># Your agent is ready. Try:</span>
<span class="hl">You:</span>  Hello my-agent!
<span class="hl">Agent:</span> Hello! What are we working on?`,
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
      'Встановіть залежності, оберіть шаблон і починайте.',
    steps: [
      {
        title: 'Встановіть залежності',
        text: 'Потрібні Node.js 18+ та MCP-сумісний AI-редактор. Приклад нижче використовує Claude Code; Codex та OpenCode також підтримуються.',
        code: `<span class="prompt">#</span> <span class="cmt">Встановити Node.js (якщо немає)</span>
<span class="prompt">$</span> <span class="cmd">brew install node</span>          <span class="cmt">— macOS (або завантажте з nodejs.org)</span>

<span class="prompt">#</span> <span class="cmt">Встановити AI-редактор (оберіть один)</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @anthropic-ai/claude-code</span>  <span class="cmt">— Claude Code</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @openai/codex</span>              <span class="cmt">— Codex</span>
<span class="prompt">$</span> <span class="cmd">go install github.com/opencode-ai/opencode@latest</span> <span class="cmt">— OpenCode</span>

<span class="prompt">#</span> <span class="cmt">Перевірити</span>
<span class="prompt">$</span> <span class="cmd">node -v</span>                   <span class="cmt">— має показати v18+</span>`,
        isInstallCmd: false,
      },
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
      'Installa i prerequisiti, scegli un template e inizia.',
    steps: [
      {
        title: 'Installa i prerequisiti',
        text: 'Servono Node.js 18+ e un editor AI compatibile con MCP. L\'esempio sotto usa Claude Code; Codex e OpenCode sono anch\'essi supportati.',
        code: `<span class="prompt">#</span> <span class="cmt">Installa Node.js (se non lo hai)</span>
<span class="prompt">$</span> <span class="cmd">brew install node</span>          <span class="cmt">— macOS (o scarica da nodejs.org)</span>

<span class="prompt">#</span> <span class="cmt">Installa un editor AI (scegline uno)</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @anthropic-ai/claude-code</span>  <span class="cmt">— Claude Code</span>
<span class="prompt">$</span> <span class="cmd">npm install -g @openai/codex</span>              <span class="cmt">— Codex</span>
<span class="prompt">$</span> <span class="cmd">go install github.com/opencode-ai/opencode@latest</span> <span class="cmt">— OpenCode</span>

<span class="prompt">#</span> <span class="cmt">Verifica</span>
<span class="prompt">$</span> <span class="cmd">node -v</span>                   <span class="cmt">— dovrebbe mostrare v18+</span>`,
        isInstallCmd: false,
      },
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
