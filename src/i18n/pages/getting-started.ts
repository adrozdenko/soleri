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
      'Three steps: scaffold the folder, register it in your editor, and run the engine. Claude Code token discovery works automatically when available.',
    steps: [
      {
        title: 'Create the agent folder',
        text: 'Use the npm create shorthand or the CLI directly. The result is a plain folder with agent.yaml, instructions, workflows, knowledge, and skills.',
        code: `<span class="prompt">$</span> <span class="cmd">npm create soleri</span> <span class="arg">my-agent</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Register it in your editor',
        text: 'From inside the new folder, register the MCP server for Claude Code, Codex, OpenCode, or all supported targets.',
        code: `<span class="prompt">$</span> <span class="cmd">cd</span> <span class="arg">my-agent</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli install</span> <span class="arg">--target claude</span>

<span class="ok">✓</span> Detected file-tree agent
<span class="ok">✓</span> Registered my-agent in <span class="val">~/.claude.json</span>
<span class="ok">✓</span> Launcher created`,
        isInstallCmd: false,
      },
      {
        title: 'Run the engine',
        text: 'Start the engine while you work. It watches the agent files and regenerates the editor instruction file when the folder changes.',
        code: `<span class="prompt">$</span> <span class="cmd">npx @soleri/cli dev</span>

<span class="ok">✓</span> MCP server running
<span class="ok">✓</span> Watching agent.yaml, instructions/, workflows/, knowledge/
<span class="ok">✓</span> CLAUDE.md regenerates on change
<span class="ok">✓</span> Claude Code token discovered <span class="cmt">(if available)</span>`,
        isInstallCmd: false,
      },
    ],
    wizardRef: {
      sectionTitle: 'Wizard Reference',
      sectionSubtitle: 'Everything the wizard offers at each step — so you know what you\'re choosing before you choose it.',
      archetypes: {
        title: 'Archetypes',
        description: 'Pick an archetype to pre-fill role, domains, principles, skills, and greeting. Or choose "Create Custom" for full control with guided examples.',
        options: [
          { name: 'Code Reviewer', hint: 'Catches bugs, enforces patterns, reviews PRs before merge' },
          { name: 'Security Auditor', hint: 'OWASP Top 10, dependency scanning, secrets detection' },
          { name: 'API Architect', hint: 'REST/GraphQL design, contract validation, versioning' },
          { name: 'Test Engineer', hint: 'Test generation, coverage analysis, TDD workflow' },
          { name: 'DevOps Pilot', hint: 'CI/CD pipelines, infrastructure, deployment automation' },
          { name: 'Database Architect', hint: 'Schema design, migrations, query optimization' },
          { name: 'Full-Stack Assistant', hint: 'General-purpose dev helper across the entire stack' },
        ],
      },
      domains: {
        title: 'Domains',
        description: 'Each domain gives your agent a dedicated area of expertise with its own knowledge facade.',
        options: [
          { name: 'security', hint: 'Vulnerability scanning, threat modeling, secrets detection' },
          { name: 'code-review', hint: 'Pattern enforcement, anti-pattern detection, PR review' },
          { name: 'testing', hint: 'Test generation, coverage analysis, mutation testing' },
          { name: 'api-design', hint: 'REST/GraphQL contracts, versioning, error handling' },
          { name: 'performance', hint: 'Budgets, profiling, bundle size, query optimization' },
          { name: 'accessibility', hint: 'WCAG compliance, screen readers, keyboard navigation' },
          { name: 'architecture', hint: 'System design, boundaries, dependency management' },
          { name: 'database', hint: 'Schema design, migrations, indexing, query tuning' },
          { name: 'documentation', hint: 'API docs, READMEs, changelogs, code comments' },
          { name: 'devops', hint: 'CI/CD pipelines, infrastructure as code, deployment' },
        ],
      },
      principles: {
        title: 'Principles',
        description: 'Guiding rules your agent follows when making decisions. Organized by category.',
        options: [
          { name: 'Simplicity over cleverness', hint: 'Quality' },
          { name: 'Convention over configuration', hint: 'Quality' },
          { name: 'Test everything that can break', hint: 'Quality' },
          { name: 'Respect existing patterns', hint: 'Quality' },
          { name: 'Security first', hint: 'Safety' },
          { name: 'Fail closed, not open', hint: 'Safety' },
          { name: 'Zero trust by default', hint: 'Safety' },
          { name: 'Least privilege always', hint: 'Safety' },
          { name: 'Actionable feedback only', hint: 'Developer Experience' },
          { name: 'Explain the why, not just the what', hint: 'Developer Experience' },
          { name: 'Every comment includes a fix suggestion', hint: 'Developer Experience' },
          { name: 'Design for the consumer, not the implementer', hint: 'Developer Experience' },
          { name: 'Graceful degradation over hard failures', hint: 'Reliability' },
          { name: 'Automate everything repeatable', hint: 'Reliability' },
          { name: 'Observability built in from day one', hint: 'Reliability' },
          { name: 'Every migration must be reversible', hint: 'Reliability' },
        ],
      },
      skills: {
        title: 'Skills',
        description: 'Skills are capabilities your agent can use during sessions. Core skills are always included; optional skills are selected per archetype or manually.',
        options: [
          { name: 'writing-plans', hint: 'Structured multi-step planning before code changes' },
          { name: 'executing-plans', hint: 'Execute approved plans with review checkpoints' },
          { name: 'vault-navigator', hint: 'Deep-dive vault search and exploration' },
          { name: 'vault-capture', hint: 'Persist lessons learned to the knowledge vault' },
          { name: 'knowledge-harvest', hint: 'Extract patterns from completed work' },
          { name: 'brain-debrief', hint: 'Post-task intelligence summary and debriefing' },
          { name: 'code-patrol', hint: 'Scan for anti-patterns and code violations' },
          { name: 'test-driven-development', hint: 'TDD workflow: red, green, refactor' },
          { name: 'fix-and-learn', hint: 'Fix bugs and capture the lesson for next time' },
          { name: 'retrospective', hint: 'End-of-session retrospective and reflection' },
          { name: 'second-opinion', hint: 'Get a fresh perspective on tough decisions' },
          { name: 'onboard-me', hint: 'Guided codebase onboarding for new team members' },
        ],
      },
      tones: {
        title: 'Communication Tones',
        description: 'Sets how your agent communicates — from terse and factual to educational and explanatory.',
        options: [
          { name: 'Precise', hint: 'Direct, factual, minimal commentary' },
          { name: 'Mentor', hint: 'Educational, explains the "why" behind suggestions' },
          { name: 'Pragmatic', hint: 'Balanced, focuses on actionable outcomes' },
        ],
      },
      coreSkillsNote: 'Always included: brainstorming, systematic-debugging, verification-before-completion, health-check, context-resume',
      stepLabel: 'Step',
      prefillsNote: 'Picking an archetype pre-fills domains, principles, skills, and tone. Choose "Create Custom" to set each one yourself.',
    },
    nextTitle: 'Keep going',
    nextLinks: [
      {
        title: 'How it works',
        desc: 'See the file-tree model, the vault, and the learning loop.',
        href: 'how-it-works.html',
      },
      {
        title: 'Teams',
        desc: 'Learn how shared vaults, project links, and playbooks fit together.',
        href: 'teams.html',
      },
      {
        title: 'Docs',
        desc: 'Go deeper on commands, guides, and the current product surface.',
        href: '/docs/',
      },
    ],
  },
  uk: {
    title: 'Початок роботи - Soleri',
    description:
      "Від нуля до другого мозку за п'ять хвилин. Встановіть Soleri, побудуйте свій перший мозок та починайте накопичувати знання.",
    eyebrow: "Від нуля до другого мозку за п'ять хвилин",
    heroTitle: 'Ваш другий мозок починає розумним. Далі стає лише розумнішим.',
    heroSubtitle: 'Три кроки. Жодних файлів конфігурації. Жодних API-ключів.',
    steps: [
      {
        title: 'Встановіть',
        text: 'Один глобальний пакет npm. І все.',
        code: `<span class="prompt">$</span> <span class="cmd">npm install</span> <span class="arg">-g @soleri/cli</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Створіть свого агента',
        text: 'Керований майстер проведе вас через кожний крок — оберіть архетип, назвіть агента, виберіть домени, принципи та тон. Ваш агент — це тека, готова одразу.',
        code: `<span class="prompt">$</span> <span class="cmd">soleri create</span>

<span class="cmt">◆ Який тип агента?     Security Auditor</span>
<span class="cmt">◆ Ім'я:                Sentinel</span>
<span class="cmt">◆ ID агента:           sentinel</span>
<span class="cmt">◆ Домени:              security, code-review</span>
<span class="cmt">◆ Принципи:            Security first, Zero trust...</span>
<span class="cmt">◆ Тон:                 Precise</span>

<span class="ok">✓</span> Створено agent.yaml
<span class="ok">✓</span> Згенеровано instructions/, workflows/, knowledge/
<span class="ok">✓</span> Автоматично зібрано CLAUDE.md
<span class="ok">✓</span> Готово — без етапу збірки

<span class="cmt">Запустіть: soleri install && soleri dev</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Активуйте та розвивайте',
        text: 'Зареєструйте рушій, привітайтеся в your editor. Ваш агент активується, захоплює знання під час роботи та стає розумнішим з часом.',
        code: `<span class="cmt"># Зареєструйте та запустіть рушій</span>
<span class="prompt">$</span> <span class="cmd">soleri install</span>       <span class="cmt"># реєстрація MCP-сервера</span>
<span class="prompt">$</span> <span class="cmd">soleri dev</span>           <span class="cmt"># запуск рушія + спостереження за файлами</span>

<span class="cmt"># В your editor — активуйте персону</span>
<span class="prompt">></span> <span class="cmd">Hello, Sentinel!</span>

<span class="ok">✓</span> Персону активовано     <span class="val">Sentinel — Security Auditor</span>
<span class="ok">✓</span> Сховище готове          <span class="val">зростатиме під час роботи</span>
<span class="ok">✓</span> Мозок працює           <span class="val">навчається з кожної сесії</span>

<span class="cmt"># Перевірте стан</span>
<span class="prompt">$</span> <span class="cmd">soleri doctor</span>

<span class="ok">✓</span> Node.js     <span class="val">v22.x</span>
<span class="ok">✓</span> Агент       <span class="val">файлова тека, зареєстровано</span>
<span class="ok">✓</span> Рушій       <span class="val">підключено, 326 операцій</span>`,
        isInstallCmd: false,
      },
    ],
    wizardRef: {
      sectionTitle: 'Довідник майстра',
      sectionSubtitle: 'Усе, що пропонує майстер на кожному кроці — щоб ви знали, що обираєте, ще до вибору.',
      archetypes: {
        title: 'Архетипи',
        description: 'Оберіть архетип для автозаповнення ролі, доменів, принципів, навичок та привітання. Або оберіть "Створити власний" для повного контролю з прикладами.',
        options: [
          { name: 'Code Reviewer', hint: 'Знаходить баги, перевіряє патерни, рев\'ю PR перед мержем' },
          { name: 'Security Auditor', hint: 'OWASP Top 10, сканування залежностей, виявлення секретів' },
          { name: 'API Architect', hint: 'REST/GraphQL дизайн, валідація контрактів, версіонування' },
          { name: 'Test Engineer', hint: 'Генерація тестів, аналіз покриття, TDD робочий процес' },
          { name: 'DevOps Pilot', hint: 'CI/CD пайплайни, інфраструктура, автоматизація деплою' },
          { name: 'Database Architect', hint: 'Проєктування схем, міграції, оптимізація запитів' },
          { name: 'Full-Stack Assistant', hint: 'Універсальний помічник для всього стеку' },
        ],
      },
      domains: {
        title: 'Домени',
        description: 'Кожен домен дає вашому агенту окрему сферу експертизи з власним фасадом знань.',
        options: [
          { name: 'security', hint: 'Сканування вразливостей, моделювання загроз, виявлення секретів' },
          { name: 'code-review', hint: 'Перевірка патернів, виявлення антипатернів, рев\'ю PR' },
          { name: 'testing', hint: 'Генерація тестів, аналіз покриття, мутаційне тестування' },
          { name: 'api-design', hint: 'REST/GraphQL контракти, версіонування, обробка помилок' },
          { name: 'performance', hint: 'Бюджети, профілювання, розмір бандлу, оптимізація запитів' },
          { name: 'accessibility', hint: 'WCAG відповідність, скрінрідери, клавіатурна навігація' },
          { name: 'architecture', hint: 'Системний дизайн, межі, управління залежностями' },
          { name: 'database', hint: 'Проєктування схем, міграції, індексування, тюнінг запитів' },
          { name: 'documentation', hint: 'API документація, README, журнали змін, коментарі коду' },
          { name: 'devops', hint: 'CI/CD пайплайни, інфраструктура як код, деплой' },
        ],
      },
      principles: {
        title: 'Принципи',
        description: 'Керівні правила, яких дотримується ваш агент при прийнятті рішень. Організовані за категоріями.',
        options: [
          { name: 'Simplicity over cleverness', hint: 'Якість' },
          { name: 'Convention over configuration', hint: 'Якість' },
          { name: 'Test everything that can break', hint: 'Якість' },
          { name: 'Respect existing patterns', hint: 'Якість' },
          { name: 'Security first', hint: 'Безпека' },
          { name: 'Fail closed, not open', hint: 'Безпека' },
          { name: 'Zero trust by default', hint: 'Безпека' },
          { name: 'Least privilege always', hint: 'Безпека' },
          { name: 'Actionable feedback only', hint: 'Досвід розробника' },
          { name: 'Explain the why, not just the what', hint: 'Досвід розробника' },
          { name: 'Every comment includes a fix suggestion', hint: 'Досвід розробника' },
          { name: 'Design for the consumer, not the implementer', hint: 'Досвід розробника' },
          { name: 'Graceful degradation over hard failures', hint: 'Надійність' },
          { name: 'Automate everything repeatable', hint: 'Надійність' },
          { name: 'Observability built in from day one', hint: 'Надійність' },
          { name: 'Every migration must be reversible', hint: 'Надійність' },
        ],
      },
      skills: {
        title: 'Навички',
        description: 'Навички — це можливості, які ваш агент може використовувати під час сесій. Базові навички включені завжди; додаткові обираються за архетипом або вручну.',
        options: [
          { name: 'writing-plans', hint: 'Структуроване багатокрокове планування перед змінами коду' },
          { name: 'executing-plans', hint: 'Виконання затверджених планів з контрольними точками' },
          { name: 'vault-navigator', hint: 'Глибокий пошук та дослідження сховища знань' },
          { name: 'vault-capture', hint: 'Збереження уроків у сховище знань' },
          { name: 'knowledge-harvest', hint: 'Витягування патернів із завершеної роботи' },
          { name: 'brain-debrief', hint: 'Підсумок та дебрифінг інтелектуальних задач' },
          { name: 'code-patrol', hint: 'Сканування антипатернів та порушень коду' },
          { name: 'test-driven-development', hint: 'TDD робочий процес: red, green, refactor' },
          { name: 'fix-and-learn', hint: 'Виправлення багів та захоплення уроку на майбутнє' },
          { name: 'retrospective', hint: 'Ретроспектива та рефлексія після сесії' },
          { name: 'second-opinion', hint: 'Свіжий погляд на складні рішення' },
          { name: 'onboard-me', hint: 'Керований онбординг кодової бази для нових учасників' },
        ],
      },
      tones: {
        title: 'Тони комунікації',
        description: 'Визначає, як ваш агент спілкується — від стислого й фактичного до навчального й пояснювального.',
        options: [
          { name: 'Precise', hint: 'Прямий, фактичний, мінімум коментарів' },
          { name: 'Mentor', hint: 'Навчальний, пояснює "чому" за кожною пропозицією' },
          { name: 'Pragmatic', hint: 'Збалансований, фокус на практичних результатах' },
        ],
      },
      coreSkillsNote: 'Завжди включені: brainstorming, systematic-debugging, verification-before-completion, health-check, context-resume',
      stepLabel: 'Крок',
      prefillsNote: 'Обравши архетип, ви автоматично заповнюєте домени, принципи, навички та тон. Оберіть "Створити власний" для повного контролю.',
    },
    nextTitle: 'Продовжуйте',
    nextLinks: [
      {
        title: 'Як це працює',
        desc: 'Пояснення архітектури сховища, мозку та транспорту.',
        href: 'how-it-works.html',
      },
      {
        title: 'Ваш Агент',
        desc: 'Створюйте, налаштовуйте та розширюйте знання свого агента.',
        href: 'personas.html',
      },
      {
        title: 'Команди та Опс',
        desc: 'Спільні сховища, пакети знань та бот у Telegram.',
        href: 'teams.html',
      },
    ],
  },
  it: {
    title: 'Inizia - Soleri',
    description:
      'Da zero a un sistema di apprendimento in cinque minuti. Installa Soleri, crea il tuo primo agente e inizia ad accumulare conoscenza.',
    eyebrow: 'Da zero a un secondo cervello in cinque minuti',
    heroTitle: 'Il tuo secondo cervello parte intelligente. Diventa solo più intelligente.',
    heroSubtitle:
      'Tre passaggi. Nessun file di configurazione da scrivere. Nessuna chiave API richiesta.',
    steps: [
      {
        title: 'Installa',
        text: 'Un solo pacchetto global npm. Tutto qui.',
        code: `<span class="prompt">$</span> <span class="cmd">npm install</span> <span class="arg">-g @soleri/cli</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Crea il tuo agente',
        text: 'Il wizard guidato ti accompagna passo dopo passo — scegli un archetipo, dai un nome al tuo agente, seleziona domini, principi e tono. Il tuo agente è una cartella, pronta all\'istante.',
        code: `<span class="prompt">$</span> <span class="cmd">soleri create</span>

<span class="cmt">◆ Tipo di agente?      Security Auditor</span>
<span class="cmt">◆ Nome:                Sentinel</span>
<span class="cmt">◆ ID agente:           sentinel</span>
<span class="cmt">◆ Domini:              security, code-review</span>
<span class="cmt">◆ Principi:            Security first, Zero trust...</span>
<span class="cmt">◆ Tono:                Precise</span>

<span class="ok">✓</span> Creato agent.yaml
<span class="ok">✓</span> Generati instructions/, workflows/, knowledge/
<span class="ok">✓</span> CLAUDE.md composto automaticamente
<span class="ok">✓</span> Pronto — nessun passaggio di build

<span class="cmt">Esegui: soleri install && soleri dev</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Attiva e fai crescere',
        text: 'Registra il motore, saluta in your editor. Il tuo agente si attiva, cattura conoscenza mentre lavori e diventa più intelligente nel tempo.',
        code: `<span class="cmt"># Registra e avvia il motore</span>
<span class="prompt">$</span> <span class="cmd">soleri install</span>       <span class="cmt"># registra server MCP</span>
<span class="prompt">$</span> <span class="cmd">soleri dev</span>           <span class="cmt"># avvia motore + osserva file</span>

<span class="cmt"># In your editor — attiva la persona</span>
<span class="prompt">></span> <span class="cmd">Hello, Sentinel!</span>

<span class="ok">✓</span> Persona attivata       <span class="val">Sentinel — Security Auditor</span>
<span class="ok">✓</span> Vault pronto           <span class="val">cresce mentre lavori</span>
<span class="ok">✓</span> Cervello attivo        <span class="val">impara da ogni sessione</span>

<span class="cmt"># Verifica che tutto funzioni</span>
<span class="prompt">$</span> <span class="cmd">soleri doctor</span>

<span class="ok">✓</span> Node.js     <span class="val">v22.x</span>
<span class="ok">✓</span> Agente      <span class="val">file-tree, registrato</span>
<span class="ok">✓</span> Motore      <span class="val">connesso, 326 operazioni</span>`,
        isInstallCmd: false,
      },
    ],
    wizardRef: {
      sectionTitle: 'Riferimento del wizard',
      sectionSubtitle: 'Tutto ciò che il wizard offre ad ogni passo — per sapere cosa stai scegliendo prima di sceglierlo.',
      archetypes: {
        title: 'Archetipi',
        description: 'Scegli un archetipo per precompilare ruolo, domini, principi, skill e saluto. Oppure scegli "Crea personalizzato" per il pieno controllo con esempi guidati.',
        options: [
          { name: 'Code Reviewer', hint: 'Trova bug, verifica pattern, revisiona PR prima del merge' },
          { name: 'Security Auditor', hint: 'OWASP Top 10, scansione dipendenze, rilevamento segreti' },
          { name: 'API Architect', hint: 'Design REST/GraphQL, validazione contratti, versionamento' },
          { name: 'Test Engineer', hint: 'Generazione test, analisi copertura, workflow TDD' },
          { name: 'DevOps Pilot', hint: 'Pipeline CI/CD, infrastruttura, automazione deploy' },
          { name: 'Database Architect', hint: 'Design schema, migrazioni, ottimizzazione query' },
          { name: 'Full-Stack Assistant', hint: 'Assistente generico per l\'intero stack' },
        ],
      },
      domains: {
        title: 'Domini',
        description: 'Ogni dominio fornisce al tuo agente un\'area di competenza dedicata con la propria facciata di conoscenza.',
        options: [
          { name: 'security', hint: 'Scansione vulnerabilità, modellazione minacce, rilevamento segreti' },
          { name: 'code-review', hint: 'Verifica pattern, rilevamento anti-pattern, revisione PR' },
          { name: 'testing', hint: 'Generazione test, analisi copertura, test di mutazione' },
          { name: 'api-design', hint: 'Contratti REST/GraphQL, versionamento, gestione errori' },
          { name: 'performance', hint: 'Budget, profilazione, dimensione bundle, ottimizzazione query' },
          { name: 'accessibility', hint: 'Conformità WCAG, screen reader, navigazione tastiera' },
          { name: 'architecture', hint: 'Design di sistema, confini, gestione dipendenze' },
          { name: 'database', hint: 'Design schema, migrazioni, indicizzazione, tuning query' },
          { name: 'documentation', hint: 'Documentazione API, README, changelog, commenti codice' },
          { name: 'devops', hint: 'Pipeline CI/CD, infrastruttura come codice, deploy' },
        ],
      },
      principles: {
        title: 'Principi',
        description: 'Regole guida che il tuo agente segue nelle decisioni. Organizzati per categoria.',
        options: [
          { name: 'Simplicity over cleverness', hint: 'Qualità' },
          { name: 'Convention over configuration', hint: 'Qualità' },
          { name: 'Test everything that can break', hint: 'Qualità' },
          { name: 'Respect existing patterns', hint: 'Qualità' },
          { name: 'Security first', hint: 'Sicurezza' },
          { name: 'Fail closed, not open', hint: 'Sicurezza' },
          { name: 'Zero trust by default', hint: 'Sicurezza' },
          { name: 'Least privilege always', hint: 'Sicurezza' },
          { name: 'Actionable feedback only', hint: 'Esperienza sviluppatore' },
          { name: 'Explain the why, not just the what', hint: 'Esperienza sviluppatore' },
          { name: 'Every comment includes a fix suggestion', hint: 'Esperienza sviluppatore' },
          { name: 'Design for the consumer, not the implementer', hint: 'Esperienza sviluppatore' },
          { name: 'Graceful degradation over hard failures', hint: 'Affidabilità' },
          { name: 'Automate everything repeatable', hint: 'Affidabilità' },
          { name: 'Observability built in from day one', hint: 'Affidabilità' },
          { name: 'Every migration must be reversible', hint: 'Affidabilità' },
        ],
      },
      skills: {
        title: 'Skill',
        description: 'Le skill sono capacità che il tuo agente può usare durante le sessioni. Le skill core sono sempre incluse; quelle opzionali si selezionano per archetipo o manualmente.',
        options: [
          { name: 'writing-plans', hint: 'Pianificazione strutturata multi-step prima delle modifiche' },
          { name: 'executing-plans', hint: 'Esecuzione piani approvati con checkpoint di revisione' },
          { name: 'vault-navigator', hint: 'Ricerca approfondita ed esplorazione del vault' },
          { name: 'vault-capture', hint: 'Salva le lezioni apprese nel vault della conoscenza' },
          { name: 'knowledge-harvest', hint: 'Estrai pattern dal lavoro completato' },
          { name: 'brain-debrief', hint: 'Riepilogo e debriefing post-task' },
          { name: 'code-patrol', hint: 'Scansione anti-pattern e violazioni del codice' },
          { name: 'test-driven-development', hint: 'Workflow TDD: red, green, refactor' },
          { name: 'fix-and-learn', hint: 'Correggi bug e cattura la lezione per il futuro' },
          { name: 'retrospective', hint: 'Retrospettiva e riflessione a fine sessione' },
          { name: 'second-opinion', hint: 'Prospettiva fresca su decisioni difficili' },
          { name: 'onboard-me', hint: 'Onboarding guidato della codebase per nuovi membri' },
        ],
      },
      tones: {
        title: 'Toni di comunicazione',
        description: 'Imposta come il tuo agente comunica — da conciso e fattuale a educativo ed esplicativo.',
        options: [
          { name: 'Precise', hint: 'Diretto, fattuale, commenti minimi' },
          { name: 'Mentor', hint: 'Educativo, spiega il "perché" dietro ogni suggerimento' },
          { name: 'Pragmatic', hint: 'Bilanciato, focus su risultati concreti' },
        ],
      },
      coreSkillsNote: 'Sempre incluse: brainstorming, systematic-debugging, verification-before-completion, health-check, context-resume',
      stepLabel: 'Passo',
      prefillsNote: 'Scegliendo un archetipo si precompilano domini, principi, skill e tono. Scegli "Crea personalizzato" per impostare tutto manualmente.',
    },
    nextTitle: 'Continua',
    nextLinks: [
      {
        title: 'Come funziona',
        desc: 'Vault, cervello e architettura di trasporto.',
        href: 'how-it-works.html',
      },
      {
        title: 'Il tuo agente',
        desc: 'Crea, configura e sviluppa le conoscenze del tuo agente.',
        href: 'personas.html',
      },
      {
        title: 'Team e Ops',
        desc: 'Vault condivisi, pacchetti di conoscenza e bot Telegram.',
        href: 'teams.html',
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

interface WizardOption {
  name: string;
  hint: string;
}

interface WizardSection {
  title: string;
  description: string;
  options: WizardOption[];
}

interface WizardRef {
  sectionTitle: string;
  sectionSubtitle: string;
  archetypes: WizardSection;
  domains: WizardSection;
  principles: WizardSection;
  skills: WizardSection;
  tones: WizardSection;
  coreSkillsNote: string;
  stepLabel: string;
  prefillsNote: string;
}

interface GettingStartedContent {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  steps: Step[];
  wizardRef: WizardRef;
  nextTitle: string;
  nextLinks: NextLink[];
}
