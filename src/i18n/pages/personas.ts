import type { Locale } from '../types';

export const personasContent = (locale: Locale) => content[locale];

const content: Record<Locale, PersonasContent> = {
  en: {
    title: 'The Engine -- Soleri',
    description:
      'Six modules: Vault, Brain, Curator, Planner, Memory, and Governance. Turn them all on or just pick the ones that make sense for your agent.',
    heroEyebrow: 'The Engine',
    heroTitle:
      'Six systems. Use what fits.',
    heroSubtitle:
      'Turn them all on for a full knowledge agent, or just use the Vault if you want to start simple. Add more as you need them.',

    sections: [
      // Section 0: Vault
      {
        title: 'Vault',
        subtitle: 'Where knowledge lives.',
        text: 'SQLite, local, fully searchable. Stores decisions, patterns, and context across sessions. You can isolate it per user when you need to. It\'s your agent\'s long-term memory, but structured and queryable.',
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
        subtitle: 'Knows what works.',
        text: 'It watches which approaches actually get used. The more something proves useful, the stronger it ranks. Stuff that nobody touches anymore quietly drops off.',
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
        subtitle: 'Cleanup, orchestration, and outside expertise.',
        text: 'The Curator removes duplicates, cleans up old entries, and catches contradictions so your vault doesn\'t rot. The Planner breaks work into tasks, scores plans, and tracks what gets done. Domain Packs let you drop in community expertise or package your own.',
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
        title: 'Seven skills out of the box.',
        subtitle:
          'Starts lean. Add more when you need them.',
        text: 'Every new agent comes with 7 skills: enough to search knowledge, capture patterns, debug systematically, plan work, and pick up where you left off. Need more? One command. Or flip a switch in agent.yaml to unlock everything.',
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
    title: 'Рушій -- Soleri',
    description:
      'Шість модулів: Vault, Brain, Curator, Planner, Memory та Governance. Увімкни всі або обери ті, що підходять твоєму агенту.',
    heroEyebrow: 'Рушій',
    heroTitle:
      'Шість систем. Використовуй те, що підходить.',
    heroSubtitle:
      'Увімкни всі для повноцінного агента зі знаннями або почни з Vault, якщо хочеш простіше. Додавай більше по мірі потреби.',

    sections: [
      // Section 0: Vault
      {
        title: 'Vault',
        subtitle: 'Де живуть знання.',
        text: 'SQLite, локально, з повним пошуком. Зберігає рішення, патерни та контекст між сесіями. Можеш ізолювати на користувача, коли потрібно. Це довгострокова пам\'ять агента, але структурована і з можливістю запитів.',
        code: `<span class="cmt"># Пошук у vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">search "error handling"</span>
<span class="ok">\u2713</span> 12 патернів знайдено

<span class="cmt"># Зафіксувати новий патерн</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">capture --type pattern</span>
  <span class="key">title:</span> <span class="val">"Always retry transient failures"</span>
  <span class="key">context:</span> <span class="val">"API integration"</span>
<span class="ok">\u2713</span> Збережено у vault

<span class="cmt"># Статистика vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">stats</span>
  <span class="val">патерни:</span> <span class="cmt">142</span>   <span class="val">рішення:</span> <span class="cmt">38</span>
  <span class="val">анти-патерни:</span> <span class="cmt">27</span>   <span class="val">сесії:</span> <span class="cmt">89</span>`,
      },

      // Section 1: Brain
      {
        title: 'Brain',
        subtitle: 'Знає, що працює.',
        text: 'Спостерігає, які підходи дійсно використовуються. Чим частіше щось виявляється корисним, тим вище воно ранжується. Те, до чого ніхто не торкається, тихо зникає.',
        code: `<span class="cmt"># Рейтинг сили патернів Brain</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">stats</span>

<span class="key">| Патерн                   | Сила     | Хіти |</span>
<span class="val">|--------------------------|----------|------|</span>
<span class="val">| retry-transient-failures | 0.94     | 47   |</span>
<span class="val">| vault-first-lookup       | 0.91     | 38   |</span>
<span class="val">| test-before-ship         | 0.87     | 31   |</span>
<span class="val">| manual-env-setup         | 0.12     | 2    |</span>

<span class="cmt"># Сильні патерни з'являються автоматично.</span>
<span class="cmt"># Слабкі згасають з часом.</span>`,
      },

      // Section 2: Curator + Planner + Packs
      {
        title: 'Curator, Planner та Domain Packs',
        subtitle: 'Очистка, оркестрація і зовнішня експертиза.',
        text: 'Curator прибирає дублікати, чистить старі записи та ловить протиріччя, щоб vault не гнив. Planner розбиває роботу на задачі, оцінює плани і відстежує, що зроблено. Domain Packs дозволяють підключити експертизу спільноти або запакувати свою.',
        code: `<span class="cmt"># Встановити доменний пакет</span>
<span class="prompt">$</span> <span class="cmd">soleri pack</span> <span class="arg">add @soleri/domain-react</span>
<span class="ok">\u2713</span> 34 патерни, 8 анти-патернів, 3 робочі процеси

<span class="cmt"># Життєвий цикл плану</span>
<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">create "auth system"</span>
<span class="ok">\u2713</span> План створено <span class="cmt">(оцінка: A, 6 задач)</span>

<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">execute</span>
  <span class="val">Задача 1/6:</span> <span class="cmt">Визначити auth middleware</span> <span class="ok">\u2713</span>
  <span class="val">Задача 2/6:</span> <span class="cmt">Додати session store</span> <span class="ok">\u2713</span>
  <span class="val">Задача 3/6:</span> <span class="cmt">Написати інтеграційні тести...</span>`,
      },

      // Section 3: Essential skills
      {
        title: 'Сім навичок з коробки.',
        subtitle:
          'Починає легко. Додавай більше, коли потрібно.',
        text: 'Кожен новий агент отримує 7 навичок: достатньо для пошуку знань, фіксації патернів, систематичного дебагу, планування роботи і продовження з того місця, де зупинився. Потрібно більше? Одна команда. Або зміни прапорець в agent.yaml, щоб розблокувати все.',
        code: `<span class="cmt">Базові навички (йдуть за замовчуванням):</span>
  <span class="val">agent-guide</span>           <span class="cmt">— що ти вмієш?</span>
  <span class="val">agent-persona</span>         <span class="cmt">— залишайся в образі</span>
  <span class="val">vault-navigator</span>       <span class="cmt">— пошук знань</span>
  <span class="val">vault-capture</span>         <span class="cmt">— збереження патернів</span>
  <span class="val">systematic-debugging</span>  <span class="cmt">— знайти першопричину</span>
  <span class="val">writing-plans</span>         <span class="cmt">— структуроване планування</span>
  <span class="val">context-resume</span>        <span class="cmt">— продовж з того місця</span>

<span class="cmt">Додати ще:</span>
  <span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">skills install deep-review</span>`,
      },
    ],
  },

  it: {
    title: 'Il Motore -- Soleri',
    description:
      'Sei moduli: Vault, Brain, Curator, Planner, Memory e Governance. Attivali tutti o scegli quelli che hanno senso per il tuo agente.',
    heroEyebrow: 'Il Motore',
    heroTitle:
      'Sei sistemi. Usa quello che ti serve.',
    heroSubtitle:
      'Attivali tutti per un agente con conoscenza completa, oppure parti solo con il Vault se vuoi iniziare semplice. Aggiungine altri quando servono.',

    sections: [
      // Section 0: Vault
      {
        title: 'Vault',
        subtitle: 'Dove vive la conoscenza.',
        text: 'SQLite, locale, completamente ricercabile. Conserva decisioni, pattern e contesto tra le sessioni. Puoi isolarlo per utente quando serve. La memoria a lungo termine del tuo agente, strutturata e interrogabile.',
        code: `<span class="cmt"># Cerca nel vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">search "error handling"</span>
<span class="ok">\u2713</span> 12 pattern trovati

<span class="cmt"># Cattura un nuovo pattern</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">capture --type pattern</span>
  <span class="key">title:</span> <span class="val">"Always retry transient failures"</span>
  <span class="key">context:</span> <span class="val">"API integration"</span>
<span class="ok">\u2713</span> Salvato nel vault

<span class="cmt"># Statistiche vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">stats</span>
  <span class="val">pattern:</span> <span class="cmt">142</span>   <span class="val">decisioni:</span> <span class="cmt">38</span>
  <span class="val">anti-pattern:</span> <span class="cmt">27</span>   <span class="val">sessioni:</span> <span class="cmt">89</span>`,
      },

      // Section 1: Brain
      {
        title: 'Brain',
        subtitle: 'Sa cosa funziona.',
        text: 'Osserva quali approcci vengono davvero usati. Più qualcosa si dimostra utile, più sale in classifica. Le cose che nessuno tocca più scompaiono in silenzio.',
        code: `<span class="cmt"># Classifica forza dei pattern nel Brain</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">stats</span>

<span class="key">| Pattern                  | Forza    | Hit  |</span>
<span class="val">|--------------------------|----------|------|</span>
<span class="val">| retry-transient-failures | 0.94     | 47   |</span>
<span class="val">| vault-first-lookup       | 0.91     | 38   |</span>
<span class="val">| test-before-ship         | 0.87     | 31   |</span>
<span class="val">| manual-env-setup         | 0.12     | 2    |</span>

<span class="cmt"># I pattern forti emergono automaticamente.</span>
<span class="cmt"># Quelli deboli svaniscono col tempo.</span>`,
      },

      // Section 2: Curator + Planner + Packs
      {
        title: 'Curator, Planner e Domain Packs',
        subtitle: 'Pulizia, orchestrazione ed expertise esterna.',
        text: 'Il Curator rimuove duplicati, pulisce le voci vecchie e intercetta le contraddizioni per evitare che il tuo vault marcisca. Il Planner spezza il lavoro in task, valuta i piani e traccia cosa viene fatto. I Domain Packs ti permettono di inserire expertise dalla community o impacchettare la tua.',
        code: `<span class="cmt"># Installa un domain pack</span>
<span class="prompt">$</span> <span class="cmd">soleri pack</span> <span class="arg">add @soleri/domain-react</span>
<span class="ok">\u2713</span> 34 pattern, 8 anti-pattern, 3 workflow

<span class="cmt"># Ciclo di vita del piano</span>
<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">create "auth system"</span>
<span class="ok">\u2713</span> Piano creato <span class="cmt">(voto: A, 6 task)</span>

<span class="prompt">$</span> <span class="cmd">soleri plan</span> <span class="arg">execute</span>
  <span class="val">Task 1/6:</span> <span class="cmt">Definire auth middleware</span> <span class="ok">\u2713</span>
  <span class="val">Task 2/6:</span> <span class="cmt">Aggiungere session store</span> <span class="ok">\u2713</span>
  <span class="val">Task 3/6:</span> <span class="cmt">Scrivere integration test...</span>`,
      },

      // Section 3: Essential skills
      {
        title: 'Sette skill pronte all\'uso.',
        subtitle:
          'Parte leggero. Aggiungine altre quando servono.',
        text: 'Ogni nuovo agente arriva con 7 skill: abbastanza per cercare conoscenza, catturare pattern, fare debug sistematico, pianificare lavoro e riprendere da dove avevi lasciato. Ne servono altre? Un comando. Oppure cambia un flag in agent.yaml per sbloccare tutto.',
        code: `<span class="cmt">Skill essenziali (incluse di default):</span>
  <span class="val">agent-guide</span>           <span class="cmt">\u2014 cosa sai fare?</span>
  <span class="val">agent-persona</span>         <span class="cmt">\u2014 resta nel personaggio</span>
  <span class="val">vault-navigator</span>       <span class="cmt">\u2014 cerca nella conoscenza</span>
  <span class="val">vault-capture</span>         <span class="cmt">\u2014 salva pattern</span>
  <span class="val">systematic-debugging</span>  <span class="cmt">\u2014 trova la causa</span>
  <span class="val">writing-plans</span>         <span class="cmt">\u2014 pianificazione strutturata</span>
  <span class="val">context-resume</span>        <span class="cmt">\u2014 riprendi da dove avevi lasciato</span>

<span class="cmt">Aggiungine altre:</span>
  <span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">skills install deep-review</span>`,
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
