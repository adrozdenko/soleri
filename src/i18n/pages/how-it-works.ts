import type { Locale } from '../types';

export const howItWorksContent = (locale: Locale) => content[locale];

const content: Record<Locale, HowItWorksContent> = {
  en: {
    title: 'How It Works - Soleri',
    description:
      'Soleri is the engine that powers your agent. Your agent learns your project, remembers your decisions, and gets sharper over time — all on your machine.',
    eyebrow: 'How it works',
    heroTitle: 'How Soleri stays useful after day one.',
    heroSubtitle:
      'You plan. You work. You capture what matters. Next time, your agent already knows.',
    sections: [
      {
        title: 'You plan. Your agent learns.',
        subtitle: 'Start with a plan, capture what matters along the way.',
        text: 'You ask the agent to plan the work — it uses what it already knows and you approve. While you build, you capture key decisions, patterns, and fixes. About 30 seconds each. That plan-work-capture loop is the learning. No separate training step.',
        code: `<span class="dim">// You ask, the agent plans</span>
<span class="hl">You:</span>     Plan: add email validation to signup.
<span class="hl">Agent:</span>   Here's the plan:
         1. Add validator in <span class="val">lib/validators</span>
         2. Wire into the signup handler
         3. Add test for edge cases
         Ready to start?

<span class="dim">// After the work, capture what you learned</span>
<span class="hl">You:</span>     Capture this: use RFC 5322
         for email validation, not simple regex.
<span class="hl">Agent:</span>   <span class="ok">\u2713 Saved.</span>`,
      },
      {
        title: 'Next time, it already knows.',
        subtitle: 'Proven patterns show up automatically during planning.',
        text: "Come back later and plan a similar feature \u2014 your agent recommends the conventions that actually worked last time. Suggestions are ranked by real usage, so the good stuff rises to the top. Your agent starts sounding like your team.",
        code: `<span class="dim">// A week later, new task</span>
<span class="hl">You:</span>     Plan: add phone validation to profile.
<span class="hl">Agent:</span>   Based on what worked before:
         - Use the same validator pattern
           from <span class="val">lib/validators</span>
         - Your rule: RFC-level validation,
           not simple regex
         - Add edge case tests like you did
           for email
         Plan ready. Approve?`,
      },
      {
        title: 'Gets sharper, not messier.',
        subtitle: 'The knowledge base curates itself as you use it.',
        text: "Worried it'll turn into a junk drawer? It won't. Patterns that keep working get stronger, stale ones fade, and duplicates merge \u2014 automatically. You end up with a clean, reliable set of knowledge that improves with every session.",
        code: `<span class="cmt"># Your agent's strongest patterns</span>

<span class="ok">email-validation</span>     strength: <span class="val">94</span>   used 12 times
<span class="ok">error-format</span>         strength: <span class="val">87</span>   used 8 times
<span class="ok">auth-cookies</span>         strength: <span class="val">82</span>   used 6 times
<span class="dim">legacy-class-names</span>   strength: <span class="dim">23</span>   <span class="dim">fading \u2014 unused 30 days</span>`,
        barChart: [
          { label: 'email-validation', strength: 94, uses: 12, color: 'amber' as const },
          { label: 'error-format', strength: 87, uses: 8, color: 'teal' as const },
          { label: 'auth-cookies', strength: 82, uses: 6, color: 'green' as const },
        ],
      },
      {
        title: 'Everything stays on your machine.',
        subtitle: 'Local-first. Open source. Nothing leaves your computer.',
        text: "Your agent's knowledge lives entirely on your machine \u2014 a local SQLite database plus plain files. No cloud sync, no telemetry, no data leaving your computer. Use it with any MCP editor: Claude Code, Cursor, Codex, and more. Open source under Apache 2.0.",
        code: `<span class="key">~/.soleri/</span>
\u251C\u2500\u2500 <span class="ok">vault.db</span>           <span class="cmt"># your knowledge (SQLite)</span>
\u251C\u2500\u2500 <span class="ok">brain.json</span>         <span class="cmt"># strength scores</span>
\u251C\u2500\u2500 <span class="key">plans/</span>             <span class="cmt"># plan history</span>
\u2514\u2500\u2500 <span class="key">sessions/</span>          <span class="cmt"># session memory</span>

<span class="cmt">Works with:</span> Claude Code \u00B7 Cursor \u00B7 Codex \u00B7 OpenCode`,
      },
    ],
  },
  uk: {
    title: 'Як це працює - Soleri',
    description:
      'Soleri — це рушій, що живить вашого агента. Ваш агент вивчає проєкт, запам\'ятовує рішення і стає точнішим з часом — все на вашій машині.',
    eyebrow: 'Як це працює',
    heroTitle: 'Як Soleri залишається корисним після першого дня.',
    heroSubtitle:
      'Ви плануєте. Ви працюєте. Ви фіксуєте важливе. Наступного разу ваш агент вже знає.',
    sections: [
      {
        title: 'Ви плануєте. Ваш агент вчиться.',
        subtitle: 'Почніть з плану, фіксуйте важливе по дорозі.',
        text: 'Ви просите агента спланувати роботу — він використовує те, що вже знає, і ви затверджуєте. Під час роботи ви фіксуєте ключові рішення, патерни та виправлення. Близько 30 секунд кожне. Цикл план-робота-фіксація і є навчання. Жодного окремого кроку.',
        code: `<span class="dim">// Ви питаєте, агент планує</span>
<span class="hl">Ти:</span>      План: додати валідацію email до реєстрації.
<span class="hl">Агент:</span>   Ось план:
         1. Додати валідатор у <span class="val">lib/validators</span>
         2. Підключити до хендлера реєстрації
         3. Додати тести для граничних випадків
         Починаємо?

<span class="dim">// Після роботи, зафіксуйте що дізнались</span>
<span class="hl">Ти:</span>      Зафіксуй: використовувати RFC 5322
         для валідації email, не простий regex.
<span class="hl">Агент:</span>   <span class="ok">\u2713 Збережено.</span>`,
      },
      {
        title: 'Наступного разу він вже знає.',
        subtitle: 'Перевірені патерни з\'являються автоматично при плануванні.',
        text: 'Поверніться пізніше і сплануйте схожу функцію — ваш агент порекомендує конвенції, що реально спрацювали минулого разу. Пропозиції ранжовані за реальним використанням. Ваш агент починає звучати як ваша команда.',
        code: `<span class="dim">// Через тиждень, нова задача</span>
<span class="hl">Ти:</span>      План: додати валідацію телефону до профілю.
<span class="hl">Агент:</span>   На основі того, що спрацювало:
         - Той самий патерн валідатора
           з <span class="val">lib/validators</span>
         - Ваше правило: RFC-рівень валідації,
           не простий regex
         - Додати тести граничних випадків
           як для email
         План готовий. Затверджуєте?`,
      },
      {
        title: 'Стає точнішим, не захаращенішим.',
        subtitle: 'База знань курує себе сама під час використання.',
        text: 'Боїтеся, що перетвориться на звалище? Ні. Патерни, що працюють, стають сильнішими, застарілі згасають, дублікати зливаються — автоматично. Ви отримуєте чистий, надійний набір знань, що покращується з кожною сесією.',
        code: `<span class="cmt"># Найсильніші патерни вашого агента</span>

<span class="ok">email-validation</span>     сила: <span class="val">94</span>   використано 12 разів
<span class="ok">error-format</span>         сила: <span class="val">87</span>   використано 8 разів
<span class="ok">auth-cookies</span>         сила: <span class="val">82</span>   використано 6 разів
<span class="dim">legacy-class-names</span>   сила: <span class="dim">23</span>   <span class="dim">згасає \u2014 не використано 30 днів</span>`,
        barChart: [
          { label: 'email-validation', strength: 94, uses: 12, color: 'amber' as const },
          { label: 'error-format', strength: 87, uses: 8, color: 'teal' as const },
          { label: 'auth-cookies', strength: 82, uses: 6, color: 'green' as const },
        ],
      },
      {
        title: 'Все залишається на вашій машині.',
        subtitle: 'Локально. Відкритий код. Нічого не залишає ваш комп\'ютер.',
        text: 'Знання вашого агента живуть повністю на вашій машині — локальна база SQLite плюс прості файли. Без хмарної синхронізації, без телеметрії, без даних, що покидають ваш комп\'ютер. Працює з будь-яким MCP-редактором: Claude Code, Cursor, Codex та інші. Відкритий код під Apache 2.0.',
        code: `<span class="key">~/.soleri/</span>
\u251C\u2500\u2500 <span class="ok">vault.db</span>           <span class="cmt"># ваші знання (SQLite)</span>
\u251C\u2500\u2500 <span class="ok">brain.json</span>         <span class="cmt"># оцінки сили</span>
\u251C\u2500\u2500 <span class="key">plans/</span>             <span class="cmt"># історія планів</span>
\u2514\u2500\u2500 <span class="key">sessions/</span>          <span class="cmt"># пам'ять сесій</span>

<span class="cmt">Працює з:</span> Claude Code \u00B7 Cursor \u00B7 Codex \u00B7 OpenCode`,
      },
    ],
  },
  it: {
    title: 'Come funziona - Soleri',
    description:
      'Soleri è il motore che alimenta il tuo agente. Il tuo agente impara il progetto, ricorda le decisioni e diventa più preciso nel tempo — tutto sulla tua macchina.',
    eyebrow: 'Come funziona',
    heroTitle: 'Come Soleri resta utile dopo il primo giorno.',
    heroSubtitle:
      'Pianifichi. Lavori. Catturi ciò che conta. La prossima volta, il tuo agente già sa.',
    sections: [
      {
        title: 'Pianifichi. Il tuo agente impara.',
        subtitle: 'Inizia con un piano, cattura ciò che conta lungo la strada.',
        text: "Chiedi all'agente di pianificare il lavoro — usa ciò che già sa e tu approvi. Mentre costruisci, catturi decisioni, pattern e fix chiave. Circa 30 secondi ciascuno. Il ciclo piano-lavoro-cattura è l'apprendimento. Nessun passaggio separato.",
        code: `<span class="dim">// Chiedi, l'agente pianifica</span>
<span class="hl">Tu:</span>      Piano: aggiungi validazione email alla registrazione.
<span class="hl">Agente:</span>  Ecco il piano:
         1. Aggiungi validatore in <span class="val">lib/validators</span>
         2. Collega all'handler di registrazione
         3. Aggiungi test per i casi limite
         Iniziamo?

<span class="dim">// Dopo il lavoro, cattura ciò che hai imparato</span>
<span class="hl">Tu:</span>      Cattura: usare RFC 5322
         per la validazione email, non regex semplice.
<span class="hl">Agente:</span>  <span class="ok">\u2713 Salvato.</span>`,
      },
      {
        title: 'La prossima volta, già sa.',
        subtitle: 'I pattern provati appaiono automaticamente durante la pianificazione.',
        text: 'Torna più tardi e pianifica una feature simile — il tuo agente raccomanda le convenzioni che hanno funzionato l\'ultima volta. I suggerimenti sono ordinati per uso reale. Il tuo agente inizia a parlare come il tuo team.',
        code: `<span class="dim">// Una settimana dopo, nuovo task</span>
<span class="hl">Tu:</span>      Piano: aggiungi validazione telefono al profilo.
<span class="hl">Agente:</span>  In base a ciò che ha funzionato:
         - Usa lo stesso pattern validatore
           da <span class="val">lib/validators</span>
         - La tua regola: validazione RFC,
           non regex semplice
         - Aggiungi test per i casi limite
           come per l'email
         Piano pronto. Approvi?`,
      },
      {
        title: 'Diventa più preciso, non più caotico.',
        subtitle: 'La base di conoscenza si cura da sola mentre la usi.',
        text: "Preoccupato che diventi un cassetto della spazzatura? Non succederà. I pattern che funzionano diventano più forti, quelli stantii svaniscono e i duplicati si fondono — automaticamente. Ottieni un set di conoscenze pulito e affidabile che migliora ad ogni sessione.",
        code: `<span class="cmt"># I pattern più forti del tuo agente</span>

<span class="ok">email-validation</span>     forza: <span class="val">94</span>   usato 12 volte
<span class="ok">error-format</span>         forza: <span class="val">87</span>   usato 8 volte
<span class="ok">auth-cookies</span>         forza: <span class="val">82</span>   usato 6 volte
<span class="dim">legacy-class-names</span>   forza: <span class="dim">23</span>   <span class="dim">svanendo \u2014 non usato da 30 giorni</span>`,
        barChart: [
          { label: 'email-validation', strength: 94, uses: 12, color: 'amber' as const },
          { label: 'error-format', strength: 87, uses: 8, color: 'teal' as const },
          { label: 'auth-cookies', strength: 82, uses: 6, color: 'green' as const },
        ],
      },
      {
        title: 'Tutto resta sulla tua macchina.',
        subtitle: 'Local-first. Open source. Niente lascia il tuo computer.',
        text: "La conoscenza del tuo agente vive interamente sulla tua macchina — un database SQLite locale più file semplici. Nessuna sincronizzazione cloud, nessuna telemetria, nessun dato che lascia il tuo computer. Funziona con qualsiasi editor MCP: Claude Code, Cursor, Codex e altri. Open source sotto Apache 2.0.",
        code: `<span class="key">~/.soleri/</span>
\u251C\u2500\u2500 <span class="ok">vault.db</span>           <span class="cmt"># la tua conoscenza (SQLite)</span>
\u251C\u2500\u2500 <span class="ok">brain.json</span>         <span class="cmt"># punteggi di forza</span>
\u251C\u2500\u2500 <span class="key">plans/</span>             <span class="cmt"># storico piani</span>
\u2514\u2500\u2500 <span class="key">sessions/</span>          <span class="cmt"># memoria sessioni</span>

<span class="cmt">Funziona con:</span> Claude Code \u00B7 Cursor \u00B7 Codex \u00B7 OpenCode`,
      },
    ],
  },
};

interface HowItWorksSection {
  title: string;
  subtitle: string;
  text: string;
  code: string;
  barChart?: { label: string; strength: number; uses: number; color: 'amber' | 'teal' | 'green' }[];
}

interface HowItWorksContent {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  sections: HowItWorksSection[];
}
