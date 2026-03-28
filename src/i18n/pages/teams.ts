import type { Locale } from '../types';

export const teamsContent = (locale: Locale) => content[locale];

interface TeamsSection {
  title: string;
  subtitle: string;
  text: string;
  code: string;
}

interface TeamsContent {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  sections: TeamsSection[];
}

const content: Record<Locale, TeamsContent> = {
  en: {
    meta: {
      title: 'Teams - Soleri',
      description:
        'Give each teammate a personal agent while sharing project and team knowledge through linked vaults, packs, and governance.',
    },
    hero: {
      eyebrow: 'Teams',
      title: 'Every teammate gets an agent. Knowledge stays in sync.',
      subtitle:
        'Personal by default. Shared when it helps. No central server — just Git and plain files.',
    },
    sections: [
      {
        title: 'Every teammate, their own agent.',
        subtitle: 'Your agent starts personal, and stays yours.',
        text: "Each teammate scaffolds their own agent with a personal vault on their machine. Preferences, notes, and recurring fixes stay private by default. Nobody sees your personal knowledge unless you explicitly share it.",
        code: `<span class="dim">// Each person has their own agent</span>
<span class="hl">You:</span>     What are my code review preferences?
<span class="hl">Agent:</span>   From your personal vault:
         - Always check error handling first
         - Flag any function over 50 lines
         - Skip nitpicks on draft PRs
         <span class="dim">(only you see these)</span>`,
      },
      {
        title: 'Share what helps. Keep the rest.',
        subtitle: 'Opt-in team patterns, without the cloud.',
        text: "Teams share patterns by committing a shared vault to Git — only if they want to. Your agent can connect shared vault sources alongside your personal vault. Search blends both: your knowledge ranks higher, team standards appear when relevant.",
        code: `<span class="cmt"># Connect the team vault (one time)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Connected: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 team patterns now available in search
<span class="ok">\u2713</span> Your personal vault still ranks first

<span class="cmt"># Teammates do the same — no server needed</span>`,
      },
      {
        title: 'Ship patterns like dependencies.',
        subtitle: 'Package team knowledge the way you ship code.',
        text: "Bundle team knowledge into JSON packs and distribute them like any dependency. Install via local path or npm in one command, then version alongside your codebase. Great for error-handling standards, review checklists, and API conventions.",
        code: `<span class="cmt"># Install a team knowledge pack</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Installed team-standards@0.2.0
<span class="ok">\u2713</span> 18 patterns, 4 playbooks, 2 skills

<span class="cmt"># Or from npm</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">@your-org/api-conventions</span>
<span class="ok">\u2713</span> Installed api-conventions@1.0.0`,
      },
      {
        title: 'New teammate? Up to speed in minutes.',
        subtitle: 'Current knowledge, ranked and ready.',
        text: "A new teammate scaffolds their agent, connects the shared vault, and starts searching immediately. Results prioritize the most critical team patterns first, not whatever a wiki page last said. Playbooks encode processes they can run step by step.",
        code: `<span class="dim">// Day 1 — new developer joins</span>
<span class="hl">New dev:</span>  What are the critical patterns
          for this project?
<span class="hl">Agent:</span>    Top patterns from the team vault:
          1. API errors: { error, code, details }
          2. Auth: httpOnly cookies, never localStorage
          3. DB: always set migration rollback
          4. Tests: name files *.test.ts, not *.spec.ts

          <span class="ok">Want me to walk you through</span>
          <span class="ok">the code review playbook?</span>`,
      },
      {
        title: 'Control what gets in.',
        subtitle: 'Governance that feels like PR review.',
        text: "Gates control how knowledge enters the shared vault, so quality stays high. Low-risk suggestions auto-approve, while critical patterns require review. Quotas, duplicate detection, and decay prevent knowledge spam and keep standards current.",
        code: `<span class="cmt"># Set governance for the team vault</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli governance</span> <span class="arg">--preset moderate</span>

<span class="ok">Policy:</span>
  Suggestions     <span class="ok">auto-approve</span>
  Warnings        <span class="val">propose for review</span>
  Critical        <span class="val">propose for review</span>
  Quota           50 entries per domain
  Duplicate check <span class="ok">enabled</span>

<span class="cmt"># Like PR review, but for team knowledge</span>`,
      },
    ],
  },
  uk: {
    meta: {
      title: 'Команди - Soleri',
      description:
        'Кожен учасник отримує персонального агента, а командні знання синхронізуються через Git та пакети знань.',
    },
    hero: {
      eyebrow: 'Команди',
      title: 'Кожен учасник отримує агента. Знання залишаються синхронізованими.',
      subtitle:
        'Персональний за замовчуванням. Спільний, коли це допомагає. Без центрального сервера — лише Git та прості файли.',
    },
    sections: [
      {
        title: 'Кожному — свій агент.',
        subtitle: 'Ваш агент починає персональним і залишається вашим.',
        text: 'Кожен учасник команди створює власного агента з персональним сховищем на своїй машині. Вподобання, нотатки та повторювані виправлення залишаються приватними за замовчуванням. Ніхто не бачить ваших персональних знань, поки ви не вирішите поділитися.',
        code: `<span class="dim">// Кожен має свого агента</span>
<span class="hl">Ти:</span>      Які мої вподобання для код-рев\u0027ю?
<span class="hl">Агент:</span>   З твого персонального сховища:
         - Завжди перевіряй обробку помилок першою
         - Позначай функції довші за 50 рядків
         - Пропускай дрібниці в чернеткових PR
         <span class="dim">(бачите лише ви)</span>`,
      },
      {
        title: 'Діліться корисним. Решту залиште собі.',
        subtitle: 'Командні патерни за бажанням, без хмари.',
        text: 'Команди діляться патернами, комітячи спільне сховище в Git — тільки за бажанням. Ваш агент може підключити спільні джерела поруч з персональним сховищем. Пошук поєднує обидва: ваші знання мають вищий пріоритет.',
        code: `<span class="cmt"># Підключити командне сховище (один раз)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Підключено: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 командні патерни доступні в пошуку
<span class="ok">\u2713</span> Ваше персональне сховище все ще першим

<span class="cmt"># Колеги роблять те саме — сервер не потрібен</span>`,
      },
      {
        title: 'Поширюйте патерни як залежності.',
        subtitle: 'Пакуйте командні знання як код.',
        text: 'Зберіть командні знання у JSON-пакети та поширюйте як будь-яку залежність. Встановлення через локальний шлях або npm однією командою. Версіонування разом з кодовою базою.',
        code: `<span class="cmt"># Встановити пакет командних знань</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Встановлено team-standards@0.2.0
<span class="ok">\u2713</span> 18 патернів, 4 плейбуки, 2 навички

<span class="cmt"># Або з npm</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">@your-org/api-conventions</span>
<span class="ok">\u2713</span> Встановлено api-conventions@1.0.0`,
      },
      {
        title: 'Новий колега? Готовий за хвилини.',
        subtitle: 'Актуальні знання, ранжовані та готові.',
        text: 'Новий учасник створює свого агента, підключає спільне сховище і одразу починає шукати. Результати пріоритизують найкритичніші командні патерни. Плейбуки кодують процеси, які можна виконувати крок за кроком.',
        code: `<span class="dim">// День 1 — новий розробник приєднується</span>
<span class="hl">Новий:</span>   Які критичні патерни для цього проєкту?
<span class="hl">Агент:</span>   Топ патерни з командного сховища:
         1. API помилки: { error, code, details }
         2. Auth: httpOnly cookies, ніколи localStorage
         3. БД: завжди встановлюй rollback міграції
         4. Тести: файли *.test.ts, не *.spec.ts

         <span class="ok">Хочеш пройти плейбук</span>
         <span class="ok">код-рев\u0027ю?</span>`,
      },
      {
        title: 'Контролюйте, що потрапляє.',
        subtitle: 'Governance як рев\u0027ю pull request\u0027ів.',
        text: 'Гейти контролюють, як знання потрапляють до спільного сховища. Пропозиції з низьким ризиком затверджуються автоматично, критичні патерни вимагають рев\u0027ю. Квоти, виявлення дублікатів та згасання запобігають спаму знань.',
        code: `<span class="cmt"># Налаштувати governance для командного сховища</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli governance</span> <span class="arg">--preset moderate</span>

<span class="ok">Політика:</span>
  Пропозиції      <span class="ok">авто-затвердження</span>
  Попередження     <span class="val">на рев\u0027ю</span>
  Критичні         <span class="val">на рев\u0027ю</span>
  Квота            50 записів на домен
  Перевірка дублів <span class="ok">увімкнено</span>

<span class="cmt"># Як рев\u0027ю PR, але для командних знань</span>`,
      },
    ],
  },
  it: {
    meta: {
      title: 'Team - Soleri',
      description:
        'Ogni membro del team ottiene un agente personale, mentre la conoscenza condivisa si sincronizza tramite Git e pacchetti.',
    },
    hero: {
      eyebrow: 'Team',
      title: 'Ogni membro del team ha un agente. La conoscenza resta sincronizzata.',
      subtitle:
        'Personale per default. Condiviso quando serve. Nessun server centrale — solo Git e file semplici.',
    },
    sections: [
      {
        title: 'A ciascuno il proprio agente.',
        subtitle: 'Il tuo agente nasce personale e resta tuo.',
        text: "Ogni membro del team crea il proprio agente con un vault personale sulla propria macchina. Preferenze, note e fix ricorrenti restano privati per default. Nessuno vede le tue conoscenze personali a meno che tu non decida di condividerle.",
        code: `<span class="dim">// Ognuno ha il proprio agente</span>
<span class="hl">Tu:</span>      Quali sono le mie preferenze per la code review?
<span class="hl">Agente:</span>  Dal tuo vault personale:
         - Controlla sempre prima la gestione errori
         - Segnala funzioni oltre 50 righe
         - Ignora i nitpick sulle PR in bozza
         <span class="dim">(solo tu le vedi)</span>`,
      },
      {
        title: 'Condividi ciò che aiuta. Tieni il resto.',
        subtitle: 'Pattern di team opt-in, senza cloud.',
        text: "I team condividono pattern committando un vault condiviso su Git — solo se vogliono. Il tuo agente può connettere fonti vault condivise accanto al tuo vault personale. La ricerca combina entrambi: le tue conoscenze hanno priorità.",
        code: `<span class="cmt"># Connetti il vault del team (una volta)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Connesso: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 pattern del team ora disponibili nella ricerca
<span class="ok">\u2713</span> Il tuo vault personale resta prioritario

<span class="cmt"># I colleghi fanno lo stesso — nessun server</span>`,
      },
      {
        title: 'Distribuisci pattern come dipendenze.',
        subtitle: 'Impacchetta la conoscenza del team come codice.',
        text: "Raggruppa la conoscenza del team in pack JSON e distribuiscili come qualsiasi dipendenza. Installazione da path locale o npm con un comando. Versioning insieme alla codebase.",
        code: `<span class="cmt"># Installa un pack di conoscenza del team</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Installato team-standards@0.2.0
<span class="ok">\u2713</span> 18 pattern, 4 playbook, 2 skill

<span class="cmt"># Oppure da npm</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">@your-org/api-conventions</span>
<span class="ok">\u2713</span> Installato api-conventions@1.0.0`,
      },
      {
        title: 'Nuovo collega? Pronto in pochi minuti.',
        subtitle: 'Conoscenza attuale, ordinata e pronta.',
        text: "Un nuovo collega crea il proprio agente, connette il vault condiviso e inizia subito a cercare. I risultati danno priorità ai pattern critici del team. I playbook codificano i processi da seguire passo dopo passo.",
        code: `<span class="dim">// Giorno 1 — nuovo sviluppatore</span>
<span class="hl">Nuovo:</span>   Quali sono i pattern critici
         per questo progetto?
<span class="hl">Agente:</span>  Top pattern dal vault del team:
         1. Errori API: { error, code, details }
         2. Auth: httpOnly cookie, mai localStorage
         3. DB: sempre impostare rollback migrazione
         4. Test: file *.test.ts, non *.spec.ts

         <span class="ok">Vuoi che ti guidi attraverso</span>
         <span class="ok">il playbook di code review?</span>`,
      },
      {
        title: 'Controlla cosa entra.',
        subtitle: 'Governance come review delle PR.',
        text: "I gate controllano come la conoscenza entra nel vault condiviso. I suggerimenti a basso rischio si approvano automaticamente, i pattern critici richiedono review. Quote, rilevamento duplicati e decay prevengono lo spam.",
        code: `<span class="cmt"># Imposta governance per il vault del team</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli governance</span> <span class="arg">--preset moderate</span>

<span class="ok">Policy:</span>
  Suggerimenti     <span class="ok">auto-approvazione</span>
  Warning          <span class="val">proponi per review</span>
  Critici          <span class="val">proponi per review</span>
  Quota            50 entry per dominio
  Controllo dupl.  <span class="ok">abilitato</span>

<span class="cmt"># Come review delle PR, ma per la conoscenza</span>`,
      },
    ],
  },
};
