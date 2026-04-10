import type { Locale } from '../types';

export const personasContent = (locale: Locale) => content[locale];

const content: Record<Locale, PersonasContent> = {
  en: {
    title: 'The Engine - Soleri',
    description:
      'The Soleri engine has six modules: Vault, Brain, Curator, Planner, Memory, and Governance. Enable all of them or just the ones you need.',
    heroEyebrow: 'The Engine',
    heroTitle:
      'Six systems. Use what you need.',
    heroSubtitle:
      'The engine has six modules: Vault, Brain, Curator, Planner, Memory, and Governance. Enable all of them for a full knowledge agent. Or enable just the Vault for persistent memory. Your agent, your choice.',

    sections: [
      // Section 0: Vault
      {
        title: 'Vault',
        subtitle: 'Memory that persists.',
        text: 'SQLite-based, local-first, searchable. Captures patterns, decisions, and context. Shared across sessions, isolated per user when you need it. Your agent\'s long-term memory.',
        code: `<span class="cmt"># Search the vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">search "error handling"</span>
<span class="ok">\u2713</span> 12 patterns found

<span class="cmt"># Capture a new pattern</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">capture --type pattern</span>
  <span class="key">title:</span> <span class="val">"Always retry transient failures"</span>
  <span class="key">context:</span> <span class="val">"API integration"</span>
<span class="ok">\u2713</span> Persisted to vault

<span class="cmt"># Vault stats</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">stats</span>
  <span class="val">patterns:</span> <span class="cmt">142</span>   <span class="val">decisions:</span> <span class="cmt">38</span>
  <span class="val">anti-patterns:</span> <span class="cmt">27</span>   <span class="val">sessions:</span> <span class="cmt">89</span>`,
      },

      // Section 1: Brain
      {
        title: 'Brain',
        subtitle: 'Intelligence that compounds.',
        text: 'Tracks which patterns work and which don\'t. Surfaces the right knowledge at the right time. Pattern strength grows with use \u2014 your best practices rise, outdated ones fade.',
        code: `<span class="cmt"># Brain pattern strength rankings</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">stats</span>

<span class="key">| Pattern                  | Strength | Hits |</span>
<span class="val">|--------------------------|----------|------|</span>
<span class="val">| retry-transient-failures | 0.94     | 47   |</span>
<span class="val">| vault-first-lookup       | 0.91     | 38   |</span>
<span class="val">| test-before-ship         | 0.87     | 31   |</span>
<span class="val">| manual-env-setup         | 0.12     | 2    |</span>

<span class="cmt"># Strong patterns surface automatically.</span>
<span class="cmt"># Weak ones fade over time.</span>`,
      },

      // Section 2: Curator + Planner + Packs
      {
        title: 'Curator, Planner, and Domain Packs',
        subtitle: 'Quality, orchestration, and extensibility.',
        text: 'Curator keeps the vault clean \u2014 deduplicates, grooms, detects contradictions. Planner breaks work into tasks, grades plans, and tracks execution. Domain Packs plug in vertical intelligence \u2014 install community expertise or build your own.',
        code: `<span class="cmt"># Install a domain pack</span>
<span class="prompt">$</span> <span class="cmd">soleri pack</span> <span class="arg">add @soleri/domain-react</span>
<span class="ok">\u2713</span> 34 patterns, 8 anti-patterns, 3 workflows

<span class="cmt"># Plan lifecycle</span>
<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">create "auth system"</span>
<span class="ok">\u2713</span> Plan created <span class="cmt">(grade: A, 6 tasks)</span>

<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">execute</span>
  <span class="val">Task 1/6:</span> <span class="cmt">Define auth middleware</span> <span class="ok">\u2713</span>
  <span class="val">Task 2/6:</span> <span class="cmt">Add session store</span> <span class="ok">\u2713</span>
  <span class="val">Task 3/6:</span> <span class="cmt">Write integration tests...</span>`,
      },

      // Section 3: Essential skills
      {
        title: 'Seven skills. Add more when you need them.',
        subtitle:
          'Ship lean. Your agent starts with what matters.',
        text: 'Every agent ships with 7 essential skills. No bloat, no overwhelm. Need more? Install them with one command. Or set skillsFilter: all in agent.yaml to get everything.',
        code: `<span class="cmt">Essential skills (ship by default):</span>
  <span class="val">agent-guide</span>           <span class="cmt">\u2014 what can you do?</span>
  <span class="val">agent-persona</span>         <span class="cmt">\u2014 stay in character</span>
  <span class="val">vault-navigator</span>       <span class="cmt">\u2014 search knowledge</span>
  <span class="val">vault-capture</span>         <span class="cmt">\u2014 save patterns</span>
  <span class="val">systematic-debugging</span>  <span class="cmt">\u2014 find root cause</span>
  <span class="val">writing-plans</span>         <span class="cmt">\u2014 structured planning</span>
  <span class="val">context-resume</span>        <span class="cmt">\u2014 pick up where you left off</span>

<span class="cmt">Add more:</span>
  <span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">skills install deep-review</span>`,
      },
    ],
  },

  uk: {
    title: 'Ваш агент \u2014 Soleri',
    description:
      'Ваш агент \u2014 це тека. Прості файли, без збірки, конфігурація через YAML. Він вчиться вашому проєкту через цикл план-робота-фіксація.',
    heroEyebrow: 'Ваш агент',
    heroTitle:
      'Просто тека, яку рушій Soleri робить розумною.',
    heroSubtitle:
      'Ваш агент — це файлова структура з простими файлами. Soleri — рушій, що дає йому пам\u0027ять, планування та навчання.',

    sections: [
      // Section 1
      {
        title: 'Ваш агент \u2014 це тека.',
        subtitle: 'Прості файли. Без збірки. Без пропрієтарного формату.',
        text: 'Володійте ним як кодом. Редагуйте, дифайте, версіонуйте будь-де.',
        code: `<span class="cmt"># Ваш агент — це тека</span>
<span class="key">my-agent/</span>
\u251C\u2500\u2500 <span class="val">agent.yaml</span>        <span class="cmt"># ідентичність + конфіг</span>
\u251C\u2500\u2500 <span class="val">instructions/</span>     <span class="cmt"># правила поведінки</span>
\u251C\u2500\u2500 <span class="val">workflows/</span>        <span class="cmt"># повторювані сценарії</span>
\u251C\u2500\u2500 <span class="val">knowledge/</span>        <span class="cmt"># доменна експертиза</span>
\u251C\u2500\u2500 <span class="val">skills/</span>           <span class="cmt"># можливості агента</span>
\u2514\u2500\u2500 <span class="val">.mcp.json</span>         <span class="cmt"># підключення до рушія</span>`,
      },

      // Section 2
      {
        title: 'Один YAML-файл. Повний контроль.',
        subtitle:
          "Ім\u2019я, роль, домени, тон, принципи \u2014 все в agent.yaml.",
        text: 'Визначте поведінку агента в одному місці. Змінюйте будь-коли \u2014 набуває чинності одразу.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">principles:</span>
  - <span class="val">Простота замість хитрощів</span>
  - <span class="val">Тестуй перед деплоєм</span>
  - <span class="val">Поважай існуючі патерни</span>`,
      },

      // Section 3
      {
        title: 'Навички вашого агента.',
        subtitle:
          "Планування, фіксація, рев\u2019ю, дебаг \u2014 повторювані робочі процеси як файли.",
        text: 'Перетворіть найкращі робочі процеси на повторювані запуски. Плануйте, рев\u0027юте та дебажте з однаковою послідовністю.',
        code: `<span class="cmt">Вбудовані навички:</span>
  <span class="val">brainstorming</span>          <span class="cmt">\u2014 дослідження ідей перед фіксацією</span>
  <span class="val">systematic-debugging</span>   <span class="cmt">\u2014 знайти першопричину, потім виправити</span>
  <span class="val">verification</span>           <span class="cmt">\u2014 доведи перед релізом</span>

<span class="cmt">Додаткові:</span>
  <span class="val">writing-plans</span>          <span class="cmt">\u2014 структуроване планування</span>
  <span class="val">vault-capture</span>          <span class="cmt">\u2014 збереження патернів у знання</span>
  <span class="val">code-patrol</span>            <span class="cmt">\u2014 перевірка за вашими стандартами</span>
  <span class="val">fix-and-learn</span>          <span class="cmt">\u2014 виправляй баги, фіксуй уроки</span>
  <span class="val">onboard-me</span>             <span class="cmt">\u2014 гід по кодовій базі</span>`,
      },

      // Section 4
      {
        title: 'Розширюйте в міру зростання.',
        subtitle:
          'Додавайте домени, встановлюйте пакети, налаштовуйте інструкції.',
        text: 'Починайте легко, масштабуйте без тертя. Додавайте знання та стандарти коли потрібно \u2014 без перебудов.',
        code: `<span class="cmt"># Додати новий домен</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">add-domain security</span>

<span class="cmt"># Встановити пакет знань</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">pack install ../team-standards</span>
<span class="ok">\u2713</span> 18 патернів, 4 сценарії

<span class="cmt"># Агент підхоплює зміни автоматично</span>
<span class="ok">\u2713</span> CLAUDE.md перегенеровано`,
      },
    ],
  },

  it: {
    title: 'Il tuo agente \u2014 Soleri',
    description:
      'Il tuo agente \u00e8 una cartella. File semplici, nessun build step, configurabile con YAML. Impara il tuo progetto attraverso il ciclo pianifica-lavora-cattura.',
    heroEyebrow: 'Il tuo agente',
    heroTitle:
      'Solo una cartella che il motore Soleri rende intelligente.',
    heroSubtitle:
      'Il tuo agente è una struttura di cartelle con file semplici. Soleri è il motore che gli dà memoria, pianificazione e apprendimento.',

    sections: [
      // Section 1
      {
        title: 'Il tuo agente \u00e8 una cartella.',
        subtitle: 'File semplici. Nessun build step. Nessun formato proprietario.',
        text: 'Possiedilo come possiedi il tuo codice. Modificalo, diffalo, versionalo ovunque.',
        code: `<span class="cmt"># Il tuo agente \u00e8 una cartella</span>
<span class="key">my-agent/</span>
\u251C\u2500\u2500 <span class="val">agent.yaml</span>        <span class="cmt"># identit\u00e0 + config</span>
\u251C\u2500\u2500 <span class="val">instructions/</span>     <span class="cmt"># regole comportamentali</span>
\u251C\u2500\u2500 <span class="val">workflows/</span>        <span class="cmt"># playbook ripetibili</span>
\u251C\u2500\u2500 <span class="val">knowledge/</span>        <span class="cmt"># expertise di dominio</span>
\u251C\u2500\u2500 <span class="val">skills/</span>           <span class="cmt"># capacit\u00e0 dell\u2019agente</span>
\u2514\u2500\u2500 <span class="val">.mcp.json</span>         <span class="cmt"># connessione all\u2019engine</span>`,
      },

      // Section 2
      {
        title: 'Un file YAML. Controllo totale.',
        subtitle:
          'Nome, ruolo, domini, tono, principi \u2014 tutto in agent.yaml.',
        text: 'Definisci il comportamento del tuo agente in un posto. Cambialo quando vuoi \u2014 ha effetto subito.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">principles:</span>
  - <span class="val">Semplicit\u00e0 prima della furbizia</span>
  - <span class="val">Testa prima di rilasciare</span>
  - <span class="val">Rispetta i pattern esistenti</span>`,
      },

      // Section 3
      {
        title: 'Le skill del tuo agente.',
        subtitle:
          'Pianifica, cattura, rivedi, debugga \u2014 workflow ripetibili come file.',
        text: 'Trasforma i tuoi workflow migliori in esecuzioni ripetibili. Pianifica, rivedi e debugga con la stessa consistenza ogni volta.',
        code: `<span class="cmt">Skill integrate:</span>
  <span class="val">brainstorming</span>          <span class="cmt">\u2014 esplorare idee prima di impegnarsi</span>
  <span class="val">systematic-debugging</span>   <span class="cmt">\u2014 trovare la causa, poi correggere</span>
  <span class="val">verification</span>           <span class="cmt">\u2014 dimostra prima di rilasciare</span>

<span class="cmt">Aggiungi altre:</span>
  <span class="val">writing-plans</span>          <span class="cmt">\u2014 pianificazione strutturata</span>
  <span class="val">vault-capture</span>          <span class="cmt">\u2014 salva pattern nella knowledge</span>
  <span class="val">code-patrol</span>            <span class="cmt">\u2014 verifica secondo i tuoi standard</span>
  <span class="val">fix-and-learn</span>          <span class="cmt">\u2014 correggi bug, cattura la lezione</span>
  <span class="val">onboard-me</span>             <span class="cmt">\u2014 tour guidato del codebase</span>`,
      },

      // Section 4
      {
        title: 'Estendilo man mano che cresci.',
        subtitle:
          'Aggiungi domini, installa pack, personalizza le istruzioni.',
        text: 'Parti leggero, scala senza attrito. Aggiungi conoscenza e standard quando servono \u2014 nessun rebuild.',
        code: `<span class="cmt"># Aggiungi un nuovo dominio</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">add-domain security</span>

<span class="cmt"># Installa un knowledge pack</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">pack install ../team-standards</span>
<span class="ok">\u2713</span> 18 pattern, 4 playbook

<span class="cmt"># L\u2019agente rileva i cambiamenti automaticamente</span>
<span class="ok">\u2713</span> CLAUDE.md rigenerato`,
      },
    ],
  },
};

interface AgentSection {
  title: string;
  subtitle: string;
  text: string;
  code: string;
}

interface PersonasContent {
  title: string;
  description: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  sections: AgentSection[];
}
