import type { Locale } from '../types';

export const personasContent = (locale: Locale) => content[locale];

const content: Record<Locale, PersonasContent> = {
  en: {
    title: 'Your Agent - Soleri',
    description:
      'Your agent is a folder. Plain files, no build step, configurable with YAML. It learns your project through the plan-work-capture cycle.',
    heroEyebrow: 'Your agent',
    heroTitle:
      'Just a folder that Soleri engine makes smart.',
    heroSubtitle:
      'Your agent is a folder structure with plain files. Soleri is the engine that gives it memory, planning, and learning.',

    sections: [
      // Section 1: Your agent is a folder
      {
        title: 'Your agent is a folder.',
        subtitle: 'Plain files. No build step. No proprietary format.',
        text: 'Own it like you own your code. Edit it, diff it, version it anywhere.',
        code: `<span class="cmt"># Your agent is a folder</span>
<span class="key">my-agent/</span>
\u251C\u2500\u2500 <span class="val">agent.yaml</span>        <span class="cmt"># identity + config</span>
\u251C\u2500\u2500 <span class="val">instructions/</span>     <span class="cmt"># behavioral rules</span>
\u251C\u2500\u2500 <span class="val">workflows/</span>        <span class="cmt"># repeatable playbooks</span>
\u251C\u2500\u2500 <span class="val">knowledge/</span>        <span class="cmt"># domain expertise</span>
\u251C\u2500\u2500 <span class="val">skills/</span>           <span class="cmt"># agent capabilities</span>
\u2514\u2500\u2500 <span class="val">.mcp.json</span>         <span class="cmt"># connects to the engine</span>`,
      },

      // Section 2: One YAML file
      {
        title: 'One YAML file. Full control.',
        subtitle:
          'Name, role, domains, tone, principles \u2014 all in agent.yaml.',
        text: 'Define how your agent behaves in one place. Change it anytime \u2014 takes effect immediately.',
        code: `<span class="cmt"># agent.yaml</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, testing]</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">principles:</span>
  - <span class="val">Simplicity over cleverness</span>
  - <span class="val">Test before shipping</span>
  - <span class="val">Respect existing patterns</span>`,
      },

      // Section 3: Skills
      {
        title: 'Skills your agent can use.',
        subtitle:
          'Plan, capture, review, debug \u2014 repeatable workflows as files.',
        text: 'Turn your best workflows into repeatable runs. Plan, review, and debug with the same consistency every time.',
        code: `<span class="cmt">Built-in skills:</span>
  <span class="val">brainstorming</span>          <span class="cmt">\u2014 explore ideas before committing</span>
  <span class="val">systematic-debugging</span>   <span class="cmt">\u2014 find root cause, then fix</span>
  <span class="val">verification</span>           <span class="cmt">\u2014 prove before you ship</span>

<span class="cmt">Add more:</span>
  <span class="val">writing-plans</span>          <span class="cmt">\u2014 structured planning</span>
  <span class="val">vault-capture</span>          <span class="cmt">\u2014 save patterns to knowledge</span>
  <span class="val">code-patrol</span>            <span class="cmt">\u2014 scan against your standards</span>
  <span class="val">fix-and-learn</span>          <span class="cmt">\u2014 fix bugs, capture the lesson</span>
  <span class="val">onboard-me</span>             <span class="cmt">\u2014 guided codebase walkthrough</span>`,
      },

      // Section 4: Extend
      {
        title: 'Extend it as you grow.',
        subtitle:
          'Add domains, install packs, customize instructions.',
        text: 'Start lean, scale without friction. Add new knowledge and standards when you need them \u2014 no rebuilds.',
        code: `<span class="cmt"># Add a new domain</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">add-domain security</span>

<span class="cmt"># Install a knowledge pack</span>
<span class="prompt">$</span> <span class="cmd">npx @soleri/cli</span> <span class="arg">pack install ../team-standards</span>
<span class="ok">\u2713</span> 18 patterns, 4 playbooks

<span class="cmt"># Your agent picks up changes automatically</span>
<span class="ok">\u2713</span> CLAUDE.md regenerated`,
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
