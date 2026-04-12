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
      title: 'Teams -- Soleri',
      description:
        'Every teammate gets their own agent. Project knowledge stays shared through Git, linked vaults, and knowledge packs.',
    },
    hero: {
      eyebrow: 'Teams',
      title: 'Everyone gets an agent. The knowledge stays shared.',
      subtitle:
        'Each person\'s agent is theirs. Team knowledge travels through Git and plain files. No server to run.',
    },
    sections: [
      {
        title: 'Your agent is yours.',
        subtitle: 'Personal by default. You decide what to share.',
        text: 'It fits the way you work. Personal notes, shortcuts, preferences, all private. You share what you want, when you want.',
        code: `<span class="dim">// Each person has their own agent</span>
<span class="hl">You:</span>     What are my code review preferences?
<span class="hl">Agent:</span>   From your personal vault:
         - Always check error handling first
         - Flag any function over 50 lines
         - Skip nitpicks on draft PRs
         <span class="dim">(only you see these)</span>`,
      },
      {
        title: 'Share what\'s useful.',
        subtitle: 'Team conventions, opt-in. No cloud.',
        text: 'When the team agrees on conventions, connect a shared vault. Everyone still works the way they want to. Nobody has to change their setup.',
        code: `<span class="cmt"># Connect the team vault (one time)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Connected: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 team patterns now available in search
<span class="ok">\u2713</span> Your personal vault still ranks first

<span class="cmt"># Teammates do the same — no server needed</span>`,
      },
      {
        title: 'Distribute knowledge like code.',
        subtitle: 'Version it, install it, keep everyone on the same page.',
        text: 'Package your team\'s standards the same way you\'d ship a library. Version them, publish them, install with one command.',
        code: `<span class="cmt"># Install a team knowledge pack</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Installed team-standards@0.2.0
<span class="ok">\u2713</span> 18 patterns, 4 playbooks, 2 skills

<span class="cmt"># Or from npm</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">@your-org/api-conventions</span>
<span class="ok">\u2713</span> Installed api-conventions@1.0.0`,
      },
      {
        title: 'New person? Ready in minutes.',
        subtitle: 'They get the current standards on day one.',
        text: 'New teammate connects the team vault and immediately sees every convention, ranked by importance. Beats a week of reading onboarding docs nobody maintains.',
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
        subtitle: 'Works like PR review, but for knowledge.',
        text: 'Shared stuff goes through review before it\'s live. You set the rules: auto-approve the small things, require sign-off on the rest.',
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
        'У кожного свій агент. Знання проєкту залишаються спільними через Git, підключені vault та пакети знань.',
    },
    hero: {
      eyebrow: 'Команди',
      title: 'У кожного свій агент. Знання залишаються спільними.',
      subtitle:
        'Агент кожної людини -- її власний. Командні знання подорожують через Git і прості файли. Без сервера.',
    },
    sections: [
      {
        title: 'Твій агент -- твій.',
        subtitle: 'Персональний за замовчуванням. Ти вирішуєш, чим ділитися.',
        text: 'Він підлаштований під те, як ти працюєш. Особисті нотатки, шорткати, вподобання -- все приватне. Ділишся тим, чим хочеш, коли хочеш.',
        code: `<span class="dim">// У кожного свій агент</span>
<span class="hl">Ти:</span>      Які мої вподобання для код-ревʼю?
<span class="hl">Агент:</span>   З твого персонального vault:
         - Завжди перевіряй обробку помилок першою
         - Позначай функції довші за 50 рядків
         - Пропускай дрібниці в чернеткових PR
         <span class="dim">(бачиш лише ти)</span>`,
      },
      {
        title: 'Діліся корисним.',
        subtitle: 'Командні конвенції, за бажанням. Без хмари.',
        text: 'Коли команда домовилася про конвенції, підключи спільний vault. Кожен все ще працює так, як йому зручно. Нікому не треба міняти свій сетап.',
        code: `<span class="cmt"># Підключити командний vault (один раз)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Підключено: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 командні патерни доступні в пошуку
<span class="ok">\u2713</span> Твій персональний vault все ще першим

<span class="cmt"># Колеги роблять те саме, сервер не потрібен</span>`,
      },
      {
        title: 'Поширюй знання як код.',
        subtitle: 'Версіонуй, встановлюй, тримай всіх на одній хвилі.',
        text: 'Запакуй стандарти команди так само, як шипиш бібліотеку. Версіонуй, публікуй, встановлюй однією командою.',
        code: `<span class="cmt"># Встановити пакет командних знань</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Встановлено team-standards@0.2.0
<span class="ok">\u2713</span> 18 патернів, 4 плейбуки, 2 навички

<span class="cmt"># Або з npm</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli pack install</span> <span class="arg">@your-org/api-conventions</span>
<span class="ok">\u2713</span> Встановлено api-conventions@1.0.0`,
      },
      {
        title: 'Нова людина? Готова за хвилини.',
        subtitle: 'Отримує актуальні стандарти з першого дня.',
        text: 'Новий колега підключає командний vault і одразу бачить кожну конвенцію, ранжовану за важливістю. Краще, ніж тиждень читання доків для онбордингу, які ніхто не підтримує.',
        code: `<span class="dim">// День 1 — новий розробник приєднується</span>
<span class="hl">Новий:</span>   Які критичні патерни для цього проєкту?
<span class="hl">Агент:</span>   Топ патерни з командного vault:
         1. API помилки: { error, code, details }
         2. Auth: httpOnly cookies, ніколи localStorage
         3. БД: завжди встановлюй rollback міграції
         4. Тести: файли *.test.ts, не *.spec.ts

         <span class="ok">Хочеш, проведу тебе</span>
         <span class="ok">по плейбуку код-ревʼю?</span>`,
      },
      {
        title: 'Контролюй, що потрапляє.',
        subtitle: 'Працює як ревʼю PR, але для знань.',
        text: 'Спільне проходить ревʼю перед тим, як стати активним. Ти задаєш правила: авто-затвердження дрібниць, підпис на решту.',
        code: `<span class="cmt"># Налаштувати governance для командного vault</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli governance</span> <span class="arg">--preset moderate</span>

<span class="ok">Політика:</span>
  Пропозиції      <span class="ok">авто-затвердження</span>
  Попередження     <span class="val">на ревʼю</span>
  Критичні         <span class="val">на ревʼю</span>
  Квота            50 записів на домен
  Перевірка дублів <span class="ok">увімкнено</span>

<span class="cmt"># Як ревʼю PR, але для командних знань</span>`,
      },
    ],
  },
  it: {
    meta: {
      title: 'Team -- Soleri',
      description:
        'Ogni membro del team ha il proprio agente. La conoscenza di progetto resta condivisa attraverso Git, vault collegati e knowledge pack.',
    },
    hero: {
      eyebrow: 'Team',
      title: 'Ognuno ha un agente. La conoscenza resta condivisa.',
      subtitle:
        'L\'agente di ogni persona è suo. La conoscenza del team viaggia attraverso Git e file semplici. Nessun server da gestire.',
    },
    sections: [
      {
        title: 'Il tuo agente è tuo.',
        subtitle: 'Personale per default. Tu decidi cosa condividere.',
        text: 'Si adatta al tuo modo di lavorare. Note personali, scorciatoie, preferenze, tutto privato. Condividi quello che vuoi, quando vuoi.',
        code: `<span class="dim">// Ognuno ha il proprio agente</span>
<span class="hl">Tu:</span>      Quali sono le mie preferenze per la code review?
<span class="hl">Agente:</span>  Dal tuo vault personale:
         - Controlla sempre prima la gestione errori
         - Segnala funzioni oltre 50 righe
         - Ignora i nitpick sulle PR in bozza
         <span class="dim">(solo tu le vedi)</span>`,
      },
      {
        title: 'Condividi quello che è utile.',
        subtitle: 'Convenzioni di team, opt-in. Nessun cloud.',
        text: 'Quando il team si accorda sulle convenzioni, colleghi un vault condiviso. Ognuno continua a lavorare come preferisce. Nessuno deve cambiare il proprio setup.',
        code: `<span class="cmt"># Connetti il vault del team (una volta)</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli vault connect</span> <span class="arg">../team-standards</span>

<span class="ok">\u2713</span> Connesso: <span class="val">team-standards</span>
<span class="ok">\u2713</span> 42 pattern del team ora disponibili nella ricerca
<span class="ok">\u2713</span> Il tuo vault personale resta prioritario

<span class="cmt"># I colleghi fanno lo stesso — nessun server</span>`,
      },
      {
        title: 'Distribuisci conoscenza come codice.',
        subtitle: 'Versionala, installala, tieni tutti sulla stessa pagina.',
        text: 'Impacchetta gli standard del tuo team come faresti con una libreria. Versionali, pubblicali, installa con un comando.',
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
        subtitle: 'Riceve gli standard attuali dal primo giorno.',
        text: 'Il nuovo collega collega il vault del team e vede subito ogni convenzione, ordinata per importanza. Meglio di una settimana a leggere doc di onboarding che nessuno mantiene.',
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
        subtitle: 'Funziona come la review delle PR, ma per la conoscenza.',
        text: 'Le cose condivise passano dalla review prima di andare live. Tu imposti le regole: auto-approvazione per le cose piccole, firma richiesta per il resto.',
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
