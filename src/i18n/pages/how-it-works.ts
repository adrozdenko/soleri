import type { Locale } from '../types';

export const howItWorksContent = (locale: Locale) => content[locale];

const content: Record<Locale, HowItWorksContent> = {
  en: {
    title: 'How It Works -- Soleri',
    description:
      'Soleri is the knowledge engine behind your agent. Six systems that handle storage, scoring, cleanup, planning, and governance. Everything runs locally.',
    eyebrow: 'How it works',
    heroTitle: 'Not a wrapper. An engine.',
    heroSubtitle:
      'Most AI tools just pass your prompt to an API and hope for the best. Soleri is the other 95%: the six systems that make the model\'s output actually useful.',
    sections: [
      {
        title: 'Six systems, one engine.',
        subtitle: 'Turn on what your agent needs. Leave the rest off.',
        text: 'The Vault stores what your agent learns. The Brain figures out what\'s worth keeping. The Curator cleans up the mess as knowledge grows. The Planner gives work structure. Memory carries context between sessions, and Governance sets the quality rules. Run all six or just the ones you need.',
        code: `<span class="cmt"># Six systems, one engine</span>

<span class="ok">Brain</span>        <span class="dim">— tracks what works, recommends approaches</span>
<span class="ok">Curator</span>      <span class="dim">— prevents knowledge decay, deduplicates</span>
<span class="ok">Governance</span>   <span class="dim">— controls quality, enforces review gates</span>
<span class="ok">Planner</span>     <span class="dim"> — structured plans with approval checkpoints</span>
<span class="ok">Memory</span>      <span class="dim"> — persists across sessions and projects</span>
<span class="ok">Vault</span>       <span class="dim"> — linked knowledge graph, searchable patterns</span>

<span class="cmt"># What the 5% does</span>

<span class="val">LLM calls</span>    <span class="dim">— content classification, persona generation</span>
<span class="dim">Everything else? Deterministic. Explainable. Offline-capable.</span>`,
      },
      {
        title: 'It remembers what worked.',
        subtitle: 'Next time similar work comes up, the good stuff shows up on its own.',
        text: 'Fixed something last week? When a similar problem shows up, your agent already knows the approach that worked. You don\'t have to search for it or explain it again.',
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
        title: 'It stays clean on its own.',
        subtitle: 'Three systems keep things from turning into a junk drawer.',
        text: 'The Brain tracks what actually gets used, so useful stuff rises and stale stuff fades. The Curator catches duplicates and contradictions on its own. And Governance lets you control what gets shared with the team versus what stays private.',
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
        title: 'Nothing leaves your machine.',
        subtitle: 'Local. Open source. Private by default.',
        text: 'All of it stays on your computer. No cloud, no tracking, nothing phones home. Apache 2.0.',
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
      'Soleri -- це рушій знань за твоїм агентом. Шість систем, які обробляють зберігання, скоринг, очистку, планування та governance. Все працює локально.',
    eyebrow: 'Як це працює',
    heroTitle: 'Не обгортка. Рушій.',
    heroSubtitle:
      'Більшість AI-інструментів просто передають твій промпт в API і сподіваються на краще. Soleri -- це решта 95%: шість систем, які роблять вивід моделі дійсно корисним.',
    sections: [
      {
        title: 'Шість систем, один рушій.',
        subtitle: 'Увімкни те, що потрібно агенту. Решту залиш вимкненим.',
        text: 'Vault зберігає те, що агент вивчає. Brain визначає, що варто тримати. Curator прибирає безлад, коли знань стає більше. Planner дає роботі структуру. Memory переносить контекст між сесіями, а Governance встановлює правила якості. Запускай всі шість або лише ті, що потрібні.',
        code: `<span class="cmt"># Шість систем, один рушій</span>

<span class="ok">Brain</span>        <span class="dim">— відстежує, що працює, рекомендує підходи</span>
<span class="ok">Curator</span>      <span class="dim">— запобігає деградації знань, дедуплікація</span>
<span class="ok">Governance</span>   <span class="dim">— контролює якість, впроваджує ревʼю-гейти</span>
<span class="ok">Planner</span>     <span class="dim"> — структуровані плани з чекпоінтами затвердження</span>
<span class="ok">Memory</span>      <span class="dim"> — зберігається між сесіями і проєктами</span>
<span class="ok">Vault</span>       <span class="dim"> — пов'язаний граф знань, патерни з пошуком</span>

<span class="cmt"># Що робить ті 5%</span>

<span class="val">LLM-виклики</span>  <span class="dim">— класифікація контенту, генерація персони</span>
<span class="dim">Все інше? Детерміноване. Пояснюване. Працює офлайн.</span>`,
      },
      {
        title: 'Запам\'ятовує, що спрацювало.',
        subtitle: 'Наступного разу, коли з\'явиться схожа задача, корисне підтягнеться само.',
        text: 'Полагодив щось минулого тижня? Коли з\'явиться схожа проблема, твій агент вже знає підхід, який спрацював. Не потрібно шукати чи пояснювати знову.',
        code: `<span class="dim">// Через тиждень, нова задача</span>
<span class="hl">Ти:</span>      План: додати валідацію телефону до профілю.
<span class="hl">Агент:</span>   На основі того, що спрацювало:
         - Той самий патерн валідатора
           з <span class="val">lib/validators</span>
         - Твоє правило: RFC-рівень валідації,
           не простий regex
         - Додати тести граничних випадків
           як для email
         План готовий. Затверджуєш?`,
      },
      {
        title: 'Тримає себе в чистоті.',
        subtitle: 'Три системи не дають перетворитися на звалище.',
        text: 'Brain відстежує, що дійсно використовується, тому корисне піднімається, а застаріле згасає. Curator ловить дублікати і протиріччя сам. А Governance дозволяє контролювати, що ділиться з командою, а що залишається приватним.',
        code: `<span class="cmt"># Найсильніші патерни твого агента</span>

<span class="ok">email-validation</span>     сила: <span class="val">94</span>   використано 12 разів
<span class="ok">error-format</span>         сила: <span class="val">87</span>   використано 8 разів
<span class="ok">auth-cookies</span>         сила: <span class="val">82</span>   використано 6 разів
<span class="dim">legacy-class-names</span>   сила: <span class="dim">23</span>   <span class="dim">згасає, не використано 30 днів</span>`,
        barChart: [
          { label: 'email-validation', strength: 94, uses: 12, color: 'amber' as const },
          { label: 'error-format', strength: 87, uses: 8, color: 'teal' as const },
          { label: 'auth-cookies', strength: 82, uses: 6, color: 'green' as const },
        ],
      },
      {
        title: 'Нічого не залишає твою машину.',
        subtitle: 'Локально. Відкритий код. Приватно за замовчуванням.',
        text: 'Все залишається на твоєму комп\'ютері. Без хмари, без трекінгу, нічого не телефонує додому. Apache 2.0.',
        code: `<span class="key">~/.soleri/</span>
\u251C\u2500\u2500 <span class="ok">vault.db</span>           <span class="cmt"># твої знання (SQLite)</span>
\u251C\u2500\u2500 <span class="ok">brain.json</span>         <span class="cmt"># оцінки сили</span>
\u251C\u2500\u2500 <span class="key">plans/</span>             <span class="cmt"># історія планів</span>
\u2514\u2500\u2500 <span class="key">sessions/</span>          <span class="cmt"># пам'ять сесій</span>

<span class="cmt">Працює з:</span> Claude Code \u00B7 Cursor \u00B7 Codex \u00B7 OpenCode`,
      },
    ],
  },
  it: {
    title: 'Come funziona -- Soleri',
    description:
      'Soleri è il motore di conoscenza dietro al tuo agente. Sei sistemi che gestiscono storage, scoring, cleanup, pianificazione e governance. Tutto gira in locale.',
    eyebrow: 'Come funziona',
    heroTitle: 'Non un wrapper. Un motore.',
    heroSubtitle:
      'La maggior parte degli strumenti AI passano il tuo prompt a un\'API e sperano per il meglio. Soleri è l\'altro 95%: i sei sistemi che rendono l\'output del modello davvero utile.',
    sections: [
      {
        title: 'Sei sistemi, un motore.',
        subtitle: 'Attiva quello che serve al tuo agente. Lascia spento il resto.',
        text: 'Il Vault conserva quello che il tuo agente impara. Il Brain capisce cosa vale la pena tenere. Il Curator fa pulizia man mano che la conoscenza cresce. Il Planner dà struttura al lavoro. Memory porta il contesto tra le sessioni, e Governance imposta le regole di qualità. Usa tutti e sei o solo quelli che ti servono.',
        code: `<span class="cmt"># Sei sistemi, un motore</span>

<span class="ok">Brain</span>        <span class="dim">— traccia cosa funziona, raccomanda approcci</span>
<span class="ok">Curator</span>      <span class="dim">— previene il degrado della conoscenza, deduplica</span>
<span class="ok">Governance</span>   <span class="dim">— controlla la qualità, impone review gate</span>
<span class="ok">Planner</span>     <span class="dim"> — piani strutturati con checkpoint di approvazione</span>
<span class="ok">Memory</span>      <span class="dim"> — persiste tra sessioni e progetti</span>
<span class="ok">Vault</span>       <span class="dim"> — grafo di conoscenza collegato, pattern ricercabili</span>

<span class="cmt"># Cosa fa il 5%</span>

<span class="val">Chiamate LLM</span>  <span class="dim">— classificazione contenuti, generazione persona</span>
<span class="dim">Tutto il resto? Deterministico. Spiegabile. Funziona offline.</span>`,
      },
      {
        title: 'Si ricorda cosa ha funzionato.',
        subtitle: 'La prossima volta che salta fuori un lavoro simile, le cose buone compaiono da sole.',
        text: 'Hai fixato qualcosa la settimana scorsa? Quando si presenta un problema simile, il tuo agente conosce già l\'approccio che ha funzionato. Non devi cercarlo o spiegarlo di nuovo.',
        code: `<span class="dim">// Una settimana dopo, nuovo task</span>
<span class="hl">Tu:</span>      Piano: aggiungi validazione telefono al profilo.
<span class="hl">Agente:</span>  In base a cosa ha funzionato prima:
         - Usa lo stesso pattern validatore
           da <span class="val">lib/validators</span>
         - La tua regola: validazione RFC,
           non regex semplice
         - Aggiungi test per i casi limite
           come per l'email
         Piano pronto. Approvi?`,
      },
      {
        title: 'Si tiene in ordine da solo.',
        subtitle: 'Tre sistemi impediscono che diventi un cassetto della spazzatura.',
        text: 'Il Brain traccia cosa viene davvero usato, quindi le cose utili salgono e quelle vecchie svaniscono. Il Curator intercetta duplicati e contraddizioni da solo. E Governance ti permette di controllare cosa condividere col team e cosa tenere privato.',
        code: `<span class="cmt"># I pattern più forti del tuo agente</span>

<span class="ok">email-validation</span>     forza: <span class="val">94</span>   usato 12 volte
<span class="ok">error-format</span>         forza: <span class="val">87</span>   usato 8 volte
<span class="ok">auth-cookies</span>         forza: <span class="val">82</span>   usato 6 volte
<span class="dim">legacy-class-names</span>   forza: <span class="dim">23</span>   <span class="dim">sta svanendo \u2014 non usato da 30 giorni</span>`,
        barChart: [
          { label: 'email-validation', strength: 94, uses: 12, color: 'amber' as const },
          { label: 'error-format', strength: 87, uses: 8, color: 'teal' as const },
          { label: 'auth-cookies', strength: 82, uses: 6, color: 'green' as const },
        ],
      },
      {
        title: 'Niente lascia la tua macchina.',
        subtitle: 'Locale. Open source. Privato per default.',
        text: 'Tutto resta sul tuo computer. Nessun cloud, nessun tracking, niente telefona a casa. Apache 2.0.',
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
