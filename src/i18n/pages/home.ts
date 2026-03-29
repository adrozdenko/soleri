import type { Locale } from '../types';

export const homeContent = (locale: Locale) => content[locale];

const content: Record<Locale, HomeContent> = {
  en: {
    heroTitle:
      'One <span class="accent-amber">agent</span> that <span class="accent-teal">remembers</span> how you work.',
    heroText:
      '75% orchestration. 20% infrastructure. 5% AI. The model is a tool, not the product. The knowledge engine is the product.',
    principleTitle: 'Learns your project.',
    principleSubtitle: 'Onboard once, work forever',
    principleText: 'Tell your agent to learn the codebase. It captures the structure, patterns, and conventions — then uses them in every session that follows.',
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
    howTitle: 'Your folders don\'t learn. Soleri does.<br/>Map. Rooms. Tools.<br/>Pick your starting point.',
    howText:
      'Your setup, your rules. Share what helps — nothing more.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Your folders don\'t learn. Soleri does.',
        title: 'Memory that compounds',
        text: 'Manual setups start from zero every session. Soleri\'s vault captures patterns, the brain tracks what works, and memory persists across sessions and projects. Knowledge compounds — it never resets.',
        code: `<span class="cmt"># Your agent remembers across sessions</span>
<span class="cmt"># agent.yaml</span>
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
        sectionTitle: 'Map. Rooms. Tools.',
        title: 'Three layers, instantly clear',
        text: 'The Map routes every task to the right workspace. Each Room has its own context. Tools plug in per workspace, not globally. Different tasks load different context — automatically.',
        code: `<span class="key">my-agent/</span>
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
        sectionTitle: 'Pick your starting point.',
        title: 'Five agents, ready to fork',
        text: 'Content creator, freelancer, developer, researcher, or business operator. Each starter agent comes with domain-specific workspaces, routing tables, and instructions. Clone one, customize it, ship.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span>

<span class="dim">? Pick a template:</span>
  <span class="ok">❯ Muse</span>       <span class="cmt">— content creation</span>
    <span class="val">Atlas</span>      <span class="cmt">— freelance & consulting</span>
    <span class="val">Forge</span>      <span class="cmt">— software development</span>
    <span class="val">Sage</span>       <span class="cmt">— research & academic</span>
    <span class="val">Compass</span>    <span class="cmt">— business operations</span>
    <span class="val">Blank</span>      <span class="cmt">— start from scratch</span>`,
      },
    ],
    cardsTitle: 'One agent. Personal, project, and team knowledge.',
    cards: [
      {
        title: 'Personal',
        domain: 'Your machine',
        cls: 'salvador',
        capabilities: ['Your preferences', 'Recurring fixes', 'Working style', 'Private notes'],
        ships: 'Keep the parts of the agent that should stay yours.',
      },
      {
        title: 'Project',
        domain: 'This repo',
        cls: 'gaudi',
        capabilities: [
          'Project rules',
          'Architecture decisions',
          'Shared playbooks',
          'Recent context',
        ],
        ships: 'Link the knowledge that helps on this codebase.',
      },
      {
        title: 'Team',
        domain: 'Across repos',
        cls: 'sentinel',
        capabilities: [
          'Common standards',
          'Review patterns',
          'Reusable packs',
          'Promoted learnings',
        ],
        ships: 'Share what helps without maintaining a custom stack for each teammate.',
      },
    ],
    terminalTitle: 'Quick start',
    terminalCode: `<span class="comment"># Create from a template</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="dim">? Pick a template: Forge (software development)</span>

<span class="comment"># Register and run</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># register MCP server</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># run engine + watch files</span>

<span class="comment">  ✓ Agent folder ready (7 skills, 3 workspaces)</span>
<span class="comment">  ✓ MCP config registered</span>
<span class="comment">  ✓ CLAUDE.md regenerates on change</span>`,
    archTitle: '75/20/5 — The engine behind the folder',
    archSubtitle: '75% orchestration. 20% infrastructure. 5% AI calls. The model is a tool. The knowledge engine is the product.',
    layers: [
      {
        label: 'The Map',
        text: 'CLAUDE.md routes every task to the right workspace. One file at the root, generated from your agent.yaml and instructions.',
      },
      {
        label: 'The Rooms',
        text: 'Each workspace has its own CONTEXT.md describing what happens there. Different tasks load different context — clean input, clean output.',
      },
      {
        label: 'The Tools',
        text: 'Skills and knowledge packs plug in per workspace. Seven essential skills ship by default. Add more as you grow.',
      },
      {
        label: 'The Engine',
        text: 'Vault, Brain, Curator, Planner, Memory. 75% orchestration that makes the 5% AI reliable. Everything stays on your machine.',
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
