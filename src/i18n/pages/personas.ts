import type { Locale } from '../types';

export const personasContent = (locale: Locale) => content[locale];

const content: Record<Locale, PersonasContent> = {
  en: {
    title: 'Your Second Brain - Soleri',
    description:
      "Build a second brain that compounds intelligence over time. Domain-separated knowledge, graph-connected, and always learning.",
    heroEyebrow: 'Your expertise deserves a permanent home',
    heroTitle: "Your second brain should compound intelligence. Scattered notes don't.",
    heroSubtitle:
      'One vault, domain-separated, vectorized, and graph-connected. Knowledge that organizes itself and grows sharper with every session.',

    // Section 1: Create and configure
    section1Title: 'Create and configure',
    section1Code1: `<span class="cmt"># Create a file-tree agent (~3 seconds)</span>
<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="ok">\u2713</span> Created agent.yaml
<span class="ok">\u2713</span> Generated instructions/, workflows/, knowledge/
<span class="ok">\u2713</span> Auto-composed CLAUDE.md
<span class="ok">\u2713</span> Ready \u2014 no build step needed

<span class="cmt">Run: soleri install && soleri dev</span>`,
    section1Code2: `<span class="cmt"># agent.yaml \u2014 single source of truth</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, infrastructure]</span>
<span class="key">principles:</span>
  - <span class="val">Vault is the single source of truth</span>
  - <span class="val">Test before shipping</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">cognee:</span> <span class="val">true</span>     <span class="cmt"># optional vector search</span>
<span class="key">vaults:</span>
  - <span class="key">name:</span> <span class="val">team</span>
    <span class="key">path:</span> <span class="val">~/.soleri/vault.db</span>`,
    section1ContentTitle: 'Folder = agent',
    section1ContentP1:
      'The <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">create</code> command generates a folder with <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">agent.yaml</code>, instructions, workflows, and knowledge bundles. No TypeScript, no build step \u2014 your AI editor reads the folder natively.',
    section1ContentP2:
      'Identity, domains, principles, engine config \u2014 all in one YAML file, version-controlled.',
    section1KeyPoint: 'One vault. All your knowledge. No coordination overhead.',

    // Section 2: Structured vault
    section2Title: 'Structured vault, not knowledge soup',
    section2ContentTitle: 'Domain-separated knowledge',
    section2ContentP1:
      'When everything lives in one flat folder, searching for "button" returns database migration notes alongside CSS patterns. The vault organizes knowledge into domains automatically. Ask about buttons — it searches frontend knowledge first. Ask about databases — it pulls from backend.',
    section2ContentP2: 'One vault. Automatic routing.',
    section2KeyPoint: 'Buttons \u2192 frontend/. Databases \u2192 backend/. Routing is automatic.',
    vaultNodeFrontend: 'React patterns, design tokens, component review, accessibility',
    vaultNodeBackend: 'API conventions, database schemas, auth patterns, performance',
    vaultNodeCrosscut: 'Git workflows, code review, testing strategies, documentation',
    vaultNodeCrosscutLabel: 'Cross-cutting',
    section2Code1: `<span class="cmt"># Domain-aware vault search</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"button styling"</span>

<span class="ok">Searching domain: frontend/</span>

<span class="ok">Found 3 matches:</span>
  <span class="val">pattern-semantic-tokens</span>      <span class="cmt">94% confidence</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">87% confidence</span>
  <span class="val">anti-pattern-inline-styles</span>   <span class="cmt">91% confidence</span>

<span class="cmt">Also found in cross-cutting/:</span>
  <span class="val">pattern-a11y-focus-rings</span>     <span class="cmt">78% confidence</span>`,
    section2Code2: `<span class="cmt"># Vault structure</span>
<span class="key">~/.soleri/vaults/my-agent/</span>
\u251C\u2500\u2500 <span class="val">frontend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">42 entries</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">12 entries</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">8 entries</span>
\u251C\u2500\u2500 <span class="val">backend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">28 entries</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">6 entries</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">15 entries</span>
\u251C\u2500\u2500 <span class="val">cross-cutting/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">18 entries</span>
\u2502   \u2514\u2500\u2500 workflows/         <span class="cmt">5 entries</span>
\u2514\u2500\u2500 <span class="key">index.vec</span>              <span class="cmt">vectorized search index</span>`,

    // Section 3: Knowledge graph
    section3Title: 'Knowledge graph, not flat files',
    section3Code1: `<span class="cmt"># Vault status \u2014 vectorized + graph-connected</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">status</span>

<span class="ok">Vault:</span> my-agent
<span class="ok">Entries:</span>         <span class="val">134</span>
<span class="ok">Vectorized:</span>      <span class="val">134/134 (100%)</span>
<span class="ok">Graph nodes:</span>     <span class="val">134</span>
<span class="ok">Graph edges:</span>     <span class="val">287</span>  <span class="cmt">(Cognee)</span>
<span class="ok">Domains:</span>         <span class="val">3</span>   <span class="cmt">frontend, backend, cross-cutting</span>
<span class="ok">Last indexed:</span>    <span class="val">2 minutes ago</span>`,
    section3Code2: `<span class="cmt"># Graph finds connections across domains</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">related "pattern-semantic-tokens"</span>

<span class="ok">Related patterns (graph distance \u2264 2):</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">frontend/  \u2014 shares tokens</span>
  <span class="val">pattern-theme-switching</span>      <span class="cmt">frontend/  \u2014 token consumer</span>
  <span class="val">anti-pattern-hardcoded-hex</span>   <span class="cmt">frontend/  \u2014 inverse rule</span>
  <span class="val">pattern-api-error-colors</span>     <span class="cmt">backend/   \u2014 cross-domain link</span>

<span class="cmt">4 connections found via Cognee knowledge graph</span>`,
    section3ContentTitle: 'Vectorized, graph-connected, searchable',
    section3ContentP1:
      "Keyword search misses relationships between ideas. Every vault entry is vectorized for semantic search and connected via Cognee's knowledge graph. The system understands how patterns relate — not just what they are.",
    section3ContentP2:
      'Query semantic tokens, and the graph surfaces related button patterns, theme switching rules, and backend error color conventions. Cross-domain connections emerge automatically.',
    section3KeyPoint: 'Relationships between patterns — not just the patterns themselves.',
    graphStep1Title: 'Vectorize',
    graphStep1Desc: 'Every entry gets an embedding for semantic search',
    graphStep2Title: 'Connect',
    graphStep2Desc: 'Cognee builds a knowledge graph across entries',
    graphStep3Title: 'Surface',
    graphStep3Desc: 'Search returns patterns and their connections',

    // Section 4: Vault self-maintenance
    section4Title: 'Vault keeps itself clean',
    section4ContentTitle: 'Auto-maintained knowledge',
    section4ContentP1:
      "Knowledge bases rot when nobody maintains them. The vault doesn't just store knowledge — it curates it. Deduplication catches redundant entries. Decay detection flags stale patterns. Confidence tracking surfaces what works and hides what doesn't.",
    section4ContentP2:
      'No manual cleanup. No knowledge rot. The vault stays sharp as your project evolves.',
    section4KeyPoint: "The vault doesn't just store knowledge — it curates it.",
    section4Code1: `<span class="cmt"># Vault maintenance report</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">maintain</span>

<span class="ok">Maintenance complete:</span>
  <span class="ok">\u2713</span> Deduplicated      <span class="val">3 redundant entries merged</span>
  <span class="ok">\u2713</span> Decay check        <span class="val">2 patterns flagged as stale</span>
  <span class="ok">\u2713</span> Confidence update  <span class="val">8 patterns strengthened</span>
  <span class="ok">\u2713</span> Re-vectorized      <span class="val">5 modified entries</span>
  <span class="ok">\u2713</span> Graph rebuilt       <span class="val">291 edges (was 287)</span>

<span class="warn">Stale patterns (not used in 30+ days):</span>
  <span class="val">pattern-legacy-class-names</span>   <span class="cmt">last used: 45 days ago</span>
  <span class="val">pattern-jquery-selectors</span>     <span class="cmt">last used: 62 days ago</span>

<span class="cmt">Archive stale? soleri vault archive --stale</span>`,
    section4Code2: `<span class="cmt"># Confidence tracking in action</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">confidence:</span> <span class="val">0.94</span>        <span class="cmt"># strengthened over 12 sessions</span>
<span class="key">sessions:</span> <span class="val">12</span>
<span class="key">last_applied:</span> <span class="val">2 hours ago</span>
<span class="key">status:</span> <span class="ok">compounding</span>   <span class="cmt"># surfaces first in search</span>
<span class="key">graph_edges:</span> <span class="val">7</span>          <span class="cmt"># connected to 7 other patterns</span>`,
  },

  uk: {
    title: 'Твій другий мозок — Soleri',
    description:
      'Побудуй другий мозок, що накопичує інтелект з часом. Знання, розділені за доменами, з\'єднані графом та завжди навчаються.',
    heroEyebrow: 'Твоя експертиза заслуговує на постійний дім',
    heroTitle: 'Твій другий мозок має накопичувати інтелект. Розкидані нотатки — ні.',
    heroSubtitle:
      'Єдине сховище, розділене за доменами, векторизоване та з\'єднане графом. Знання, які самоорганізуються та стають гострішими з кожною сесією.',

    // Section 1
    section1Title:
      '\u0421\u0442\u0432\u043E\u0440\u0456\u0442\u044C \u0456 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0439\u0442\u0435',
    section1Code1: `<span class="cmt"># Створіть файловий агент (~3 секунди)</span>
<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="ok">\u2713</span> Створено agent.yaml
<span class="ok">\u2713</span> Згенеровано instructions/, workflows/, knowledge/
<span class="ok">\u2713</span> Автоматично зібрано CLAUDE.md
<span class="ok">\u2713</span> Готово \u2014 без етапу збірки

<span class="cmt">Запустіть: soleri install && soleri dev</span>`,
    section1Code2: `<span class="cmt"># agent.yaml \u2014 єдине джерело правди</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, infrastructure]</span>
<span class="key">principles:</span>
  - <span class="val">Vault is the single source of truth</span>
  - <span class="val">Test before shipping</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">cognee:</span> <span class="val">true</span>     <span class="cmt"># опціональний векторний пошук</span>
<span class="key">vaults:</span>
  - <span class="key">name:</span> <span class="val">team</span>
    <span class="key">path:</span> <span class="val">~/.soleri/vault.db</span>`,
    section1ContentTitle: 'Тека = агент',
    section1ContentP1:
      'Команда <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">create</code> генерує теку з <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">agent.yaml</code>, інструкціями, робочими процесами та знаннями. Без TypeScript, без збірки \u2014 ваш AI-редактор читає теку напряму.',
    section1ContentP2:
      'Ідентичність, домени, принципи, конфігурація рушія \u2014 все в одному YAML-файлі, під контролем версій.',
    section1KeyPoint:
      '\u0404\u0434\u0438\u043D\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435. \u0423\u0441\u0456 \u0432\u0430\u0448\u0456 \u0437\u043D\u0430\u043D\u043D\u044F. \u0416\u043E\u0434\u043D\u0438\u0445 \u043D\u0430\u043A\u043B\u0430\u0434\u043D\u0438\u0445 \u0432\u0438\u0442\u0440\u0430\u0442 \u043D\u0430 \u043A\u043E\u043E\u0440\u0434\u0438\u043D\u0430\u0446\u0456\u044E.',

    // Section 2
    section2Title:
      '\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u043E\u0432\u0430\u043D\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435, \u0430 \u043D\u0435 \u043A\u0430\u0448\u0430 \u0437\u0456 \u0437\u043D\u0430\u043D\u044C',
    section2ContentTitle:
      '\u0417\u043D\u0430\u043D\u043D\u044F, \u0440\u043E\u0437\u0434\u0456\u043B\u0435\u043D\u0456 \u0437\u0430 \u0434\u043E\u043C\u0435\u043D\u0430\u043C\u0438',
    section2ContentP1:
      '\u041A\u043E\u043B\u0438 \u0432\u0441\u0435 \u043B\u0435\u0436\u0438\u0442\u044C \u0432 \u043E\u0434\u043D\u0456\u0439 \u043F\u043B\u0430\u0441\u043A\u0456\u0439 \u0442\u0435\u0446\u0456, \u043F\u043E\u0448\u0443\u043A \u00AB\u043A\u043D\u043E\u043F\u043A\u0430\u00BB \u043F\u043E\u0432\u0435\u0440\u0442\u0430\u0454 \u043D\u043E\u0442\u0430\u0442\u043A\u0438 \u043F\u0440\u043E \u043C\u0456\u0433\u0440\u0430\u0446\u0456\u0457 \u0431\u0430\u0437 \u0434\u0430\u043D\u0438\u0445 \u043F\u043E\u0440\u0443\u0447 \u0437 CSS-\u043F\u0430\u0442\u0435\u0440\u043D\u0430\u043C\u0438. \u0421\u0445\u043E\u0432\u0438\u0449\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0432\u043F\u043E\u0440\u044F\u0434\u043A\u043E\u0432\u0443\u0454 \u0437\u043D\u0430\u043D\u043D\u044F \u0437\u0430 \u0434\u043E\u043C\u0435\u043D\u0430\u043C\u0438. \u0417\u0430\u043F\u0438\u0442\u0430\u0439\u0442\u0435 \u043F\u0440\u043E \u043A\u043D\u043E\u043F\u043A\u0438 \u2014 \u0441\u043F\u0435\u0440\u0448\u0443 \u0432\u043E\u043D\u043E \u0448\u0443\u043A\u0430\u0454 \u0443 frontend. \u0417\u0430\u043F\u0438\u0442\u0430\u0439\u0442\u0435 \u043F\u0440\u043E \u0431\u0430\u0437\u0438 \u0434\u0430\u043D\u0438\u0445 \u2014 \u0432\u043E\u043D\u043E \u0434\u0456\u0441\u0442\u0430\u0454 \u0437 backend.',
    section2ContentP2:
      '\u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u043A\u0440\u0430\u0449\u0430 \u0437\u0430 \u0440\u043E\u0437\u0434\u0456\u043B\u0435\u043D\u043D\u044F.',
    section2KeyPoint:
      '\u041A\u043D\u043E\u043F\u043A\u0438 \u2192 frontend/. \u0411\u0430\u0437\u0438 \u0434\u0430\u043D\u0438\u0445 \u2192 backend/. \u041C\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0446\u0456\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0430.',
    vaultNodeFrontend:
      '\u041F\u0430\u0442\u0435\u0440\u043D\u0438 React, \u0434\u0438\u0437\u0430\u0439\u043D-\u0442\u043E\u043A\u0435\u043D\u0438, \u0440\u0435\u0432\u2019\u044E \u043A\u043E\u043C\u043F\u043E\u043D\u0435\u043D\u0442\u0456\u0432, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456\u0441\u0442\u044C',
    vaultNodeBackend:
      '\u041A\u043E\u043D\u0432\u0435\u043D\u0446\u0456\u0457 API, \u0441\u0445\u0435\u043C\u0438 \u0431\u0430\u0437 \u0434\u0430\u043D\u0438\u0445, \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u0430\u0432\u0442\u0435\u043D\u0442\u0438\u0444\u0456\u043A\u0430\u0446\u0456\u0457, \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u0438\u0432\u043D\u0456\u0441\u0442\u044C',
    vaultNodeCrosscut:
      'Git-\u0432\u043E\u0440\u043A\u0444\u043B\u043E\u0443, \u0440\u0435\u0432\u2019\u044E \u043A\u043E\u0434\u0443, \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0456\u0457 \u0442\u0435\u0441\u0442\u0443\u0432\u0430\u043D\u043D\u044F, \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u0446\u0456\u044F',
    vaultNodeCrosscutLabel: 'Cross-cutting',
    section2Code1: `<span class="cmt"># \u041F\u043E\u0448\u0443\u043A \u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456 \u0437 \u0443\u0440\u0430\u0445\u0443\u0432\u0430\u043D\u043D\u044F\u043C \u0434\u043E\u043C\u0435\u043D\u0443</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"button styling"</span>

<span class="ok">\u041F\u043E\u0448\u0443\u043A \u0443 \u0434\u043E\u043C\u0435\u043D\u0456: frontend/</span>

<span class="ok">\u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E 3 \u0437\u0431\u0456\u0433\u0438:</span>
  <span class="val">pattern-semantic-tokens</span>      <span class="cmt">94% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">87% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456</span>
  <span class="val">anti-pattern-inline-styles</span>   <span class="cmt">91% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456</span>

<span class="cmt">\u0422\u0430\u043A\u043E\u0436 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0443 cross-cutting/:</span>
  <span class="val">pattern-a11y-focus-rings</span>     <span class="cmt">78% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456</span>`,
    section2Code2: `<span class="cmt"># \u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0441\u0445\u043E\u0432\u0438\u0449\u0430</span>
<span class="key">~/.soleri/vaults/my-agent/</span>
\u251C\u2500\u2500 <span class="val">frontend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">42 \u0437\u0430\u043F\u0438\u0441\u0438</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">12 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">8 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u251C\u2500\u2500 <span class="val">backend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">28 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">6 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">15 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u251C\u2500\u2500 <span class="val">cross-cutting/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">18 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u2502   \u2514\u2500\u2500 workflows/         <span class="cmt">5 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
\u2514\u2500\u2500 <span class="key">index.vec</span>              <span class="cmt">\u0432\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u0438\u0439 \u043F\u043E\u0448\u0443\u043A\u043E\u0432\u0438\u0439 \u0456\u043D\u0434\u0435\u043A\u0441</span>`,

    // Section 3
    section3Title:
      '\u0413\u0440\u0430\u0444 \u0437\u043D\u0430\u043D\u044C, \u0430 \u043D\u0435 \u043F\u043B\u0430\u0441\u043A\u0456 \u0444\u0430\u0439\u043B\u0438',
    section3Code1: `<span class="cmt"># \u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0445\u043E\u0432\u0438\u0449\u0430 \u2014 \u0432\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E + \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043E \u0433\u0440\u0430\u0444\u043E\u043C</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">status</span>

<span class="ok">\u0421\u0445\u043E\u0432\u0438\u0449\u0435:</span> my-agent
<span class="ok">\u0417\u0430\u043F\u0438\u0441\u0438:</span>         <span class="val">134</span>
<span class="ok">\u0412\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E:</span>      <span class="val">134/134 (100%)</span>
<span class="ok">\u0412\u0443\u0437\u043B\u0438 \u0433\u0440\u0430\u0444\u0430:</span>     <span class="val">134</span>
<span class="ok">\u0420\u0435\u0431\u0440\u0430 \u0433\u0440\u0430\u0444\u0430:</span>     <span class="val">287</span>  <span class="cmt">(Cognee)</span>
<span class="ok">\u0414\u043E\u043C\u0435\u043D\u0438:</span>         <span class="val">3</span>   <span class="cmt">frontend, backend, cross-cutting</span>
<span class="ok">\u041E\u0441\u0442\u0430\u043D\u043D\u044F \u0456\u043D\u0434\u0435\u043A\u0441\u0430\u0446\u0456\u044F:</span>    <span class="val">2 \u0445\u0432\u0438\u043B\u0438\u043D\u0438 \u0442\u043E\u043C\u0443</span>`,
    section3Code2: `<span class="cmt"># \u0413\u0440\u0430\u0444 \u0437\u043D\u0430\u0445\u043E\u0434\u0438\u0442\u044C \u0437\u0432\u2019\u044F\u0437\u043A\u0438 \u043C\u0456\u0436 \u0434\u043E\u043C\u0435\u043D\u0430\u043C\u0438</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">related "pattern-semantic-tokens"</span>

<span class="ok">\u041F\u043E\u0432\u2019\u044F\u0437\u0430\u043D\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 (\u0432\u0456\u0434\u0441\u0442\u0430\u043D\u044C \u0433\u0440\u0430\u0444\u0430 \u2264 2):</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">frontend/  \u2014 \u0441\u043F\u0456\u043B\u044C\u043D\u0456 \u0442\u043E\u043A\u0435\u043D\u0438</span>
  <span class="val">pattern-theme-switching</span>      <span class="cmt">frontend/  \u2014 \u0441\u043F\u043E\u0436\u0438\u0432\u0430\u0447 \u0442\u043E\u043A\u0435\u043D\u0456\u0432</span>
  <span class="val">anti-pattern-hardcoded-hex</span>   <span class="cmt">frontend/  \u2014 \u043E\u0431\u0435\u0440\u043D\u0435\u043D\u0435 \u043F\u0440\u0430\u0432\u0438\u043B\u043E</span>
  <span class="val">pattern-api-error-colors</span>     <span class="cmt">backend/   \u2014 \u043A\u0440\u043E\u0441\u0434\u043E\u043C\u0435\u043D\u043D\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F</span>

<span class="cmt">4 \u0437\u0432\u2019\u044F\u0437\u043A\u0438 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0447\u0435\u0440\u0435\u0437 \u0433\u0440\u0430\u0444 \u0437\u043D\u0430\u043D\u044C Cognee</span>`,
    section3ContentTitle:
      '\u0412\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u0435, \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u0435 \u0433\u0440\u0430\u0444\u043E\u043C, \u043F\u0440\u0438\u0434\u0430\u0442\u043D\u0435 \u0434\u043E \u043F\u043E\u0448\u0443\u043A\u0443',
    section3ContentP1:
      '\u041F\u043E\u0448\u0443\u043A \u0437\u0430 \u043A\u043B\u044E\u0447\u043E\u0432\u0438\u043C\u0438 \u0441\u043B\u043E\u0432\u0430\u043C\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0430\u0454 \u0437\u0432\u2019\u044F\u0437\u043A\u0438 \u043C\u0456\u0436 \u0456\u0434\u0435\u044F\u043C\u0438. \u041A\u043E\u0436\u0435\u043D \u0437\u0430\u043F\u0438\u0441 \u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456 \u0432\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u0443\u0454\u0442\u044C\u0441\u044F \u0434\u043B\u044F \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u0447\u043D\u043E\u0433\u043E \u043F\u043E\u0448\u0443\u043A\u0443 \u0442\u0430 \u0437\u2019\u0454\u0434\u043D\u0443\u0454\u0442\u044C\u0441\u044F \u0447\u0435\u0440\u0435\u0437 \u0433\u0440\u0430\u0444 \u0437\u043D\u0430\u043D\u044C Cognee. \u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0440\u043E\u0437\u0443\u043C\u0456\u0454, \u044F\u043A \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u043F\u043E\u0432\u2019\u044F\u0437\u0430\u043D\u0456 \u043C\u0456\u0436 \u0441\u043E\u0431\u043E\u044E \u2014 \u043D\u0435 \u043B\u0438\u0448\u0435 \u0449\u043E \u0446\u0435 \u0442\u0430\u043A\u0435.',
    section3ContentP2:
      '\u0417\u0430\u043F\u0438\u0442\u0430\u0439\u0442\u0435 \u043F\u0440\u043E \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u0447\u043D\u0456 \u0442\u043E\u043A\u0435\u043D\u0438 \u2014 \u0456 \u0433\u0440\u0430\u0444 \u043F\u0456\u0434\u0441\u0432\u0456\u0442\u0438\u0442\u044C \u043F\u043E\u0432\u2019\u044F\u0437\u0430\u043D\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u043A\u043D\u043E\u043F\u043E\u043A, \u043F\u0440\u0430\u0432\u0438\u043B\u0430 \u043F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u043D\u043D\u044F \u0442\u0435\u043C \u0456 \u0431\u0435\u043A\u0435\u043D\u0434-\u043A\u043E\u043D\u0432\u0435\u043D\u0446\u0456\u0457 \u043A\u043E\u043B\u044C\u043E\u0440\u0456\u0432 \u043F\u043E\u043C\u0438\u043B\u043E\u043A. \u041A\u0440\u043E\u0441\u0434\u043E\u043C\u0435\u043D\u043D\u0456 \u0437\u0432\u2019\u044F\u0437\u043A\u0438 \u0437\u2019\u044F\u0432\u043B\u044F\u044E\u0442\u044C\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E.',
    section3KeyPoint:
      '\u0417\u0432\u2019\u044F\u0437\u043A\u0438 \u043C\u0456\u0436 \u043F\u0430\u0442\u0435\u0440\u043D\u0430\u043C\u0438 \u2014 \u043D\u0435 \u043B\u0438\u0448\u0435 \u0441\u0430\u043C\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438.',
    graphStep1Title: '\u0412\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0456\u044F',
    graphStep1Desc:
      '\u041A\u043E\u0436\u0435\u043D \u0437\u0430\u043F\u0438\u0441 \u043E\u0442\u0440\u0438\u043C\u0443\u0454 \u0432\u0431\u0443\u0434\u043E\u0432\u0443\u0432\u0430\u043D\u043D\u044F \u0434\u043B\u044F \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u0447\u043D\u043E\u0433\u043E \u043F\u043E\u0448\u0443\u043A\u0443',
    graphStep2Title: '\u0417\u2019\u0454\u0434\u043D\u0430\u043D\u043D\u044F',
    graphStep2Desc:
      'Cognee \u0431\u0443\u0434\u0443\u0454 \u0433\u0440\u0430\u0444 \u0437\u043D\u0430\u043D\u044C \u043C\u0456\u0436 \u0437\u0430\u043F\u0438\u0441\u0430\u043C\u0438',
    graphStep3Title:
      '\u041F\u0456\u0434\u0441\u0432\u0456\u0447\u0443\u0432\u0430\u043D\u043D\u044F',
    graphStep3Desc:
      '\u041F\u043E\u0448\u0443\u043A \u043F\u043E\u0432\u0435\u0440\u0442\u0430\u0454 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u0442\u0430 \u0457\u0445\u043D\u0456 \u0437\u0432\u2019\u044F\u0437\u043A\u0438',

    // Section 4
    section4Title:
      '\u0421\u0445\u043E\u0432\u0438\u0449\u0435 \u0432\u043F\u043E\u0440\u044F\u0434\u043A\u043E\u0432\u0443\u0454 \u0441\u0435\u0431\u0435 \u0441\u0430\u043C\u043E',
    section4ContentTitle:
      '\u0417\u043D\u0430\u043D\u043D\u044F \u0437 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0438\u043C \u0441\u0443\u043F\u0440\u043E\u0432\u043E\u0434\u043E\u043C',
    section4ContentP1:
      '\u0411\u0430\u0437\u0438 \u0437\u043D\u0430\u043D\u044C \u0433\u043D\u0438\u044E\u0442\u044C, \u043A\u043E\u043B\u0438 \u0457\u0445 \u043D\u0456\u0445\u0442\u043E \u043D\u0435 \u043F\u0456\u0434\u0442\u0440\u0438\u043C\u0443\u0454. \u0421\u0445\u043E\u0432\u0438\u0449\u0435 \u043D\u0435 \u043F\u0440\u043E\u0441\u0442\u043E \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454 \u0437\u043D\u0430\u043D\u043D\u044F \u2014 \u0432\u043E\u043D\u043E \u0457\u0445 \u043A\u0443\u0440\u0443\u0454. \u0414\u0435\u0434\u0443\u043F\u043B\u0456\u043A\u0430\u0446\u0456\u044F \u0432\u0438\u044F\u0432\u043B\u044F\u0454 \u043F\u043E\u0432\u0442\u043E\u0440\u0438. \u0412\u0438\u044F\u0432\u043B\u0435\u043D\u043D\u044F \u0434\u0435\u0433\u0440\u0430\u0434\u0430\u0446\u0456\u0457 \u043F\u043E\u0437\u043D\u0430\u0447\u0430\u0454 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438. \u0412\u0456\u0434\u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456 \u043F\u0456\u0434\u0441\u0432\u0456\u0447\u0443\u0454 \u0442\u0435, \u0449\u043E \u043F\u0440\u0430\u0446\u044E\u0454, \u0456 \u043F\u0440\u0438\u0445\u043E\u0432\u0443\u0454 \u0442\u0435, \u0449\u043E \u043D\u0456.',
    section4ContentP2:
      '\u0416\u043E\u0434\u043D\u043E\u0433\u043E \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u043F\u0440\u0438\u0431\u0438\u0440\u0430\u043D\u043D\u044F. \u0416\u043E\u0434\u043D\u043E\u0433\u043E \u0433\u043D\u0438\u0442\u0442\u044F \u0437\u043D\u0430\u043D\u044C. \u0421\u0445\u043E\u0432\u0438\u0449\u0435 \u0437\u0430\u043B\u0438\u0448\u0430\u0454\u0442\u044C\u0441\u044F \u0442\u043E\u0447\u043D\u0438\u043C \u0456 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u043C \u0443 \u043C\u0456\u0440\u0443 \u0440\u043E\u0437\u0432\u0438\u0442\u043A\u0443 \u0432\u0430\u0448\u043E\u0433\u043E \u043F\u0440\u043E\u0454\u043A\u0442\u0443.',
    section4KeyPoint:
      '\u0421\u0445\u043E\u0432\u0438\u0449\u0435 \u043D\u0435 \u043F\u0440\u043E\u0441\u0442\u043E \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454 \u0437\u043D\u0430\u043D\u043D\u044F \u2014 \u0432\u043E\u043D\u043E \u0457\u0445 \u043A\u0443\u0440\u0443\u0454.',
    section4Code1: `<span class="cmt"># \u0417\u0432\u0456\u0442 \u0437 \u043E\u0431\u0441\u043B\u0443\u0433\u043E\u0432\u0443\u0432\u0430\u043D\u043D\u044F \u0441\u0445\u043E\u0432\u0438\u0449\u0430</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">maintain</span>

<span class="ok">\u041E\u0431\u0441\u043B\u0443\u0433\u043E\u0432\u0443\u0432\u0430\u043D\u043D\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E:</span>
  <span class="ok">\u2713</span> \u0414\u0435\u0434\u0443\u043F\u043B\u0456\u043A\u043E\u0432\u0430\u043D\u043E      <span class="val">3 \u0437\u0430\u0439\u0432\u0456 \u0437\u0430\u043F\u0438\u0441\u0438 \u043E\u0431\u2019\u0454\u0434\u043D\u0430\u043D\u043E</span>
  <span class="ok">\u2713</span> \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u0434\u0435\u0433\u0440\u0430\u0434\u0430\u0446\u0456\u0457        <span class="val">2 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u043F\u043E\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u044F\u043A \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0456</span>
  <span class="ok">\u2713</span> \u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456  <span class="val">8 \u043F\u0430\u0442\u0435\u0440\u043D\u0456\u0432 \u043F\u043E\u0441\u0438\u043B\u0435\u043D\u043E</span>
  <span class="ok">\u2713</span> \u041F\u0435\u0440\u0435\u0432\u0435\u043A\u0442\u043E\u0440\u0438\u0437\u043E\u0432\u0430\u043D\u043E      <span class="val">5 \u0437\u043C\u0456\u043D\u0435\u043D\u0438\u0445 \u0437\u0430\u043F\u0438\u0441\u0456\u0432</span>
  <span class="ok">\u2713</span> \u0413\u0440\u0430\u0444 \u043F\u0435\u0440\u0435\u0431\u0443\u0434\u043E\u0432\u0430\u043D\u043E       <span class="val">291 \u0440\u0435\u0431\u0440\u043E (\u0431\u0443\u043B\u043E 287)</span>

<span class="warn">\u0417\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 (\u043D\u0435 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0432\u0430\u043B\u0438\u0441\u044F 30+ \u0434\u043D\u0456\u0432):</span>
  <span class="val">pattern-legacy-class-names</span>   <span class="cmt">\u0432\u043E\u0441\u0442\u0430\u043D\u043D\u0454 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u043E: 45 \u0434\u043D\u0456\u0432 \u0442\u043E\u043C\u0443</span>
  <span class="val">pattern-jquery-selectors</span>     <span class="cmt">\u0432\u043E\u0441\u0442\u0430\u043D\u043D\u0454 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u043E: 62 \u0434\u043D\u0456 \u0442\u043E\u043C\u0443</span>

<span class="cmt">\u0410\u0440\u0445\u0456\u0432\u0443\u0432\u0430\u0442\u0438 \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0435? soleri vault archive --stale</span>`,
    section4Code2: `<span class="cmt"># \u0412\u0456\u0434\u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456 \u0432 \u0434\u0456\u0457</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">confidence:</span> <span class="val">0.94</span>        <span class="cmt"># \u043F\u043E\u0441\u0438\u043B\u0435\u043D\u043E \u0437\u0430 12 \u0441\u0435\u0441\u0456\u0439</span>
<span class="key">sessions:</span> <span class="val">12</span>
<span class="key">last_applied:</span> <span class="val">2 \u0433\u043E\u0434\u0438\u043D\u0438 \u0442\u043E\u043C\u0443</span>
<span class="key">status:</span> <span class="ok">compounding</span>   <span class="cmt"># \u0437\u2019\u044F\u0432\u043B\u044F\u0454\u0442\u044C\u0441\u044F \u043F\u0435\u0440\u0448\u0438\u043C \u0443 \u043F\u043E\u0448\u0443\u043A\u0443</span>
<span class="key">graph_edges:</span> <span class="val">7</span>          <span class="cmt"># \u0437\u2019\u0454\u0434\u043D\u0430\u043D\u043E \u0437 7 \u0456\u043D\u0448\u0438\u043C\u0438 \u043F\u0430\u0442\u0435\u0440\u043D\u0430\u043C\u0438</span>`,
  },

  it: {
    title: 'Il tuo agente - Soleri',
    description:
      'I file piatti e la ricerca per parole chiave non scalano. Soleri d\u00E0 al tuo agente un vault separato per dominio e connesso tramite grafo che accumula intelligenza nel tempo.',
    heroEyebrow: 'I file piatti e la ricerca per parole chiave non scalano',
    heroTitle: "Il tuo secondo cervello dovrebbe accumulare intelligenza. Gli appunti sparsi no.",
    heroSubtitle:
      'Un Vault unico, separato per dominio, vettorializzato e connesso a grafo. Conoscenza che si organizza da sola e resta sempre aggiornata.',

    // Section 1
    section1Title: 'Crea e configura',
    section1Code1: `<span class="cmt"># Crea un agente file-tree (~3 secondi)</span>
<span class="prompt">$</span> <span class="cmd">soleri create</span> <span class="arg">my-agent</span>

<span class="ok">\u2713</span> Creato agent.yaml
<span class="ok">\u2713</span> Generati instructions/, workflows/, knowledge/
<span class="ok">\u2713</span> CLAUDE.md composto automaticamente
<span class="ok">\u2713</span> Pronto \u2014 nessun passaggio di build

<span class="cmt">Esegui: soleri install && soleri dev</span>`,
    section1Code2: `<span class="cmt"># agent.yaml \u2014 unica fonte di verità</span>
<span class="key">id:</span> <span class="val">my-agent</span>
<span class="key">name:</span> <span class="val">My Agent</span>
<span class="key">role:</span> <span class="val">Full-Stack Development Advisor</span>
<span class="key">domains:</span> <span class="val">[frontend, backend, infrastructure]</span>
<span class="key">principles:</span>
  - <span class="val">Vault is the single source of truth</span>
  - <span class="val">Test before shipping</span>
<span class="key">tone:</span> <span class="val">pragmatic</span>
<span class="key">engine:</span>
  <span class="key">cognee:</span> <span class="val">true</span>     <span class="cmt"># ricerca vettoriale opzionale</span>
<span class="key">vaults:</span>
  - <span class="key">name:</span> <span class="val">team</span>
    <span class="key">path:</span> <span class="val">~/.soleri/vault.db</span>`,
    section1ContentTitle: 'Cartella = agente',
    section1ContentP1:
      'Il comando <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">create</code> genera una cartella con <code style="font-family:\'JetBrains Mono\',monospace; font-size:12px; padding:2px 6px; border-radius:4px; background:rgba(35,157,195,0.08); color:var(--foreground-strong);">agent.yaml</code>, istruzioni, workflow e conoscenza. Niente TypeScript, nessun build \u2014 il tuo editor AI legge la cartella nativamente.',
    section1ContentP2:
      'Identità, domini, principi, configurazione motore \u2014 tutto in un unico file YAML, sotto controllo versione.',
    section1KeyPoint: 'Un vault. Tutta la tua conoscenza. Nessun overhead di coordinamento.',

    // Section 2
    section2Title: 'Vault strutturato, non accumulo disordinato',
    section2ContentTitle: 'Conoscenza separata per dominio',
    section2ContentP1:
      'Quando tutto vive in una cartella piatta, cercare \u00ABpulsante\u00BB restituisce note di migrazione del database accanto a pattern CSS. Il vault organizza automaticamente la conoscenza in domini. Chiedi dei pulsanti \u2014 cerca prima nella conoscenza frontend. Chiedi dei database \u2014 attinge dal backend.',
    section2ContentP2: 'Un vault. Routing automatico.',
    section2KeyPoint:
      'Pulsanti \u2192 frontend/. Database \u2192 backend/. Il routing \u00E8 automatico.',
    vaultNodeFrontend: 'Pattern React, design token, revisione componenti, accessibilit\u00E0',
    vaultNodeBackend: 'Convenzioni API, schemi database, pattern di autenticazione, prestazioni',
    vaultNodeCrosscut: 'Workflow Git, code review, strategie di test, documentazione',
    vaultNodeCrosscutLabel: 'Trasversale',
    section2Code1: `<span class="cmt"># Domain-aware vault search</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"button styling"</span>

<span class="ok">Searching domain: frontend/</span>

<span class="ok">Found 3 matches:</span>
  <span class="val">pattern-semantic-tokens</span>      <span class="cmt">94% confidence</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">87% confidence</span>
  <span class="val">anti-pattern-inline-styles</span>   <span class="cmt">91% confidence</span>

<span class="cmt">Also found in cross-cutting/:</span>
  <span class="val">pattern-a11y-focus-rings</span>     <span class="cmt">78% confidence</span>`,
    section2Code2: `<span class="cmt"># Vault structure</span>
<span class="key">~/.soleri/vaults/my-agent/</span>
\u251C\u2500\u2500 <span class="val">frontend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">42 entries</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">12 entries</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">8 entries</span>
\u251C\u2500\u2500 <span class="val">backend/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">28 entries</span>
\u2502   \u251C\u2500\u2500 anti-patterns/     <span class="cmt">6 entries</span>
\u2502   \u2514\u2500\u2500 decisions/         <span class="cmt">15 entries</span>
\u251C\u2500\u2500 <span class="val">cross-cutting/</span>
\u2502   \u251C\u2500\u2500 patterns/          <span class="cmt">18 entries</span>
\u2502   \u2514\u2500\u2500 workflows/         <span class="cmt">5 entries</span>
\u2514\u2500\u2500 <span class="key">index.vec</span>              <span class="cmt">vectorized search index</span>`,

    // Section 3
    section3Title: 'Grafo della conoscenza, non file piatti',
    section3Code1: `<span class="cmt"># Vault status \u2014 vectorized + graph-connected</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">status</span>

<span class="ok">Vault:</span> my-agent
<span class="ok">Entries:</span>         <span class="val">134</span>
<span class="ok">Vectorized:</span>      <span class="val">134/134 (100%)</span>
<span class="ok">Graph nodes:</span>     <span class="val">134</span>
<span class="ok">Graph edges:</span>     <span class="val">287</span>  <span class="cmt">(Cognee)</span>
<span class="ok">Domains:</span>         <span class="val">3</span>   <span class="cmt">frontend, backend, cross-cutting</span>
<span class="ok">Last indexed:</span>    <span class="val">2 minutes ago</span>`,
    section3Code2: `<span class="cmt"># Graph finds connections across domains</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">related "pattern-semantic-tokens"</span>

<span class="ok">Related patterns (graph distance \u2264 2):</span>
  <span class="val">pattern-button-sizes</span>         <span class="cmt">frontend/  \u2014 shares tokens</span>
  <span class="val">pattern-theme-switching</span>      <span class="cmt">frontend/  \u2014 token consumer</span>
  <span class="val">anti-pattern-hardcoded-hex</span>   <span class="cmt">frontend/  \u2014 inverse rule</span>
  <span class="val">pattern-api-error-colors</span>     <span class="cmt">backend/   \u2014 cross-domain link</span>

<span class="cmt">4 connections found via Cognee knowledge graph</span>`,
    section3ContentTitle: 'Vettorializzato, connesso a grafo, ricercabile',
    section3ContentP1:
      'La ricerca per parole chiave perde le relazioni tra le idee. Ogni voce del vault \u00E8 vettorializzata per la ricerca semantica e connessa tramite il grafo della conoscenza di Cognee. Il sistema comprende come i pattern si relazionano \u2014 non solo cosa sono.',
    section3ContentP2:
      'Interroga i token semantici e il grafo fa emergere pattern correlati sui pulsanti, regole di cambio tema e convenzioni backend per i colori degli errori. Le connessioni tra domini emergono automaticamente.',
    section3KeyPoint: 'Relazioni tra pattern \u2014 non solo i pattern stessi.',
    graphStep1Title: 'Vettorializza',
    graphStep1Desc: 'Ogni voce ottiene un embedding per la ricerca semantica',
    graphStep2Title: 'Connetti',
    graphStep2Desc: 'Cognee costruisce un grafo della conoscenza tra le voci',
    graphStep3Title: 'Fai emergere',
    graphStep3Desc: 'La ricerca restituisce i pattern e le loro connessioni',

    // Section 4
    section4Title: 'Il vault si mantiene pulito da solo',
    section4ContentTitle: 'Conoscenza mantenuta automaticamente',
    section4ContentP1:
      'Le basi di conoscenza si degradano quando nessuno le mantiene. Il vault non si limita a memorizzare la conoscenza \u2014 la cura. La deduplicazione intercetta le voci ridondanti. Il rilevamento del decadimento segnala i pattern obsoleti. Il tracciamento della confidenza fa emergere ci\u00F2 che funziona e nasconde ci\u00F2 che non funziona.',
    section4ContentP2:
      'Nessuna pulizia manuale. Nessuna degradazione della conoscenza. Il Vault resta preciso e aggiornato mentre il tuo progetto evolve.',
    section4KeyPoint: 'Il vault non si limita a memorizzare la conoscenza \u2014 la cura.',
    section4Code1: `<span class="cmt"># Vault maintenance report</span>
<span class="prompt">$</span> <span class="cmd">soleri vault</span> <span class="arg">maintain</span>

<span class="ok">Maintenance complete:</span>
  <span class="ok">\u2713</span> Deduplicated      <span class="val">3 redundant entries merged</span>
  <span class="ok">\u2713</span> Decay check        <span class="val">2 patterns flagged as stale</span>
  <span class="ok">\u2713</span> Confidence update  <span class="val">8 patterns strengthened</span>
  <span class="ok">\u2713</span> Re-vectorized      <span class="val">5 modified entries</span>
  <span class="ok">\u2713</span> Graph rebuilt       <span class="val">291 edges (was 287)</span>

<span class="warn">Stale patterns (not used in 30+ days):</span>
  <span class="val">pattern-legacy-class-names</span>   <span class="cmt">last used: 45 days ago</span>
  <span class="val">pattern-jquery-selectors</span>     <span class="cmt">last used: 62 days ago</span>

<span class="cmt">Archive stale? soleri vault archive --stale</span>`,
    section4Code2: `<span class="cmt"># Confidence tracking in action</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">confidence:</span> <span class="val">0.94</span>        <span class="cmt"># strengthened over 12 sessions</span>
<span class="key">sessions:</span> <span class="val">12</span>
<span class="key">last_applied:</span> <span class="val">2 hours ago</span>
<span class="key">status:</span> <span class="ok">compounding</span>   <span class="cmt"># surfaces first in search</span>
<span class="key">graph_edges:</span> <span class="val">7</span>          <span class="cmt"># connected to 7 other patterns</span>`,
  },
};

interface PersonasContent {
  title: string;
  description: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;

  section1Title: string;
  section1Code1: string;
  section1Code2: string;
  section1ContentTitle: string;
  section1ContentP1: string;
  section1ContentP2: string;
  section1KeyPoint: string;

  section2Title: string;
  section2ContentTitle: string;
  section2ContentP1: string;
  section2ContentP2: string;
  section2KeyPoint: string;
  vaultNodeFrontend: string;
  vaultNodeBackend: string;
  vaultNodeCrosscut: string;
  vaultNodeCrosscutLabel: string;
  section2Code1: string;
  section2Code2: string;

  section3Title: string;
  section3Code1: string;
  section3Code2: string;
  section3ContentTitle: string;
  section3ContentP1: string;
  section3ContentP2: string;
  section3KeyPoint: string;
  graphStep1Title: string;
  graphStep1Desc: string;
  graphStep2Title: string;
  graphStep2Desc: string;
  graphStep3Title: string;
  graphStep3Desc: string;

  section4Title: string;
  section4ContentTitle: string;
  section4ContentP1: string;
  section4ContentP2: string;
  section4KeyPoint: string;
  section4Code1: string;
  section4Code2: string;
}
