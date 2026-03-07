import type { Locale } from '../types';

export const gettingStartedContent = (locale: Locale) => content[locale];

const content: Record<Locale, GettingStartedContent> = {
  en: {
    title: 'Getting Started - Soleri',
    description:
      'From zero to a learning system in five minutes. Install Soleri, create your first agent, and start compounding knowledge.',
    eyebrow: 'From zero to a learning system in five minutes',
    heroTitle: 'Your first agent starts smart. It only gets smarter.',
    heroSubtitle: 'Three steps. No configuration files to write. No API keys required.',
    steps: [
      {
        title: 'Install',
        text: "One global npm package. That's it.",
        code: `<span class="prompt">$</span> <span class="cmd">npm install</span> <span class="arg">-g soleri</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Create your agent',
        text: 'Answer a few questions — name, role, domains. Soleri scaffolds the project, installs dependencies, builds, and registers it as a Claude Code MCP server. Ready to use.',
        code: `<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="cmt">◆ Display name:        My Agent</span>
<span class="cmt">◆ Role:                Frontend architecture advisor</span>
<span class="cmt">◆ Domains:             api-design, security, testing</span>

<span class="ok">✓</span> Scaffolded             <span class="val">16 files, 2 facades, 66 ops</span>
<span class="ok">✓</span> Built                  <span class="val">npm install + npm run build</span>
<span class="ok">✓</span> MCP registered         <span class="cmt">~/.claude.json</span>
<span class="ok">✓</span> 17 skills installed    <span class="cmt">TDD, debugging, planning, vault</span>

<span class="cmt">Restart Claude Code, then say "Hello, My Agent!"</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Activate and grow',
        text: 'Say hello in Claude Code. Your agent activates, captures knowledge as you work, and gets smarter over time. Add domains, install knowledge packs, or let the brain learn from your sessions.',
        code: `<span class="cmt"># In Claude Code — activate the persona</span>
<span class="prompt">></span> <span class="cmd">Hello, My Agent!</span>

<span class="ok">✓</span> Persona activated      <span class="val">My Agent — Frontend architecture advisor</span>
<span class="ok">✓</span> Vault ready            <span class="val">empty — will grow as you work</span>
<span class="ok">✓</span> Brain tracking         <span class="val">enabled — captures patterns from sessions</span>

<span class="cmt"># Add more domains any time</span>
<span class="prompt">$</span> <span class="cmd">soleri add-domain</span> <span class="arg">performance</span>

<span class="ok">✓</span> Created domain         <span class="val">performance</span>
<span class="ok">✓</span> Rebuilt agent

<span class="cmt"># Check everything is healthy</span>
<span class="prompt">$</span> <span class="cmd">soleri doctor</span>

<span class="ok">✓</span> Node.js     <span class="val">v22.x</span>
<span class="ok">✓</span> Agent       <span class="val">built, registered</span>
<span class="ok">✓</span> Hook packs  <span class="val">a11y, clean-commits, typescript-safety</span>`,
        isInstallCmd: false,
      },
    ],
    nextTitle: 'Keep going',
    nextLinks: [
      {
        title: 'How it works',
        desc: 'Vault, brain, and transport architecture explained.',
        href: 'how-it-works.html',
      },
      {
        title: 'Your Agent',
        desc: "Create, configure, and grow your agent's knowledge.",
        href: 'personas.html',
      },
      {
        title: 'Teams &amp; Ops',
        desc: 'Shared vaults, knowledge packs, and Telegram bot.',
        href: 'teams.html',
      },
    ],
  },
  uk: {
    title: 'Початок роботи - Soleri',
    description:
      "Від нуля до навчальної системи за п'ять хвилин. Встановіть Soleri, створіть першого агента та починайте накопичувати знання.",
    eyebrow: "Від нуля до навчальної системи за п'ять хвилин",
    heroTitle: 'Ваш перший агент починає розумним. Далі стає лише розумнішим.',
    heroSubtitle: 'Три кроки. Жодних файлів конфігурації. Жодних API-ключів.',
    steps: [
      {
        title: 'Встановіть',
        text: 'Один глобальний пакет npm. І все.',
        code: `<span class="prompt">$</span> <span class="cmd">npm install</span> <span class="arg">-g soleri</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Створіть свого агента',
        text: "Дайте відповіді на кілька питань — ім'я, роль, домени. Soleri створює проєкт, встановлює залежності, збирає та реєструє його як MCP-сервер для Claude Code. Готовий до роботи.",
        code: `<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="cmt">◆ Ім'я:                My Agent</span>
<span class="cmt">◆ Роль:                Радник з фронтенд-архітектури</span>
<span class="cmt">◆ Домени:              api-design, security, testing</span>

<span class="ok">✓</span> Створено               <span class="val">16 файлів, 2 фасади, 66 операцій</span>
<span class="ok">✓</span> Зібрано                <span class="val">npm install + npm run build</span>
<span class="ok">✓</span> MCP зареєстровано      <span class="cmt">~/.claude.json</span>
<span class="ok">✓</span> 17 навичок встановлено <span class="cmt">TDD, дебагінг, планування, сховище</span>

<span class="cmt">Перезапустіть Claude Code, потім скажіть "Hello, My Agent!"</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Активуйте та розвивайте',
        text: 'Привітайтеся в Claude Code. Ваш агент активується, захоплює знання під час роботи та стає розумнішим з часом. Додавайте домени, встановлюйте пакети знань або дозвольте мозку вчитися з ваших сесій.',
        code: `<span class="cmt"># В Claude Code — активуйте персону</span>
<span class="prompt">></span> <span class="cmd">Hello, My Agent!</span>

<span class="ok">✓</span> Персону активовано     <span class="val">My Agent — Радник з фронтенд-архітектури</span>
<span class="ok">✓</span> Сховище готове          <span class="val">порожнє — зростатиме під час роботи</span>
<span class="ok">✓</span> Мозок працює           <span class="val">увімкнено — захоплює патерни з сесій</span>

<span class="cmt"># Додайте нові домени будь-коли</span>
<span class="prompt">$</span> <span class="cmd">soleri add-domain</span> <span class="arg">performance</span>

<span class="ok">✓</span> Створено домен         <span class="val">performance</span>
<span class="ok">✓</span> Агента перезібрано

<span class="cmt"># Перевірте стан</span>
<span class="prompt">$</span> <span class="cmd">soleri doctor</span>

<span class="ok">✓</span> Node.js     <span class="val">v22.x</span>
<span class="ok">✓</span> Агент       <span class="val">зібрано, зареєстровано</span>
<span class="ok">✓</span> Хук-пакети  <span class="val">a11y, clean-commits, typescript-safety</span>`,
        isInstallCmd: false,
      },
    ],
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
    eyebrow: 'Da zero a un sistema di apprendimento in cinque minuti',
    heroTitle: 'Il tuo primo agente parte intelligente. Diventa solo più intelligente.',
    heroSubtitle:
      'Tre passaggi. Nessun file di configurazione da scrivere. Nessuna chiave API richiesta.',
    steps: [
      {
        title: 'Installa',
        text: 'Un solo pacchetto global npm. Tutto qui.',
        code: `<span class="prompt">$</span> <span class="cmd">npm install</span> <span class="arg">-g soleri</span>`,
        isInstallCmd: true,
      },
      {
        title: 'Crea il tuo agente',
        text: 'Rispondi a poche domande — nome, ruolo, domini. Soleri crea il progetto, installa le dipendenze, compila e lo registra come server MCP per Claude Code. Pronto all\'uso.',
        code: `<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="cmt">◆ Nome:                My Agent</span>
<span class="cmt">◆ Ruolo:               Consulente architettura frontend</span>
<span class="cmt">◆ Domini:              api-design, security, testing</span>

<span class="ok">✓</span> Creato                 <span class="val">16 file, 2 facciate, 66 operazioni</span>
<span class="ok">✓</span> Compilato              <span class="val">npm install + npm run build</span>
<span class="ok">✓</span> MCP registrato         <span class="cmt">~/.claude.json</span>
<span class="ok">✓</span> 17 skill installate    <span class="cmt">TDD, debugging, pianificazione, vault</span>

<span class="cmt">Riavvia Claude Code, poi di' "Hello, My Agent!"</span>`,
        isInstallCmd: false,
      },
      {
        title: 'Attiva e fai crescere',
        text: 'Saluta in Claude Code. Il tuo agente si attiva, cattura conoscenza mentre lavori e diventa più intelligente nel tempo. Aggiungi domini, installa pacchetti di conoscenza o lascia che il cervello impari dalle tue sessioni.',
        code: `<span class="cmt"># In Claude Code — attiva la persona</span>
<span class="prompt">></span> <span class="cmd">Hello, My Agent!</span>

<span class="ok">✓</span> Persona attivata       <span class="val">My Agent — Consulente architettura frontend</span>
<span class="ok">✓</span> Vault pronto           <span class="val">vuoto — crescerà mentre lavori</span>
<span class="ok">✓</span> Cervello attivo        <span class="val">abilitato — cattura pattern dalle sessioni</span>

<span class="cmt"># Aggiungi nuovi domini in qualsiasi momento</span>
<span class="prompt">$</span> <span class="cmd">soleri add-domain</span> <span class="arg">performance</span>

<span class="ok">✓</span> Dominio creato         <span class="val">performance</span>
<span class="ok">✓</span> Agente ricompilato

<span class="cmt"># Verifica che tutto funzioni</span>
<span class="prompt">$</span> <span class="cmd">soleri doctor</span>

<span class="ok">✓</span> Node.js     <span class="val">v22.x</span>
<span class="ok">✓</span> Agente      <span class="val">compilato, registrato</span>
<span class="ok">✓</span> Hook pack   <span class="val">a11y, clean-commits, typescript-safety</span>`,
        isInstallCmd: false,
      },
    ],
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
