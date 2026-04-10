import type { Locale } from '../types';

export const homeContent = (locale: Locale) => content[locale];

const content: Record<Locale, HomeContent> = {
  en: {
    heroTitle:
      'The open-source <span class="accent-amber">engine</span> for agents that <span class="accent-teal">learn</span>.',
    heroText:
      'Build a personal dev assistant or ship agents to your users. Same engine. Your rules.',
    principleTitle: 'Zero memory. Every time.',
    principleSubtitle: 'Soleri agents don\'t.',
    principleText: 'You explain the architecture. Again. The naming conventions. Again. The thing you fixed last Tuesday. Again. Soleri agents capture what works and use it next time — without you asking.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: `<span class="dim">// Session 1</span>
<span class="hl">You:</span>     Learn this project.
<span class="hl">Soleri:</span>  On it. I'll go through the codebase and
         remember how everything is structured.

<span class="dim">// Session 2</span>
<span class="hl">You:</span>     Add a new billing event type.
<span class="hl">Soleri:</span>  Sure. You already have a pattern for events —
         I'll put the type here, the handler there,
         and wire it up the same way.`,
    howTitle: 'Modular by design. Plain files. One command.',
    howText:
      'Your setup, your rules. Share what helps — nothing more.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Modular by design.',
        title: 'A modular engine, not a monolith',
        text: 'Some agents need the full stack — vault, brain, curator, planner, governance. Others just need persistent memory and an LLM client. Enable what you need. Skip what you don\'t. The engine scales from a personal assistant to a product serving thousands of users.',
        code: `<span class="cmt"># agent.yaml — enable what you need</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">engine:</span>
  <span class="key">vault:</span> <span class="val">true</span>       <span class="cmt"># persistent memory</span>
  <span class="key">brain:</span> <span class="val">true</span>       <span class="cmt"># tracks what works</span>
  <span class="key">curator:</span> <span class="val">false</span>    <span class="cmt"># skip quality gates</span>
  <span class="key">planner:</span> <span class="val">false</span>    <span class="cmt"># skip orchestration</span>`,
      },
      {
        sectionTitle: 'Plain files. No build step.',
        title: 'Your agent is plain files',
        text: 'No build step. No TypeScript project. Your agent is a folder with a YAML config, instructions in markdown, and skills that plug in. The engine handles persistence, search, learning, and planning underneath.',
        code: `<span class="key">my-agent/</span>              <span class="cmt"># your agent is a folder</span>
├── <span class="ok">CLAUDE.md</span>           <span class="cmt"># The Map — routes tasks</span>
├── <span class="ok">agent.yaml</span>          <span class="cmt"># identity + config</span>
├── <span class="key">instructions/</span>
│   └── <span class="ok">user.md</span>         <span class="cmt"># your rules (priority)</span>
├── <span class="key">workspaces/</span>
│   ├── <span class="key">scripts/</span>
│   │   └── <span class="ok">CONTEXT.md</span>  <span class="cmt"># Room: what happens here</span>
│   └── <span class="key">production/</span>
│       └── <span class="ok">CONTEXT.md</span>  <span class="cmt"># Room: different context</span>
├── <span class="key">skills/</span>             <span class="cmt"># Tools: 7 essential</span>
└── .mcp.json           <span class="cmt"># connects to the engine</span>`,
      },
      {
        sectionTitle: 'One command.',
        title: 'One command. Start building.',
        text: 'Name it, pick what engine features you need, and start working. The scaffold gives you everything to customize. Your agent learns the rest from your projects.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">What should your agent be called?</span> <span class="val">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Persona:</span> <span class="val">Italian Craftsperson (default)</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(28 files, 7 skills, 4 workflows)</span>`,
      },
    ],
    cardsTitle: 'From personal tool to shipped product.',
    cards: [
      {
        title: 'Personal Agent',
        domain: 'For yourself',
        cls: 'salvador',
        capabilities: ['Codebase memory', 'Pattern capture', 'Plan surfacing', 'Session learning'],
        ships: 'The agent that knows your project better than you do.',
      },
      {
        title: 'Team Agent',
        domain: 'For your team',
        cls: 'gaudi',
        capabilities: [
          'Shared standards',
          'Review patterns',
          'Fast onboarding',
          'Git-synced knowledge',
        ],
        ships: 'Everyone gets an agent. Knowledge stays in sync.',
      },
      {
        title: 'Product Agent',
        domain: 'For your users',
        cls: 'sentinel',
        capabilities: [
          'Per-user memory',
          'Domain packs',
          'Custom ops',
          'Scales to thousands',
        ],
        ships: 'Ship agents to your users — each with their own memory.',
      },
    ],
    terminalTitle: 'Quick start',
    terminalCode: `<span class="comment"># Create your agent</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment">  ✓ Agent created (28 files, 7 skills, 4 workflows)</span>

<span class="comment"># Register and run</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># register MCP server</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># run engine + watch files</span>

<span class="comment">  ✓ MCP config registered</span>
<span class="comment">  ✓ CLAUDE.md regenerates on change</span>`,
    archTitle: '75/20/5 — The model is 5%. The engine is everything else.',
    archSubtitle: 'Most AI tools are wrappers around an API call. Soleri is the other 95% — the orchestration, persistence, and learning that make the 5% reliable.',
    layers: [
      {
        label: 'Vault',
        text: 'Persistent memory that compounds across sessions. SQLite-based, local-first, searchable. Your agent\'s long-term memory.',
      },
      {
        label: 'Brain',
        text: 'Tracks which patterns work and which don\'t. Surfaces the right knowledge at the right time. Gets sharper with use.',
      },
      {
        label: 'Curator',
        text: 'Deduplicates, grooms, detects contradictions. Keeps the vault clean so search stays useful as knowledge grows.',
      },
      {
        label: 'Planner',
        text: 'Breaks work into tasks, grades plans, tracks execution, reconciles drift. The orchestration layer that turns intent into action.',
      },
    ],
  },
  uk: {
    heroTitle:
      'Побудуй <span class="accent-amber">другий мозок</span>, який <span class="accent-teal">пам\'ятає</span> все і <span class="accent-green">розумнішає</span> з часом.',
    heroText:
      'Soleri створює твого агента. Він зберігає те, що вивчив. Продовжує з того місця, де ти зупинився.',
    principleTitle: 'Вивчає ваш проєкт.',
    principleSubtitle: 'Навчи один раз — працюй завжди',
    principleText: 'Скажіть агенту вивчити кодову базу. Він запам\'ятає структуру, патерни та конвенції — і використовуватиме їх у кожній наступній сесії.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: `<span class="dim">// Сесія 1</span>
<span class="hl">Ти:</span>      Вивчи цей проєкт.
<span class="hl">Soleri:</span>  Вже на цьому. Пройдуся по кодовій базі
         і запам'ятаю як все влаштовано.

<span class="dim">// Сесія 2</span>
<span class="hl">Ти:</span>      Додай новий тип події для білінгу.
<span class="hl">Soleri:</span>  Звісно. У вас вже є патерн для подій —
         поставлю тип сюди, хендлер туди,
         і підключу так само.`,
    howTitle: 'Твій другий мозок.<br/>Завжди навчається.<br/>Ніколи не забуває.',
    howText:
      'Твої налаштування, твої правила. Діліся тим, що допомагає — і нічим більше.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Персональний, коли потрібно.',
        title: 'Один агент, багато доменів',
        text: 'Тримайте одного асистента і дозвольте йому охоплювати домени, з якими ви працюєте. Особисті вподобання залишаються локальними; спільні знання підключаються за потреби.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">ernesto</span>
<span class="key">name:</span> <span class="val">Ernesto</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, operations]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">vaults:</span>
  - <span class="key">name:</span> <span class="val">team-standards</span>
    <span class="key">path:</span> <span class="val">/vaults/team-standards.db</span>
    <span class="key">priority:</span> <span class="val">0.6</span>`,
      },
      {
        sectionTitle: 'Відкритий за задумом.',
        title: 'Тека, яку редактор може прочитати',
        text: 'Визначення агента живе у звичайних файлах. Рушій забезпечує збереження, пошук та навчання.',
        code: `<span class="key">my-agent/</span>            <span class="cmt"># агент — це тека</span>
├── <span class="ok">agent.yaml</span>        <span class="cmt"># ідентичність + конфіг рушія</span>
├── <span class="key">instructions/</span>     <span class="cmt"># правила поведінки</span>
├── <span class="key">workflows/</span>        <span class="cmt"># повторювані плейбуки</span>
├── <span class="key">knowledge/</span>        <span class="cmt"># доменні знання</span>
├── <span class="key">skills/</span>           <span class="cmt"># додаткові навички</span>
└── .mcp.json         <span class="cmt"># підключення до рушія</span>`,
      },
      {
        sectionTitle: 'Спільний, коли це допомагає.',
        title: 'Додай більше експертизи',
        text: 'Використовуйте пакети та підключені сховища для додавання спільних стандартів, плейбуків або командних знань без перебудови кожного агента.',
        code: `<span class="cmt">$ npx @soleri/cli pack list</span>
<span class="ok">2 pack(s) installed:</span>
  team-standards@0.2.0     <span class="cmt">knowledge [local]</span>
  review-rules@1.1.0       <span class="cmt">knowledge [npm]</span>

<span class="cmt">$ npx @soleri/cli pack install ../team-standards</span>
<span class="ok">✓</span> Installed team-standards@0.2.0 <span class="cmt">(knowledge)</span>`,
      },
    ],
    cardsTitle: 'Один агент. Особисті, проєктні та командні знання.',
    cards: [
      {
        title: 'Особисті',
        domain: 'Твій комп\u0027ютер',
        cls: 'salvador',
        capabilities: ['Ваші вподобання', 'Повторювані виправлення', 'Стиль роботи', 'Приватні нотатки'],
        ships: 'Збережіть те, що має залишатися тільки вашим.',
      },
      {
        title: 'Проєктні',
        domain: 'Цей репо',
        cls: 'gaudi',
        capabilities: [
          'Правила проєкту',
          'Архітектурні рішення',
          'Спільні плейбуки',
          'Нещодавній контекст',
        ],
        ships: 'Підключіть знання, корисні для цієї кодової бази.',
      },
      {
        title: 'Командні',
        domain: 'Між репо',
        cls: 'sentinel',
        capabilities: ['Спільні стандарти', "Патерни рев'ю", 'Пакети для повторного використання', 'Промотовані знання'],
        ships: 'Діліться корисним без підтримки окремого стеку для кожного.',
      },
    ],
    terminalTitle: 'Швидкий старт',
    terminalCode: `<span class="comment"># Створіть теку агента</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment"># або: npx @soleri/cli create my-agent</span>

<span class="comment"># У новій теці</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># реєстрація MCP-сервера</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># запуск рушія + спостереження за файлами</span>

<span class="comment">  ✓ Теку агента створено</span>
<span class="comment">  ✓ MCP конфіг зареєстровано</span>
<span class="comment">  ✓ CLAUDE.md перегенеровується при змінах</span>
<span class="comment">  ✓ Токен Claude Code знайдено (якщо доступний)</span>`,
    archTitle: 'Два шари, чітко розділені',
    archSubtitle: 'Тека агента — це оболонка. Рушій знань — це мозок. Вони розвиваються незалежно.',
    layers: [
      {
        label: 'Тека агента',
        text: 'Прості файли: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Ваш AI-редактор читає їх напряму. Без TypeScript, без збірки.',
      },
      {
        label: 'Доменні пакети',
        text: "Підключувані модулі експертизи. Додавай дизайн-системи, код-рев'ю або власні домени без зміни теки агента.",
      },
      {
        label: 'Рушій знань',
        text: "Один MCP-сервер (<code>@soleri/core</code>). Сховище, Brain, Куратор, Планувальник, Пам'ять. Персистентний стан та навчання. Усі агенти використовують один рушій.",
      },
      {
        label: 'Транспорти',
        text: 'MCP (stdio) для будь-якого AI-редактора. HTTP/SSE для дашбордів. WebSocket для стримінгу. Telegram для розмовного доступу.',
      },
    ],
  },
  it: {
    heroTitle:
      'Costruisci un <span class="accent-amber">secondo cervello</span> che <span class="accent-teal">ricorda</span> tutto e <span class="accent-green">diventa più intelligente</span> nel tempo.',
    heroText:
      'Soleri crea il tuo agente. Conserva ciò che impara. Riprende da dove avevi lasciato.',
    principleTitle: 'Impara il tuo progetto.',
    principleSubtitle: 'Insegna una volta, lavora per sempre',
    principleText: 'Dì al tuo agente di imparare la codebase. Cattura la struttura, i pattern e le convenzioni — e li usa in ogni sessione successiva.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: `<span class="dim">// Sessione 1</span>
<span class="hl">Tu:</span>      Impara questo progetto.
<span class="hl">Soleri:</span>  Ci penso io. Analizzo la codebase e
         mi ricordo come è strutturato tutto.

<span class="dim">// Sessione 2</span>
<span class="hl">Tu:</span>      Aggiungi un nuovo tipo di evento billing.
<span class="hl">Soleri:</span>  Certo. Avete già un pattern per gli eventi —
         metto il tipo qui, l'handler lì,
         e lo collego allo stesso modo.`,
    howTitle: 'Il tuo secondo cervello.<br/>Sempre in apprendimento.<br/>Non dimentica mai.',
    howText:
      'Le tue impostazioni, le tue regole. Condividi ciò che aiuta — niente di più.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Personale quando serve.',
        title: 'Un agente, molti domini',
        text: 'Tieni un solo assistente e lascialo coprire i domini che il tuo lavoro tocca davvero. Le preferenze personali restano locali; la conoscenza condivisa si collega quando serve.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">ernesto</span>
<span class="key">name:</span> <span class="val">Ernesto</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, operations]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">vaults:</span>
  - <span class="key">name:</span> <span class="val">team-standards</span>
    <span class="key">path:</span> <span class="val">/vaults/team-standards.db</span>
    <span class="key">priority:</span> <span class="val">0.6</span>`,
      },
      {
        sectionTitle: 'Aperto per design.',
        title: 'Una cartella leggibile dal tuo editor',
        text: 'La definizione dell\'agente vive in file semplici. Il motore gestisce persistenza, ricerca e apprendimento.',
        code: `<span class="key">my-agent/</span>            <span class="cmt"># l'agente è una cartella</span>
├── <span class="ok">agent.yaml</span>        <span class="cmt"># identità + config motore</span>
├── <span class="key">instructions/</span>     <span class="cmt"># regole comportamentali</span>
├── <span class="key">workflows/</span>        <span class="cmt"># playbook ripetibili</span>
├── <span class="key">knowledge/</span>        <span class="cmt"># intelligenza di dominio</span>
├── <span class="key">skills/</span>           <span class="cmt"># skill opzionali</span>
└── .mcp.json         <span class="cmt"># connessione al motore</span>`,
      },
      {
        sectionTitle: 'Condiviso quando aiuta.',
        title: 'Aggiungi più competenza',
        text: 'Usa pack e vault collegati per aggiungere standard condivisi, playbook riutilizzabili o conoscenza di team senza ricostruire ogni agente.',
        code: `<span class="cmt">$ npx @soleri/cli pack list</span>
<span class="ok">2 pack(s) installed:</span>
  team-standards@0.2.0     <span class="cmt">knowledge [local]</span>
  review-rules@1.1.0       <span class="cmt">knowledge [npm]</span>

<span class="cmt">$ npx @soleri/cli pack install ../team-standards</span>
<span class="ok">✓</span> Installed team-standards@0.2.0 <span class="cmt">(knowledge)</span>`,
      },
    ],
    cardsTitle: 'Un agente. Conoscenza personale, di progetto e di team.',
    cards: [
      {
        title: 'Personale',
        domain: 'La tua macchina',
        cls: 'salvador',
        capabilities: ['Le tue preferenze', 'Fix ricorrenti', 'Stile di lavoro', 'Note private'],
        ships: 'Tieni le parti dell\'agente che devono restare solo tue.',
      },
      {
        title: 'Progetto',
        domain: 'Questo repo',
        cls: 'gaudi',
        capabilities: ['Regole di progetto', 'Decisioni architetturali', 'Playbook condivisi', 'Contesto recente'],
        ships: 'Collega la conoscenza utile per questa codebase.',
      },
      {
        title: 'Team',
        domain: 'Tra i repo',
        cls: 'sentinel',
        capabilities: ['Standard comuni', 'Pattern di revisione', 'Pack riutilizzabili', 'Apprendimenti promossi'],
        ships: 'Condividi ciò che aiuta senza mantenere uno stack personalizzato per ogni collega.',
      },
    ],
    terminalTitle: 'Avvio rapido',
    terminalCode: `<span class="comment"># Crea la cartella dell'agente</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment"># oppure: npx @soleri/cli create my-agent</span>

<span class="comment"># Nella nuova cartella</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># registra server MCP</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># avvia motore + osserva file</span>

<span class="comment">  ✓ Cartella agente pronta</span>
<span class="comment">  ✓ Config MCP registrata</span>
<span class="comment">  ✓ CLAUDE.md si rigenera ad ogni modifica</span>
<span class="comment">  ✓ Token Claude Code scoperto (se disponibile)</span>`,
    archTitle: 'Due livelli, nettamente separati',
    archSubtitle:
      "La cartella dell'agente è il guscio. Il motore di conoscenza è il cervello. Evolvono indipendentemente.",
    layers: [
      {
        label: 'Cartella agente',
        text: 'File semplici: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Il tuo editor AI li legge nativamente. Niente TypeScript, nessun build.',
      },
      {
        label: 'Pacchetti dominio',
        text: "Moduli di competenza collegabili. Aggiungi design system, code review o domini personalizzati senza modificare la cartella dell'agente.",
      },
      {
        label: 'Motore di conoscenza',
        text: 'Un unico server MCP (<code>@soleri/core</code>). Vault, Cervello, Curatore, Pianificatore, Memoria. Stato persistente e apprendimento. Tutti gli agenti condividono un motore.',
      },
      {
        label: 'Trasporti',
        text: 'MCP (stdio) per qualsiasi editor AI. HTTP/SSE per dashboard. WebSocket per streaming. Telegram per accesso conversazionale.',
      },
    ],
  },
};

interface HomeContent {
  heroTitle: string;
  heroText: string;
  principleTitle: string;
  principleSubtitle: string;
  principleText: string;
  compareBeforeLabel: string;
  compareAfterLabel: string;
  compareBefore: string;
  compareAfter: string;
  howTitle: string;
  howText: string;
  engineTags: string[];
  features: { sectionTitle: string; title: string; text: string; code: string }[];
  cardsTitle: string;
  cards: { title: string; domain: string; cls: string; capabilities: string[]; ships: string }[];
  terminalTitle: string;
  terminalCode: string;
  archTitle: string;
  archSubtitle: string;
  layers: { label: string; text: string }[];
}
