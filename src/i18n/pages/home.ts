import type { Locale } from '../types';

export const homeContent = (locale: Locale) => content[locale];

const content: Record<Locale, HomeContent> = {
  en: {
    heroTitle:
      'The open-source <span class="accent-amber">engine</span> for agents that <span class="accent-teal">learn</span>.',
    heroText:
      'Soleri handles what the model can\'t: remembering what worked, planning what\'s next, and getting better over time. Build a personal agent or ship one to your users.',
    principleTitle: 'What if your agent actually remembered?',
    principleSubtitle: 'That\'s the problem we built Soleri to solve.',
    principleText: 'You walk it through the architecture. The naming conventions. That bug you fixed last Tuesday. Next session, all of it is gone. Soleri gives your agent the systems to hold onto what works, learn from it, and bring it back without you repeating yourself.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: '',
    howTitle: 'Pick what you need. It\'s all plain files. One command to start.',
    howText:
      'You own every file. Share what\'s useful, keep the rest to yourself.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Use what you need.',
        title: 'Turn on what matters, skip the rest',
        text: 'Maybe you want everything: knowledge storage, scoring, cleanup, structured planning, governance. Maybe you just need a vault and a brain. Either way, you pick. Works for a weekend project or a product with thousands of users.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[typescript, react, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">profile:</span> <span class="val">full</span>      <span class="cmt"># full | standard | minimal</span>
  <span class="key">learning:</span> <span class="val">true</span>    <span class="cmt"># vault + brain active</span>`,
      },
      {
        sectionTitle: 'Just a folder.',
        title: 'Your agent is a folder',
        text: 'No build step. No TypeScript. It\'s a folder with a YAML config, markdown instructions, and skills that plug in. The engine takes care of persistence, search, learning, and orchestration.',
        code: `<span class="key">my-agent/</span>              <span class="cmt"># your agent is a folder</span>
├── <span class="ok">CLAUDE.md</span>           <span class="cmt"># auto-generated, routes tasks</span>
├── <span class="ok">agent.yaml</span>          <span class="cmt"># identity + engine config</span>
├── <span class="key">instructions/</span>       <span class="cmt"># behavioral rules</span>
├── <span class="key">workflows/</span>          <span class="cmt"># 4 built-in playbooks</span>
├── <span class="key">flows/</span>              <span class="cmt"># 8 intent-driven flows</span>
├── <span class="key">skills/</span>             <span class="cmt"># 7 essential skills</span>
├── <span class="key">knowledge/</span>          <span class="cmt"># domain-seeded knowledge</span>
├── <span class="key">workspaces/</span>         <span class="cmt"># per-context rooms</span>
└── <span class="ok">.mcp.json</span>           <span class="cmt"># connects to the engine</span>`,
      },
      {
        sectionTitle: 'One command.',
        title: 'One command to start.',
        text: 'Run it, name your agent, pick what you want turned on. You get a working folder ready to customize. The agent picks up everything else from your projects as you work.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">What should your agent be called?</span> <span class="val">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Persona:</span> <span class="val">Italian Craftsperson (default)</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(43 files, 7 skills, 4 workflows)</span>`,
      },
    ],
    cardsTitle: 'One engine. Three scales.',
    cards: [
      {
        title: 'Personal',
        domain: 'For yourself',
        cls: 'salvador',
        capabilities: ['Remembers your codebase', 'Saves what works', 'Resurfaces old decisions', 'Learns across sessions'],
        ships: 'Knows your project as well as you do.',
      },
      {
        title: 'Team',
        domain: 'For your team',
        cls: 'gaudi',
        capabilities: [
          'Shared conventions',
          'Review checklists',
          'Quick onboarding',
          'Synced through Git',
        ],
        ships: 'Everyone has their own agent. The knowledge stays shared.',
      },
      {
        title: 'Product',
        domain: 'For your users',
        cls: 'sentinel',
        capabilities: [
          'Separate memory per user',
          'Domain-specific knowledge',
          'Custom operations',
          'Handles scale',
        ],
        ships: 'Ship agents to your users, each with their own memory.',
      },
    ],
    terminalTitle: 'Quick start',
    terminalCode: `<span class="comment"># Create your agent</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment">  ✓ Agent created (43 files, 7 skills, 4 workflows)</span>

<span class="comment"># Register and run</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># register MCP server</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># run engine + watch files</span>

<span class="comment">  ✓ MCP config registered</span>
<span class="comment">  ✓ CLAUDE.md regenerates on change</span>`,
    archTitle: 'The model does 5% of the work. The engine does the rest.',
    archSubtitle: 'Most AI tools are thin wrappers around an API call. The model generates text. But who stores what worked? Who scores it? Who cleans up the mess when knowledge piles up? Who plans the work and tracks what drifted? That\'s the engine. That\'s Soleri.',
    layers: [
      {
        label: 'Vault',
        text: 'Where your agent\'s knowledge lives. Patterns, decisions, context. SQLite, local, searchable. Sticks around between sessions.',
      },
      {
        label: 'Brain',
        text: 'Keeps score. Tracks which approaches actually get used. The useful stuff ranks higher. The stale stuff fades out over time.',
      },
      {
        label: 'Curator',
        text: 'Catches duplicates, resolves contradictions, cleans up old entries. Keeps the vault useful as it grows instead of turning into a junk drawer.',
      },
      {
        label: 'Planner',
        text: 'Breaks work into steps, scores plans, tracks what got done, and flags when things went off track.',
      },
    ],
  },
  uk: {
    heroTitle:
      '<span class="accent-amber">Рушій</span> з відкритим кодом для агентів, що <span class="accent-teal">навчаються</span>.',
    heroText:
      'Soleri робить те, що модель не може: запам\'ятовує, що спрацювало, планує наступні кроки і стає кращим з часом. Створи персонального агента або вбудуй його у свій продукт.',
    principleTitle: 'А якби твій агент дійсно запам\'ятовував?',
    principleSubtitle: 'Саме для цього ми створили Soleri.',
    principleText: 'Ти пояснюєш йому архітектуру. Конвенції іменування. Той баг, який полагодив у вівторок. Наступна сесія, і все зникло. Soleri дає твоєму агенту системи, щоб тримати те, що працює, вчитися з цього і повертати це без твоїх повторень.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: '',
    howTitle: 'Обирай, що потрібно. Це все прості файли. Одна команда, щоб почати.',
    howText:
      'Ти володієш кожним файлом. Діліся корисним, решту залиш собі.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Використовуй те, що потрібно.',
        title: 'Увімкни потрібне, пропусти решту',
        text: 'Може, тобі треба все: зберігання знань, скоринг, очистку, структуроване планування, governance. А може, лише vault і brain. В будь-якому разі, ти обираєш. Працює і для проєкту на вихідні, і для продукту з тисячами користувачів.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[typescript, react, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">profile:</span> <span class="val">full</span>      <span class="cmt"># full | standard | minimal</span>
  <span class="key">learning:</span> <span class="val">true</span>    <span class="cmt"># vault + brain активні</span>`,
      },
      {
        sectionTitle: 'Просто тека.',
        title: 'Твій агент -- це тека',
        text: 'Без збірки. Без TypeScript. Це тека з YAML-конфігом, markdown-інструкціями та навичками, що підключаються. Рушій забезпечує збереження, пошук, навчання та оркестрацію.',
        code: `<span class="key">my-agent/</span>              <span class="cmt"># твій агент -- це тека</span>
├── <span class="ok">CLAUDE.md</span>           <span class="cmt"># авто-генерується, маршрутизує задачі</span>
├── <span class="ok">agent.yaml</span>          <span class="cmt"># ідентичність + конфіг рушія</span>
├── <span class="key">instructions/</span>       <span class="cmt"># правила поведінки</span>
├── <span class="key">workflows/</span>          <span class="cmt"># 4 вбудовані плейбуки</span>
├── <span class="key">flows/</span>              <span class="cmt"># 8 потоків за інтентами</span>
├── <span class="key">skills/</span>             <span class="cmt"># 7 базових навичок</span>
├── <span class="key">knowledge/</span>          <span class="cmt"># доменні знання</span>
├── <span class="key">workspaces/</span>         <span class="cmt"># кімнати контексту</span>
└── <span class="ok">.mcp.json</span>           <span class="cmt"># підключення до рушія</span>`,
      },
      {
        sectionTitle: 'Одна команда.',
        title: 'Одна команда, щоб почати.',
        text: 'Запусти, назви свого агента, обери, що хочеш увімкнути. Отримаєш робочу теку, готову до налаштування. Агент підхоплює все інше з твоїх проєктів під час роботи.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Як назвати твого агента?</span> <span class="val">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Персона:</span> <span class="val">Italian Craftsperson (default)</span>

<span class="ok">✓</span> Агента створено! <span class="cmt">(43 файли, 7 навичок, 4 робочі процеси)</span>`,
      },
    ],
    cardsTitle: 'Один рушій. Три масштаби.',
    cards: [
      {
        title: 'Персональний',
        domain: 'Для себе',
        cls: 'salvador',
        capabilities: ['Запам\'ятовує твою кодову базу', 'Зберігає те, що працює', 'Повертає старі рішення', 'Вчиться між сесіями'],
        ships: 'Знає твій проєкт так само добре, як ти.',
      },
      {
        title: 'Командний',
        domain: 'Для команди',
        cls: 'gaudi',
        capabilities: [
          'Спільні конвенції',
          'Чеклісти ревʼю',
          'Швидкий онбординг',
          'Синхронізація через Git',
        ],
        ships: 'У кожного свій агент. Знання залишаються спільними.',
      },
      {
        title: 'Продуктовий',
        domain: 'Для користувачів',
        cls: 'sentinel',
        capabilities: [
          'Окрема пам\'ять на користувача',
          'Доменні знання',
          'Кастомні операції',
          'Працює на масштабі',
        ],
        ships: 'Постав агентів своїм користувачам, кожного з власною пам\'яттю.',
      },
    ],
    terminalTitle: 'Швидкий старт',
    terminalCode: `<span class="comment"># Створи агента</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment">  ✓ Агента створено (43 файли, 7 навичок, 4 робочі процеси)</span>

<span class="comment"># Зареєструй і запусти</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># реєстрація MCP-сервера</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># запуск рушія + спостереження за файлами</span>

<span class="comment">  ✓ MCP конфіг зареєстровано</span>
<span class="comment">  ✓ CLAUDE.md перегенеровується при змінах</span>`,
    archTitle: 'Модель робить 5% роботи. Рушій робить решту.',
    archSubtitle: 'Більшість AI-інструментів -- це тонкі обгортки навколо API-виклику. Модель генерує текст. Але хто зберігає, що спрацювало? Хто це оцінює? Хто прибирає, коли знань стає забагато? Хто планує роботу і відстежує, що пішло не за планом? Це рушій. Це Soleri.',
    layers: [
      {
        label: 'Vault',
        text: 'Тут живуть знання твого агента. Патерни, рішення, контекст. SQLite, локально, з пошуком. Зберігається між сесіями.',
      },
      {
        label: 'Brain',
        text: 'Веде рахунок. Відстежує, які підходи дійсно використовуються. Корисне піднімається вище. Застаріле згасає з часом.',
      },
      {
        label: 'Curator',
        text: 'Ловить дублікати, вирішує протиріччя, чистить старі записи. Тримає vault корисним, поки він росте, замість того щоб перетворитися на звалище.',
      },
      {
        label: 'Planner',
        text: 'Розбиває роботу на кроки, оцінює плани, відстежує, що зроблено, і сигналізує, коли щось пішло не туди.',
      },
    ],
  },
  it: {
    heroTitle:
      'Il <span class="accent-amber">motore</span> open-source per agenti che <span class="accent-teal">imparano</span>.',
    heroText:
      'Soleri gestisce quello che il modello non può: ricordare cosa ha funzionato, pianificare il prossimo passo e migliorare nel tempo. Costruisci un agente personale o distribuiscine uno ai tuoi utenti.',
    principleTitle: 'E se il tuo agente si ricordasse davvero?',
    principleSubtitle: 'Questo è il problema per cui abbiamo costruito Soleri.',
    principleText: 'Gli spieghi l\'architettura. Le convenzioni di naming. Quel bug che hai fixato martedì scorso. Sessione dopo, tutto sparito. Soleri dà al tuo agente i sistemi per tenersi quello che funziona, imparare da quello, e riportarlo fuori senza che tu debba ripeterti.',
    compareBeforeLabel: '',
    compareAfterLabel: '',
    compareBefore: '',
    compareAfter: '',
    howTitle: 'Scegli quello che ti serve. Sono tutti file semplici. Un comando per iniziare.',
    howText:
      'Ogni file è tuo. Condividi quello che è utile, tieni il resto per te.',
    engineTags: [],
    features: [
      {
        sectionTitle: 'Usa quello che ti serve.',
        title: 'Attiva quello che conta, salta il resto',
        text: 'Magari vuoi tutto: storage della conoscenza, scoring, cleanup, pianificazione strutturata, governance. Magari ti bastano un vault e un brain. In ogni caso, scegli tu. Funziona per un progetto del weekend o un prodotto con migliaia di utenti.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[typescript, react, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">profile:</span> <span class="val">full</span>      <span class="cmt"># full | standard | minimal</span>
  <span class="key">learning:</span> <span class="val">true</span>    <span class="cmt"># vault + brain attivi</span>`,
      },
      {
        sectionTitle: 'Solo una cartella.',
        title: 'Il tuo agente è una cartella',
        text: 'Nessun build step. Nessun TypeScript. È una cartella con un config YAML, istruzioni in markdown e skill che si collegano. Il motore si occupa di persistenza, ricerca, apprendimento e orchestrazione.',
        code: `<span class="key">my-agent/</span>              <span class="cmt"># il tuo agente è una cartella</span>
├── <span class="ok">CLAUDE.md</span>           <span class="cmt"># auto-generato, indirizza i task</span>
├── <span class="ok">agent.yaml</span>          <span class="cmt"># identità + config motore</span>
├── <span class="key">instructions/</span>       <span class="cmt"># regole comportamentali</span>
├── <span class="key">workflows/</span>          <span class="cmt"># 4 playbook integrati</span>
├── <span class="key">flows/</span>              <span class="cmt"># 8 flow basati su intent</span>
├── <span class="key">skills/</span>             <span class="cmt"># 7 skill essenziali</span>
├── <span class="key">knowledge/</span>          <span class="cmt"># conoscenza di dominio</span>
├── <span class="key">workspaces/</span>         <span class="cmt"># stanze di contesto</span>
└── <span class="ok">.mcp.json</span>           <span class="cmt"># connessione al motore</span>`,
      },
      {
        sectionTitle: 'Un comando.',
        title: 'Un comando per iniziare.',
        text: 'Eseguilo, dai un nome al tuo agente, scegli cosa attivare. Ottieni una cartella funzionante pronta da personalizzare. L\'agente impara tutto il resto dai tuoi progetti mentre lavori.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="prompt">?</span> <span class="cmd">What should your agent be called?</span> <span class="val">my-agent</span>
<span class="prompt">?</span> <span class="cmd">Persona:</span> <span class="val">Italian Craftsperson (default)</span>

<span class="ok">✓</span> Agent created! <span class="cmt">(43 files, 7 skills, 4 workflows)</span>`,
      },
    ],
    cardsTitle: 'Un motore. Tre scale.',
    cards: [
      {
        title: 'Personale',
        domain: 'Per te',
        cls: 'salvador',
        capabilities: ['Ricorda la tua codebase', 'Salva cosa funziona', 'Riesuma vecchie decisioni', 'Impara tra le sessioni'],
        ships: 'Conosce il tuo progetto bene quanto te.',
      },
      {
        title: 'Team',
        domain: 'Per il tuo team',
        cls: 'gaudi',
        capabilities: [
          'Convenzioni condivise',
          'Checklist di review',
          'Onboarding veloce',
          'Sincronizzato via Git',
        ],
        ships: 'Ognuno ha il proprio agente. La conoscenza resta condivisa.',
      },
      {
        title: 'Prodotto',
        domain: 'Per i tuoi utenti',
        cls: 'sentinel',
        capabilities: [
          'Memoria separata per utente',
          'Conoscenza specifica di dominio',
          'Operazioni personalizzate',
          'Gestisce la scala',
        ],
        ships: 'Distribuisci agenti ai tuoi utenti, ognuno con la propria memoria.',
      },
    ],
    terminalTitle: 'Avvio rapido',
    terminalCode: `<span class="comment"># Crea il tuo agente</span>
<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>
<span class="comment">  ✓ Agent created (43 files, 7 skills, 4 workflows)</span>

<span class="comment"># Registra e avvia</span>
<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span>   <span class="comment"># registra server MCP</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>       <span class="comment"># avvia motore + osserva file</span>

<span class="comment">  ✓ MCP config registrata</span>
<span class="comment">  ✓ CLAUDE.md si rigenera ad ogni modifica</span>`,
    archTitle: 'Il modello fa il 5% del lavoro. Il motore fa il resto.',
    archSubtitle: 'La maggior parte degli strumenti AI sono wrapper sottili attorno a una chiamata API. Il modello genera testo. Ma chi salva cosa ha funzionato? Chi gli dà un punteggio? Chi fa pulizia quando la conoscenza si accumula? Chi pianifica il lavoro e traccia le deviazioni? Quello è il motore. Quello è Soleri.',
    layers: [
      {
        label: 'Vault',
        text: 'Dove vive la conoscenza del tuo agente. Pattern, decisioni, contesto. SQLite, locale, ricercabile. Persiste tra le sessioni.',
      },
      {
        label: 'Brain',
        text: 'Tiene il punteggio. Traccia quali approcci vengono davvero usati. Le cose utili salgono in classifica. Quelle vecchie svaniscono col tempo.',
      },
      {
        label: 'Curator',
        text: 'Trova duplicati, risolve contraddizioni, pulisce le voci vecchie. Tiene il vault utile man mano che cresce, invece di farlo diventare un cassetto della spazzatura.',
      },
      {
        label: 'Planner',
        text: 'Spezza il lavoro in step, valuta i piani, traccia cosa è stato fatto, e segnala quando le cose sono andate fuori rotta.',
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
