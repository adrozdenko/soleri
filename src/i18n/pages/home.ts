import type { Locale } from '../types';

export const homeContent = (locale: Locale) => content[locale];

const content: Record<Locale, HomeContent> = {
  en: {
    heroTitle:
      'One <span class="accent-amber">agent</span> that <span class="accent-teal">remembers</span> how you work.',
    heroText:
      'Soleri gives your AI assistant a persistent, open-source second brain so your standards, decisions, and workflows do not reset every session.',
    principleTitle: 'Your experience should compound, not start over.',
    compareBeforeLabel: 'Without memory',
    compareAfterLabel: 'With Soleri',
    compareBefore: `<span class="dim">// Session 1</span>
<span class="warn">You:</span> API errors always return { error, code, details }.
<span class="warn">AI:</span>  Got it. I will follow that.

<span class="dim">// Session 2 — next day</span>
<span class="warn">You:</span> Why did this route return a plain string again?
<span class="warn">AI:</span>  Sorry, can you remind me of the error format?

<span class="dim">// Same project, same explanation, again</span>`,
    compareAfter: `<span class="dim">// Session 1</span>
<span class="hl">You:</span> API errors always return { error, code, details }.
<span class="hl">AI:</span>  Captured to the vault. I will reuse it.

<span class="dim">// Session 14</span>
<span class="hl">You:</span> Review this endpoint.
<span class="hl">AI:</span>  <span class="ok">✓ Session briefing: 1 linked project, 2 relevant patterns</span>
      Response shape drift detected in <span class="val">users/create</span>.
      <span class="ok">✓ Reused project rule from the vault</span>
      <span class="ok">✓ Suggested the shared playbook for API review</span>`,
    howTitle: 'Personal when it should be.<br/>Shared when it helps.<br/>Open by design.',
    howText:
      'A file-tree agent your editor can read, a vault that keeps patterns and playbooks, optional shared knowledge for projects and teams, and an engine that improves recommendations over time.',
    engineTags: ['File tree', 'Vault', 'Playbooks', 'Shared knowledge'],
    features: [
      {
        title: 'One agent, many domains',
        text: 'Keep one assistant and let it span the domains your work actually touches. Personal preferences stay local; shared knowledge can be linked in when needed.',
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
        title: 'A folder your editor can read',
        text: 'The agent definition lives in plain files. The engine handles persistence, search, and learning.',
        code: `<span class="key">my-agent/</span>            <span class="cmt"># the agent is a folder</span>
├── <span class="ok">agent.yaml</span>        <span class="cmt"># identity + engine config</span>
├── <span class="key">instructions/</span>     <span class="cmt"># behavioral rules</span>
├── <span class="key">workflows/</span>        <span class="cmt"># repeatable playbooks</span>
├── <span class="key">knowledge/</span>        <span class="cmt"># domain bundles</span>
├── <span class="key">skills/</span>           <span class="cmt"># optional skills</span>
└── .mcp.json         <span class="cmt"># connects to the engine</span>`,
      },
      {
        title: 'Plug in more expertise',
        text: 'Use packs and linked vaults to add shared standards, reusable playbooks, or team knowledge without rebuilding every agent.',
        code: `<span class="cmt">$ npx @soleri/cli pack list</span>
<span class="ok">2 pack(s) installed:</span>
  team-standards@0.2.0     <span class="cmt">knowledge [local]</span>
  review-rules@1.1.0       <span class="cmt">knowledge [npm]</span>

<span class="cmt">$ npx @soleri/cli pack install ../team-standards</span>
<span class="ok">✓</span> Installed team-standards@0.2.0 <span class="cmt">(knowledge)</span>`,
      },
    ],
    cardsTitle: 'One agent. Personal, project, and team knowledge.',
    cards: [
      {
        title: 'Personal',
        domain: 'Scope',
        cls: 'salvador',
        capabilities: ['Your preferences', 'Recurring fixes', 'Working style', 'Private notes'],
        ships: 'Keep the parts of the agent that should stay yours.',
      },
      {
        title: 'Project',
        domain: 'Scope',
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
        domain: 'Scope',
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
    terminalCode: `<span class="comment"># Create the agent folder</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment"># or: npx @soleri/cli create my-agent</span>

<span class="comment"># In the new folder</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># register MCP server</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># run engine + watch files</span>

<span class="comment">  ✓ Agent folder ready</span>
<span class="comment">  ✓ MCP config registered</span>
<span class="comment">  ✓ CLAUDE.md regenerates on change</span>
<span class="comment">  ✓ Claude Code token discovered (if available)</span>`,
    archTitle: 'Two layers, one maintainable setup',
    archSubtitle: 'The folder defines the agent. The engine handles persistence and learning.',
    layers: [
      {
        label: 'Agent Folder',
        text: 'Plain files: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Your editor can read them directly.',
      },
      {
        label: 'Connected Knowledge',
        text: 'Link personal, project, or team knowledge where it helps. Packs and shared vaults stay optional.',
      },
      {
        label: 'Knowledge Engine',
        text: 'A single engine keeps the vault, playbooks, session context, and learning loop persistent across sessions.',
      },
      {
        label: 'Transports',
        text: 'MCP for coding editors, plus HTTP/SSE and WebSocket transports in core when you need them.',
      },
    ],
  },
  uk: {
    heroTitle:
      'Побудуй <span class="accent-amber">другий мозок</span>, який <span class="accent-teal">пам\'ятає</span> все і <span class="accent-green">розумнішає</span> з часом.',
    heroText:
      'Твої знання, структуровані та пошукові. Контекст, що накопичується з кожною сесією, кожним проєктом.',
    principleTitle: 'Твоя експертиза має накопичуватися — а не випаровуватися.',
    compareBeforeLabel: "Без пам'яті",
    compareAfterLabel: 'Із Soleri',
    compareBefore: `<span class="dim">// Сесія 1</span>
<span class="warn">Ти:</span> Ми використовуємо Tailwind із семантичними токенами,
      ніколи — сирі hex. Базовий крок відступів — 4px.
<span class="warn">AI:</span>  Зрозуміло! Я цього дотримуватимуся.

<span class="dim">// Сесія 2 — наступного дня</span>
<span class="warn">Ти:</span> Чому ти знову використав #3B82F6?
<span class="warn">AI:</span>  Вибач, можеш нагадати мені
      твої домовленості щодо кольорів?

<span class="dim">// Сесія 47 — те саме питання, знову</span>`,
    compareAfter: `<span class="dim">// Сесія 1</span>
<span class="hl">Ти:</span> Ми використовуємо Tailwind із семантичними токенами.
<span class="hl">AI:</span>  Збережено у сховищі. Я це проконтролюю.

<span class="dim">// Сесія 47</span>
<span class="hl">Ти:</span> Переглянь цей компонент.
<span class="hl">AI:</span>  Знайдено 2 сирі hex-значення. У твоєму сховищі зазначено:
      лише семантичні токени. Виправляю.
      <span class="ok">✓ Шаблон застосовано зі сховища</span>
      <span class="ok">✓ Brain strength: 94% (12 сесій)</span>`,
    howTitle: 'Твій другий мозок.<br/>Завжди навчається.<br/>Ніколи не забуває.',
    howText:
      "<strong>Сховище</strong> для довготривалої пам'яті, <strong>Brain</strong> для навчання того, що працює, <strong>Memory</strong> що переноситься між сесіями та проєктами. Годуй знаннями — вони накопичуються.",
    engineTags: ['Файлова тека', 'Сховище', 'Плейбуки', 'Спільні знання'],
    features: [
      {
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
        domain: 'Масштаб',
        cls: 'salvador',
        capabilities: ['Ваші вподобання', 'Повторювані виправлення', 'Стиль роботи', 'Приватні нотатки'],
        ships: 'Збережіть те, що має залишатися тільки вашим.',
      },
      {
        title: 'Проєктні',
        domain: 'Масштаб',
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
        domain: 'Масштаб',
        cls: 'sentinel',
        capabilities: ['Спільні стандарти', "Патерни рев'ю", 'Пакети для повторного використання', 'Промотовані знання'],
        ships: 'Діліться корисним без підтримки окремого стеку для кожного.',
      },
    ],
    terminalTitle: 'Термінал',
    terminalCode: `<span class="comment"># Створення файлового агента (~3 секунди)</span>
<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="comment">  ✓ Створено agent.yaml</span>
<span class="comment">  ✓ Згенеровано instructions/, workflows/, knowledge/</span>
<span class="comment">  ✓ Автоматично зібрано CLAUDE.md</span>
<span class="comment">  ✓ Готово — без етапу збірки</span>

<span class="comment"># Реєстрація та старт розробки</span>
<span class="prompt">$</span> <span class="cmd">soleri install</span>            <span class="comment"># реєстрація MCP-сервера</span>
<span class="prompt">$</span> <span class="cmd">soleri dev</span>                <span class="comment"># запуск рушія + спостереження за файлами</span>

<span class="comment"># Додайте ще знань</span>
<span class="prompt">$</span> <span class="cmd">soleri pack</span> <span class="arg">install community/react-patterns</span>`,
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
      'La tua conoscenza, strutturata e ricercabile. Contesto che si accumula in ogni sessione, ogni progetto.',
    principleTitle: 'La tua competenza dovrebbe accumularsi, non evaporare.',
    compareBeforeLabel: 'Senza memoria',
    compareAfterLabel: 'Con Soleri',
    compareBefore: `<span class="dim">// Sessione 1</span>
<span class="warn">Tu:</span> Usiamo Tailwind con token semantici, mai esadecimale puro. Lo spazio è base 4px.
<span class="warn">AI:</span> Capito! Seguirò questo.

<span class="dim">// Sessione 2 — il giorno seguente</span>
<span class="warn">Tu:</span> Perché hai usato di nuovo #3B82F6?
<span class="warn">AI:</span> Scusa, puoi ricordarmi le tue convenzioni sui colori?

<span class="dim">// Sessione 47 — stessa domanda, ancora una volta</span>`,
    compareAfter: `<span class="dim">// Sessione 1</span>
<span class="hl">Tu:</span> Usiamo Tailwind con token semantici.
<span class="hl">AI:</span> Salvato nel Vault. D'ora in poi applicherò questa regola.

<span class="dim">// Sessione 47</span>
<span class="hl">Tu:</span> Rivedi questo componente.
<span class="hl">AI:</span> Ho trovato 2 valori esadecimali grezzi. Il Vault dice: solo token semantici. Correggo subito.
      <span class="ok">✓ Pattern applicato dal Vault</span>
      <span class="ok">✓ Brain strength: 94% (12 sessioni)</span>`,
    howTitle: 'Il tuo secondo cervello.<br/>Sempre in apprendimento.<br/>Non dimentica mai.',
    howText:
      'Un <strong>Vault</strong> per la memoria a lungo termine, un <strong>Cervello</strong> che impara cosa funziona, una <strong>Memoria</strong> che si mantiene tra sessioni e progetti. Dagli conoscenza — si accumula.',
    engineTags: ['File tree', 'Vault', 'Playbook', 'Conoscenza condivisa'],
    features: [
      {
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
        domain: 'Ambito',
        cls: 'salvador',
        capabilities: ['Le tue preferenze', 'Fix ricorrenti', 'Stile di lavoro', 'Note private'],
        ships: 'Tieni le parti dell\'agente che devono restare solo tue.',
      },
      {
        title: 'Progetto',
        domain: 'Ambito',
        cls: 'gaudi',
        capabilities: ['Regole di progetto', 'Decisioni architetturali', 'Playbook condivisi', 'Contesto recente'],
        ships: 'Collega la conoscenza utile per questa codebase.',
      },
      {
        title: 'Team',
        domain: 'Ambito',
        cls: 'sentinel',
        capabilities: ['Standard comuni', 'Pattern di revisione', 'Pack riutilizzabili', 'Apprendimenti promossi'],
        ships: 'Condividi ciò che aiuta senza mantenere uno stack personalizzato per ogni collega.',
      },
    ],
    terminalTitle: 'Terminale',
    terminalCode: `<span class="comment"># Crea un agente file-tree (~3 secondi)</span>
<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="comment">  ✓ Creato agent.yaml</span>
<span class="comment">  ✓ Generati instructions/, workflows/, knowledge/</span>
<span class="comment">  ✓ CLAUDE.md composto automaticamente</span>
<span class="comment">  ✓ Pronto — nessun passaggio di build</span>

<span class="comment"># Registra e inizia a sviluppare</span>
<span class="prompt">$</span> <span class="cmd">soleri install</span>            <span class="comment"># registra server MCP</span>
<span class="prompt">$</span> <span class="cmd">soleri dev</span>                <span class="comment"># avvia motore + osserva file</span>

<span class="comment"># Alimentalo con più conoscenza</span>
<span class="prompt">$</span> <span class="cmd">soleri pack</span> <span class="arg">install community/react-patterns</span>`,
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
  compareBeforeLabel: string;
  compareAfterLabel: string;
  compareBefore: string;
  compareAfter: string;
  howTitle: string;
  howText: string;
  engineTags: string[];
  features: { title: string; text: string; code: string }[];
  cardsTitle: string;
  cards: { title: string; domain: string; cls: string; capabilities: string[]; ships: string }[];
  terminalTitle: string;
  terminalCode: string;
  archTitle: string;
  archSubtitle: string;
  layers: { label: string; text: string }[];
}
