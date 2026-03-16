import type { Locale } from '../types';

export const howItWorksContent = (locale: Locale) => content[locale];

const content: Record<Locale, HowItWorksContent> = {
  en: {
    title: 'How It Works - Soleri',
    description:
      "Most assistants forget everything between sessions. Soleri's vault, brain, and transport architecture makes knowledge compound instead.",
    eyebrow: 'Most assistants forget everything between sessions',
    heroTitle: "Knowledge should compound. Here's how.",
    heroSubtitle:
      'Vault, brain, and transport layers run on a single engine. One process, zero lock-in \u2014 swap transports, plug in knowledge, switch providers.',
    archLayers: [
      {
        name: 'Agent Folder',
        desc: 'Plain files: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Claude Code reads them natively. No TypeScript, no build step.',
      },
      {
        name: 'Domain Packs',
        desc: 'Pluggable expertise modules. Add design system science, code review, or custom domains without changing the agent folder.',
      },
      {
        name: 'Knowledge Engine',
        desc: 'Single MCP server (<code>@soleri/core</code>). Vault, Brain, Curator, Planner, Memory. Persistent state and learning. All agents share one engine.',
      },
      {
        name: 'Transports',
        desc: 'MCP (stdio) for Claude Code and Cursor. HTTP/SSE for dashboards. WebSocket for streaming. Telegram for conversational access.',
      },
    ],
    vault: {
      title: 'Knowledge that compounds',
      text: "Without a vault, every session starts from scratch. Soleri stores every pattern, anti-pattern, and decision in a searchable vault. Ask a question \u2014 get your team's answer, not a generic one.",
      keyPoint: 'Patterns, anti-patterns, and session memories \u2014 all searchable.',
      code1: `<span class="cmt"># Vault entry structure</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">Always use semantic tokens</span>
<span class="key">context:</span>
  <span class="key">domain:</span> <span class="val">design-systems</span>
  <span class="key">confidence:</span> <span class="val">0.94</span>
  <span class="key">sessions:</span> <span class="val">12</span>
<span class="key">tags:</span> <span class="val">[tokens, css, tailwind]</span>`,
      code2: `<span class="cmt"># Search your vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"button styling"</span>

<span class="ok">Found 3 matches:</span>
  <span class="val">pattern-semantic-tokens</span>  <span class="cmt">94% confidence</span>
  <span class="val">pattern-button-sizes</span>    <span class="cmt">87% confidence</span>
  <span class="val">anti-pattern-inline</span>     <span class="cmt">91% confidence</span>`,
    },
    brain: {
      title: 'Gets sharper with every session',
      text: "Manual knowledge curation doesn't scale. The brain tracks which patterns you apply, how often, and how successfully. Confidence grows automatically \u2014 no manual tagging needed.",
      keyPoint: 'Automatic capture, no manual tagging.',
      code: `<span class="cmt"># Brain strengths output</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">strengths</span>

<span class="ok">Top patterns (last 7 days):</span>
  semantic-tokens    <span class="val">strength: 94</span>  <span class="cmt">12 sessions</span>
  component-structure <span class="val">strength: 87</span>  <span class="cmt">8 sessions</span>
  error-boundaries   <span class="val">strength: 82</span>  <span class="cmt">6 sessions</span>
  a11y-focus-rings   <span class="val">strength: 78</span>  <span class="cmt">5 sessions</span>
  zustand-patterns   <span class="val">strength: 71</span>  <span class="cmt">4 sessions</span>`,
    },
    lifecycle: {
      title: 'Knowledge that grows \u2014 and stays sharp',
      text: 'Patterns flow through a four-step lifecycle. The engine watches your work, captures what sticks, and compounds it over time.',
      keyPoint: "Your vault doesn't decay \u2014 it sharpens. The brain tracks what works.",
      steps: [
        {
          label: 'Capture',
          desc: 'Engine notices repeated corrections, suggests patterns',
          color: 'amber' as const,
        },
        {
          label: 'Store',
          desc: 'Patterns, anti-patterns, session memories enter the vault',
          color: 'teal' as const,
        },
        {
          label: 'Strengthen',
          desc: 'Confidence scores track how often patterns succeed',
          color: 'green' as const,
        },
        {
          label: 'Compound',
          desc: 'High-confidence patterns surface first, weak ones flagged',
          color: 'amber' as const,
        },
      ],
      code1: `<span class="cmt"># Session 3 \u2014 engine notices a pattern</span>
<span class="warn">!</span> You've corrected <span class="val">bg-blue-500</span> \u2192 <span class="ok">bg-primary</span> 3 times.
  Capture as pattern? <span class="key">[y/n]</span>

<span class="prompt">$</span> <span class="cmd">y</span>

<span class="ok">\u2713</span> Captured: <span class="val">semantic-token-enforcement</span>
<span class="ok">\u2713</span> Confidence: <span class="val">0.85</span> <span class="cmt">(will increase with use)</span>`,
      code2: `<span class="cmt"># Vault entry with lifecycle metadata</span>
<span class="key">id:</span> <span class="val">pattern-semantic-token-enforcement</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">Replace raw Tailwind colors with semantic tokens</span>
<span class="key">confidence:</span> <span class="val">0.91</span>           <span class="cmt"># strengthened over 8 sessions</span>
<span class="key">sessions:</span> <span class="val">8</span>
<span class="key">last_applied:</span> <span class="val">2 hours ago</span>
<span class="key">status:</span> <span class="ok">compounding</span>      <span class="cmt"># surfaces first in search</span>`,
    },
    transport: {
      title: 'Not locked to any editor',
      text: "Your knowledge shouldn't be trapped in one tool. The Knowledge Engine runs as a single MCP server. Multiple transports connect to it \u2014 no lock-in.",
      keyPoint: 'One engine, many transports.',
      code: `<span class="key">my-agent/</span>           <span class="cmt"># your agent folder</span>
\u251C\u2500\u2500 <span class="ok">agent.yaml</span>       <span class="cmt"># identity + config</span>
\u251C\u2500\u2500 <span class="key">instructions/</span>    <span class="cmt"># behavioral rules</span>
\u2514\u2500\u2500 .mcp.json        <span class="cmt"># connects to engine</span>

<span class="key">@soleri/core</span>        <span class="cmt"># Knowledge Engine</span>
\u251C\u2500\u2500 <span class="ok">MCP (stdio)</span>    <span class="cmt"># Claude Code, Cursor</span>
\u251C\u2500\u2500 HTTP/SSE       <span class="cmt"># dashboards, APIs</span>
\u2514\u2500\u2500 WebSocket      <span class="cmt"># streaming, Telegram</span>`,
    },
    llm: {
      title: 'Runs without API keys',
      text: "Knowledge infrastructure shouldn't require a subscription. Vault search, pattern matching, and Brain tracking all work locally. Add an LLM provider when you want AI-powered suggestions.",
      keyPoint: 'Core features work offline. LLM is optional.',
      code: `<span class="cmt"># agent.yaml \u2014 LLM config</span>
<span class="key">llm:</span>
  <span class="key">provider:</span> <span class="val">anthropic</span>    <span class="cmt"># or: openai, ollama, none</span>
  <span class="key">model:</span>    <span class="val">claude-sonnet-4-6</span>
  <span class="key">fallback:</span> <span class="val">none</span>        <span class="cmt"># works without API keys</span>`,
    },
  },
  uk: {
    title: '\u042F\u043A \u0446\u0435 \u043F\u0440\u0430\u0446\u044E\u0454 - Soleri',
    description:
      '\u0411\u0456\u043B\u044C\u0448\u0456\u0441\u0442\u044C \u043F\u043E\u043C\u0456\u0447\u043D\u0438\u043A\u0456\u0432 \u0437\u0430\u0431\u0443\u0432\u0430\u044E\u0442\u044C \u0432\u0441\u0435 \u043C\u0456\u0436 \u0441\u0435\u0441\u0456\u044F\u043C\u0438. \u0410\u0440\u0445\u0456\u0442\u0435\u043A\u0442\u0443\u0440\u0430 \u0441\u0445\u043E\u0432\u0438\u0449\u0430, \u043C\u043E\u0437\u043A\u0443 \u0442\u0430 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0443 Soleri \u0440\u043E\u0431\u0438\u0442\u044C \u0437\u043D\u0430\u043D\u043D\u044F \u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u0432\u0430\u043B\u044C\u043D\u0438\u043C\u0438.',
    eyebrow:
      '\u0411\u0456\u043B\u044C\u0448\u0456\u0441\u0442\u044C \u043F\u043E\u043C\u0456\u0447\u043D\u0438\u043A\u0456\u0432 \u0437\u0430\u0431\u0443\u0432\u0430\u044E\u0442\u044C \u0432\u0441\u0435 \u043C\u0456\u0436 \u0441\u0435\u0441\u0456\u044F\u043C\u0438',
    heroTitle:
      '\u0417\u043D\u0430\u043D\u043D\u044F \u043C\u0430\u044E\u0442\u044C \u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u0432\u0430\u0442\u0438\u0441\u044F. \u041E\u0441\u044C \u044F\u043A.',
    heroSubtitle:
      '\u0428\u0430\u0440\u0438 \u0441\u0445\u043E\u0432\u0438\u0449\u0430, \u043C\u043E\u0437\u043A\u0443 \u0442\u0430 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0443 \u043F\u0440\u0430\u0446\u044E\u044E\u0442\u044C \u043D\u0430 \u043E\u0434\u043D\u043E\u043C\u0443 \u0440\u0443\u0448\u0456\u0457. \u041E\u0434\u0438\u043D \u043F\u0440\u043E\u0446\u0435\u0441, \u043D\u0443\u043B\u044C \u0437\u0430\u043B\u0435\u0436\u043D\u043E\u0441\u0442\u0435\u0439 \u2014 \u0437\u0430\u043C\u0456\u043D\u0438 \u0442\u0440\u0430\u043D\u0441\u043F\u043E\u0440\u0442\u0438, \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u0439 \u0437\u043D\u0430\u043D\u043D\u044F, \u0437\u043C\u0456\u043D\u044E\u0439 \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u0456\u0432.',
    archLayers: [
      {
        name: 'Тека агента',
        desc: 'Прості файли: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Claude Code читає їх напряму. Без TypeScript, без збірки.',
      },
      {
        name: 'Доменні пакети',
        desc: 'Підключувані модулі експертизи. Додавай дизайн-системи, код-рев\'ю або власні домени без зміни теки агента.',
      },
      {
        name: 'Рушій знань',
        desc: 'Один MCP-сервер (<code>@soleri/core</code>). Сховище, Brain, Куратор, Планувальник, Пам\'ять. Персистентний стан та навчання.',
      },
      {
        name: 'Транспорти',
        desc: 'MCP (stdio) для Claude Code та Cursor. HTTP/SSE для дашбордів. WebSocket для стримінгу. Telegram для розмовного доступу.',
      },
    ],
    vault: {
      title:
        '\u0417\u043D\u0430\u043D\u043D\u044F, \u0449\u043E \u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u044E\u0442\u044C\u0441\u044F',
      text: '\u0411\u0435\u0437 \u0441\u0445\u043E\u0432\u0438\u0449\u0430 \u043A\u043E\u0436\u043D\u0430 \u0441\u0435\u0441\u0456\u044F \u043F\u043E\u0447\u0438\u043D\u0430\u0454\u0442\u044C\u0441\u044F \u0437 \u043D\u0443\u043B\u044F. Soleri \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454 \u043A\u043E\u0436\u0435\u043D \u043F\u0430\u0442\u0435\u0440\u043D, \u0430\u043D\u0442\u0438\u043F\u0430\u0442\u0435\u0440\u043D \u0456 \u0440\u0456\u0448\u0435\u043D\u043D\u044F \u0443 \u043F\u043E\u0448\u0443\u043A\u043E\u0432\u043E\u043C\u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456. \u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u043F\u0438\u0442\u0430\u043D\u043D\u044F \u2014 \u043E\u0442\u0440\u0438\u043C\u0430\u0439\u0442\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C \u0432\u0456\u0434 \u0441\u0432\u043E\u0454\u0457 \u043A\u043E\u043C\u0430\u043D\u0434\u0438, \u043D\u0435 \u0437\u0430\u0433\u0430\u043B\u044C\u043D\u0443.',
      keyPoint:
        '\u041F\u0430\u0442\u0435\u0440\u043D\u0438, \u0430\u043D\u0442\u0438\u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u0442\u0430 \u0441\u0435\u0441\u0456\u0439\u043D\u0456 \u0441\u043F\u043E\u0433\u0430\u0434\u0438 \u2014 \u0432\u0441\u0435 \u0446\u0435 \u0432 \u043F\u043E\u0448\u0443\u043A\u0443.',
      code1: `<span class="cmt"># \u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0437\u0430\u043F\u0438\u0441\u0443 \u0432 \u0441\u0445\u043E\u0432\u0438\u0449\u0435</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">\u0417\u0430\u0432\u0436\u0434\u0438 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0439\u0442\u0435 \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u0447\u043D\u0456 \u0442\u043E\u043A\u0435\u043D\u0438</span>
<span class="key">context:</span>
  <span class="key">domain:</span> <span class="val">design-systems</span>
  <span class="key">confidence:</span> <span class="val">0.94</span>
  <span class="key">sessions:</span> <span class="val">12</span>
<span class="key">tags:</span> <span class="val">[tokens, css, tailwind]</span>`,
      code2: `<span class="cmt"># \u041F\u043E\u0448\u0443\u043A \u0443 \u0432\u0430\u0448\u043E\u043C\u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"button styling"</span>

<span class="ok">\u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E 3 \u0437\u0431\u0456\u0433\u0438:</span>
  <span class="val">pattern-semantic-tokens</span>  <span class="cmt">94% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044C</span>
  <span class="val">pattern-button-sizes</span>    <span class="cmt">87% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044C</span>
  <span class="val">anti-pattern-inline</span>     <span class="cmt">91% \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044C</span>`,
    },
    brain: {
      title:
        '\u0417 \u043A\u043E\u0436\u043D\u043E\u044E \u0441\u0435\u0441\u0456\u0454\u044E \u0441\u0442\u0430\u0454 \u0442\u043E\u0447\u043D\u0456\u0448\u0438\u043C',
      text: '\u0420\u0443\u0447\u043D\u0430 \u043A\u0443\u0440\u0430\u0446\u0456\u044F \u0437\u043D\u0430\u043D\u044C \u043D\u0435 \u043C\u0430\u0441\u0448\u0442\u0430\u0431\u0443\u0454\u0442\u044C\u0441\u044F. \u041C\u043E\u0437\u043E\u043A \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0443\u0454, \u044F\u043A\u0456 \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u0432\u0438 \u0437\u0430\u0441\u0442\u043E\u0441\u043E\u0432\u0443\u0454\u0442\u0435, \u044F\u043A \u0447\u0430\u0441\u0442\u043E \u0456 \u043D\u0430\u0441\u043A\u0456\u043B\u044C\u043A\u0438 \u0443\u0441\u043F\u0456\u0448\u043D\u043E. \u0412\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044C \u0437\u0440\u043E\u0441\u0442\u0430\u0454 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u2014 \u0440\u0443\u0447\u043D\u0435 \u0442\u0435\u0433\u0443\u0432\u0430\u043D\u043D\u044F \u043D\u0435 \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u0435.',
      keyPoint:
        '\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u0438\u0439 \u0437\u0430\u043F\u0438\u0441, \u0431\u0435\u0437 \u0440\u0443\u0447\u043D\u043E\u0433\u043E \u0442\u0435\u0433\u0443\u0432\u0430\u043D\u043D\u044F.',
      code: `<span class="cmt"># \u0412\u0438\u0432\u0435\u0434\u0435\u043D\u043D\u044F \u0441\u0438\u043B\u044C\u043D\u0438\u0445 \u0441\u0442\u043E\u0440\u0456\u043D \u043C\u043E\u0437\u043A\u0443</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">strengths</span>

<span class="ok">\u0422\u043E\u043F \u043F\u0430\u0442\u0435\u0440\u043D\u0438 (\u043E\u0441\u0442\u0430\u043D\u043D\u0456 7 \u0434\u043D\u0456\u0432):</span>
  semantic-tokens    <span class="val">\u0441\u0438\u043B\u0430: 94</span>  <span class="cmt">12 \u0441\u0435\u0441\u0456\u0439</span>
  component-structure <span class="val">\u0441\u0438\u043B\u0430: 87</span>  <span class="cmt">8 \u0441\u0435\u0441\u0456\u0439</span>
  error-boundaries   <span class="val">\u0441\u0438\u043B\u0430: 82</span>  <span class="cmt">6 \u0441\u0435\u0441\u0456\u0439</span>
  a11y-focus-rings   <span class="val">\u0441\u0438\u043B\u0430: 78</span>  <span class="cmt">5 \u0441\u0435\u0441\u0456\u0439</span>
  zustand-patterns   <span class="val">\u0441\u0438\u043B\u0430: 71</span>  <span class="cmt">4 \u0441\u0435\u0441\u0456\u0457</span>`,
    },
    lifecycle: {
      title:
        '\u0417\u043D\u0430\u043D\u043D\u044F, \u0449\u043E \u0437\u0440\u043E\u0441\u0442\u0430\u044E\u0442\u044C \u2014 \u0456 \u0437\u0430\u043B\u0438\u0448\u0430\u044E\u0442\u044C\u0441\u044F \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0438\u043C\u0438',
      text: '\u041F\u0430\u0442\u0435\u0440\u043D\u0438 \u043F\u0440\u043E\u0445\u043E\u0434\u044F\u0442\u044C \u043A\u0440\u0456\u0437\u044C \u0447\u043E\u0442\u0438\u0440\u0438\u0441\u0442\u0443\u043F\u0456\u043D\u0447\u0430\u0441\u0442\u0438\u0439 \u0436\u0438\u0442\u0442\u0454\u0432\u0438\u0439 \u0446\u0438\u043A\u043B. \u0420\u0443\u0448\u0456\u0439 \u0441\u0442\u0435\u0436\u0438\u0442\u044C \u0437\u0430 \u0442\u0432\u043E\u0454\u044E \u0440\u043E\u0431\u043E\u0442\u043E\u044E, \u0444\u0456\u043A\u0441\u0443\u0454, \u0449\u043E \u0441\u043F\u0440\u0430\u0446\u044C\u043E\u0432\u0443\u0454, \u0456 \u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u0454 \u0446\u0435 \u0437 \u0447\u0430\u0441\u043E\u043C.',
      keyPoint:
        '\u0412\u0430\u0448\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435 \u043D\u0435 \u0434\u0435\u0433\u0440\u0430\u0434\u0443\u0454 \u2014 \u0432\u043E\u043D\u043E \u0441\u0442\u0430\u0454 \u0442\u043E\u0447\u043D\u0456\u0448\u0438\u043C. \u041C\u043E\u0437\u043E\u043A \u0441\u0442\u0435\u0436\u0438\u0442\u044C \u0437\u0430 \u0442\u0438\u043C, \u0449\u043E \u043F\u0440\u0430\u0446\u044E\u0454.',
      steps: [
        {
          label: '\u0424\u0456\u043A\u0441\u0430\u0446\u0456\u044F',
          desc: '\u0420\u0443\u0448\u0456\u0439 \u043F\u043E\u043C\u0456\u0447\u0430\u0454 \u043F\u043E\u0432\u0442\u043E\u0440\u044E\u0432\u0430\u043D\u0456 \u0432\u0438\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044F, \u043F\u0440\u043E\u043F\u043E\u043D\u0443\u0454 \u043F\u0430\u0442\u0435\u0440\u043D\u0438',
          color: 'amber' as const,
        },
        {
          label: '\u0417\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F',
          desc: '\u041F\u0430\u0442\u0435\u0440\u043D\u0438, \u0430\u043D\u0442\u0438\u043F\u0430\u0442\u0435\u0440\u043D\u0438, \u0441\u0435\u0441\u0456\u0439\u043D\u0456 \u0441\u043F\u043E\u0433\u0430\u0434\u0438 \u043F\u043E\u0442\u0440\u0430\u043F\u043B\u044F\u044E\u0442\u044C \u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0435',
          color: 'teal' as const,
        },
        {
          label: '\u041F\u043E\u0441\u0438\u043B\u0435\u043D\u043D\u044F',
          desc: '\u041E\u0446\u0456\u043D\u043A\u0438 \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u043E\u0441\u0442\u0456 \u0432\u0456\u0434\u0441\u043B\u0456\u0434\u043A\u043E\u0432\u0443\u044E\u0442\u044C, \u044F\u043A \u0447\u0430\u0441\u0442\u043E \u043F\u0430\u0442\u0435\u0440\u043D\u0438 \u0432\u0434\u0430\u044E\u0442\u044C\u0441\u044F',
          color: 'green' as const,
        },
        {
          label: '\u041D\u0430\u043A\u043E\u043F\u0438\u0447\u0435\u043D\u043D\u044F',
          desc: '\u041F\u0430\u0442\u0435\u0440\u043D\u0438 \u0437 \u0432\u0438\u0441\u043E\u043A\u043E\u044E \u0432\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044E \u0437\u2019\u044F\u0432\u043B\u044F\u044E\u0442\u044C\u0441\u044F \u043F\u0435\u0440\u0448\u0438\u043C\u0438, \u0441\u043B\u0430\u0431\u043A\u0456 \u043F\u043E\u0437\u043D\u0430\u0447\u0435\u043D\u0456',
          color: 'amber' as const,
        },
      ],
      code1: `<span class="cmt"># \u0421\u0435\u0441\u0456\u044F 3 \u2014 \u0440\u0443\u0448\u0456\u0439 \u043F\u043E\u043C\u0456\u0447\u0430\u0454 \u043F\u0430\u0442\u0435\u0440\u043D</span>
<span class="warn">!</span> \u0412\u0438 \u0432\u0438\u043F\u0440\u0430\u0432\u0438\u043B\u0438 <span class="val">bg-blue-500</span> \u2192 <span class="ok">bg-primary</span> 3 \u0440\u0430\u0437\u0438.
  \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u044F\u043A \u043F\u0430\u0442\u0435\u0440\u043D? <span class="key">[y/n]</span>

<span class="prompt">$</span> <span class="cmd">y</span>

<span class="ok">\u2713</span> \u0417\u0430\u043F\u0438\u0441\u0430\u043D\u043E: <span class="val">semantic-token-enforcement</span>
<span class="ok">\u2713</span> \u0412\u043F\u0435\u0432\u043D\u0435\u043D\u0456\u0441\u0442\u044C: <span class="val">0.85</span> <span class="cmt">(\u0437\u0440\u043E\u0441\u0442\u0430\u0442\u0438\u043C\u0435 \u0437 \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u043D\u044F\u043C)</span>`,
      code2: `<span class="cmt"># \u0417\u0430\u043F\u0438\u0441 \u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456 \u0437 \u043C\u0435\u0442\u0430\u0434\u0430\u043D\u0438\u043C\u0438 \u0436\u0438\u0442\u0442\u0454\u0432\u043E\u0433\u043E \u0446\u0438\u043A\u043B\u0443</span>
<span class="key">id:</span> <span class="val">pattern-semantic-token-enforcement</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">\u0417\u0430\u043C\u0456\u043D\u0456\u0442\u044C \u0441\u0438\u0440\u0456 \u043A\u043E\u043B\u044C\u043E\u0440\u0438 Tailwind \u043D\u0430 \u0441\u0435\u043C\u0430\u043D\u0442\u0438\u0447\u043D\u0456 \u0442\u043E\u043A\u0435\u043D\u0438</span>
<span class="key">confidence:</span> <span class="val">0.91</span>           <span class="cmt"># \u0437\u043C\u0456\u0446\u043D\u0435\u043D\u0438\u0439 \u043F\u0440\u043E\u0442\u044F\u0433\u043E\u043C 8 \u0441\u0435\u0441\u0456\u0439</span>
<span class="key">sessions:</span> <span class="val">8</span>
<span class="key">last_applied:</span> <span class="val">2 \u0433\u043E\u0434\u0438\u043D\u0438 \u0442\u043E\u043C\u0443</span>
<span class="key">status:</span> <span class="ok">\u043D\u0430\u043A\u043E\u043F\u0438\u0447\u0443\u0454\u0442\u044C\u0441\u044F</span>      <span class="cmt"># \u0437\u2019\u044F\u0432\u043B\u044F\u0454\u0442\u044C\u0441\u044F \u043F\u0435\u0440\u0448\u0438\u043C \u0443 \u043F\u043E\u0448\u0443\u043A\u0443</span>`,
    },
    transport: {
      title: 'Не прив\u2019язано до жодного редактора',
      text: 'Твої знання не мають бути замкнені в одному інструменті. Рушій знань працює як єдиний MCP-сервер. Різні транспорти підключаються до нього.',
      keyPoint: 'Один рушій, багато транспортів.',
      code: `<span class="key">my-agent/</span>           <span class="cmt"># тека твого агента</span>
├── <span class="ok">agent.yaml</span>       <span class="cmt"># ідентичність + конфіг</span>
├── <span class="key">instructions/</span>    <span class="cmt"># правила поведінки</span>
└── .mcp.json        <span class="cmt"># підключення до рушія</span>

<span class="key">@soleri/core</span>        <span class="cmt"># Рушій знань</span>
├── <span class="ok">MCP (stdio)</span>    <span class="cmt"># Claude Code, Cursor</span>
├── HTTP/SSE       <span class="cmt"># дашборди, API</span>
└── WebSocket      <span class="cmt"># стримінг, Telegram</span>`,
    },
    llm: {
      title:
        '\u041F\u0440\u0430\u0446\u044E\u0454 \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0456\u0432 API',
      text: '\u0406\u043D\u0444\u0440\u0430\u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u0437\u043D\u0430\u043D\u044C \u043D\u0435 \u043F\u043E\u0432\u0438\u043D\u043D\u0430 \u0432\u0438\u043C\u0430\u0433\u0430\u0442\u0438 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0438. \u041F\u043E\u0448\u0443\u043A \u0443 \u0441\u0445\u043E\u0432\u0438\u0449\u0456, \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u0456\u0441\u0442\u044C \u043F\u0430\u0442\u0435\u0440\u043D\u0430\u043C \u0442\u0430 \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F \u043F\u0440\u0430\u0446\u044E\u044E\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E. \u041F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440 LLM \u043D\u0435 \u043E\u0431\u043E\u0432\u2019\u044F\u0437\u043A\u043E\u0432\u0438\u0439 \u2014 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0456\u0442\u044C, \u043A\u043E\u043B\u0438 \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u0456 AI-\u043F\u0456\u0434\u043A\u0430\u0437\u043A\u0438.',
      keyPoint:
        '\u0411\u0430\u0437\u043E\u0432\u0430 \u0444\u0443\u043D\u043A\u0446\u0456\u043E\u043D\u0430\u043B\u044C\u043D\u0456\u0441\u0442\u044C \u0437\u0430\u0431\u0435\u0437\u043F\u0435\u0447\u0435\u043D\u0430 \u0431\u0435\u0437 \u043A\u043B\u044E\u0447\u0456\u0432.',
      code: `<span class="cmt"># agent.yaml \u2014 \u043A\u043E\u043D\u0444\u0456\u0433\u0443\u0440\u0430\u0446\u0456\u044F LLM</span>
<span class="key">llm:</span>
  <span class="key">provider:</span> <span class="val">anthropic</span>    <span class="cmt"># \u0430\u0431\u043E: openai, ollama, \u0436\u043E\u0434\u043D\u043E\u0433\u043E</span>
  <span class="key">model:</span>    <span class="val">claude-sonnet-4-6</span>
  <span class="key">fallback:</span> <span class="val">\u0436\u043E\u0434\u043D\u043E\u0433\u043E</span>        <span class="cmt"># \u043F\u0440\u0430\u0446\u044E\u0454 \u0431\u0435\u0437 API \u043A\u043B\u044E\u0447\u0456\u0432</span>`,
    },
  },
  it: {
    title: 'Come funziona - Soleri',
    description:
      "La maggior parte degli assistenti dimentica tutto tra una sessione e l'altra. L'architettura Vault, Cervello e Trasporti di Soleri fa sì che la conoscenza si accumuli.",
    eyebrow: 'La maggior parte degli assistenti dimentica tutto tra le sessioni',
    heroTitle: 'La conoscenza dovrebbe accumularsi. Ecco come.',
    heroSubtitle:
      'Livelli di Vault, cervello e trasporto funzionano su un unico motore. Un processo, zero lock-in \u2014 cambia trasporti, aggiungi conoscenza, scegli il provider.',
    archLayers: [
      {
        name: 'Cartella agente',
        desc: 'File semplici: <code>agent.yaml</code>, <code>instructions/</code>, <code>workflows/</code>, <code>knowledge/</code>. Claude Code li legge nativamente. Niente TypeScript, nessun build.',
      },
      {
        name: 'Pacchetti dominio',
        desc: "Moduli di competenza collegabili. Aggiungi design system, code review o domini personalizzati senza modificare la cartella dell'agente.",
      },
      {
        name: 'Motore di conoscenza',
        desc: 'Un unico server MCP (<code>@soleri/core</code>). Vault, Cervello, Curatore, Pianificatore, Memoria. Stato persistente e apprendimento.',
      },
      {
        name: 'Trasporti',
        desc: 'MCP (stdio) per Claude Code e Cursor. HTTP/SSE per dashboard. WebSocket per streaming. Telegram per accesso conversazionale.',
      },
    ],
    vault: {
      title: 'Conoscenza che si accumula',
      text: 'Senza un vault, ogni sessione riparte da zero. Ogni pattern, antipattern e decisione che prendi va nel Vault, un archivio ricercabile. Fai una domanda \u2014 ottieni la risposta del tuo team, non una risposta generica.',
      keyPoint: 'Pattern, antipattern e memorie delle sessioni \u2014 tutti ricercabili.',
      code1: `<span class="cmt"># Struttura di una voce del Vault</span>
<span class="key">id:</span> <span class="val">pattern-semantic-tokens</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">Usa sempre token semantici</span>
<span class="key">context:</span>
  <span class="key">domain:</span> <span class="val">design-systems</span>
  <span class="key">confidence:</span> <span class="val">0.94</span>
  <span class="key">sessions:</span> <span class="val">12</span>
<span class="key">tags:</span> <span class="val">[tokens, css, tailwind]</span>`,
      code2: `<span class="cmt"># Cerca nel tuo Vault</span>
<span class="prompt">$</span> <span class="cmd">soleri vault search</span> <span class="arg">"stile del pulsante"</span>

<span class="ok">Trovati 3 corrispondenze:</span>
  <span class="val">pattern-semantic-tokens</span>  <span class="cmt">94% di confidenza</span>
  <span class="val">pattern-button-sizes</span>    <span class="cmt">87% di confidenza</span>
  <span class="val">anti-pattern-inline</span>     <span class="cmt">91% di confidenza</span>`,
    },
    brain: {
      title: 'Diventa pi\u00F9 preciso a ogni sessione',
      text: 'La curazione manuale della conoscenza non scala. Il cervello traccia quali pattern applichi, con quale frequenza e con quanta efficacia. La confidenza cresce automaticamente \u2014 nessun tag manuale necessario.',
      keyPoint: 'Cattura automatica, nessun tag manuale.',
      code: `<span class="cmt"># Output delle forze del cervello</span>
<span class="prompt">$</span> <span class="cmd">soleri brain</span> <span class="arg">strengths</span>

<span class="ok">Migliori pattern (ultimi 7 giorni):</span>
  semantic-tokens    <span class="val">forza: 94</span>  <span class="cmt">12 sessioni</span>
  component-structure <span class="val">forza: 87</span>  <span class="cmt">8 sessioni</span>
  error-boundaries   <span class="val">forza: 82</span>  <span class="cmt">6 sessioni</span>
  a11y-focus-rings   <span class="val">forza: 78</span>  <span class="cmt">5 sessioni</span>
  zustand-patterns   <span class="val">forza: 71</span>  <span class="cmt">4 sessioni</span>`,
    },
    lifecycle: {
      title: 'Conoscenza che cresce \u2014 e rimane precisa',
      text: 'I pattern fluiscono attraverso un ciclo di vita in quattro fasi. Il motore osserva il tuo lavoro, cattura ci\u00F2 che rimane e lo accumula nel tempo.',
      keyPoint:
        'Il tuo Vault non decade \u2014 si perfeziona. Il cervello traccia ci\u00F2 che funziona.',
      steps: [
        {
          label: 'Cattura',
          desc: 'Il motore nota correzioni ripetute, suggerisce pattern',
          color: 'amber' as const,
        },
        {
          label: 'Conserva',
          desc: 'Pattern, antipattern e memorie delle sessioni entrano nel Vault',
          color: 'teal' as const,
        },
        {
          label: 'Rafforza',
          desc: 'I punteggi di fiducia tracciano quanto spesso i pattern hanno successo',
          color: 'green' as const,
        },
        {
          label: 'Componi',
          desc: 'I pattern ad alta fiducia emergono per primi, quelli deboli sono segnalati',
          color: 'amber' as const,
        },
      ],
      code1: `<span class="cmt"># Sessione 3 \u2014 il motore nota un pattern</span>
<span class="warn">!</span> Hai corretto <span class="val">bg-blue-500</span> \u2192 <span class="ok">bg-primary</span> 3 volte.
  Cattura come pattern? <span class="key">[y/n]</span>

<span class="prompt">$</span> <span class="cmd">y</span>

<span class="ok">\u2713</span> Catturato: <span class="val">enforcement dei token semantici</span>
<span class="ok">\u2713</span> Fiducia: <span class="val">0.85</span> <span class="cmt">(aumenter\u00E0 con l'uso)</span>`,
      code2: `<span class="cmt"># Voce del Vault con metadati del ciclo di vita</span>
<span class="key">id:</span> <span class="val">pattern-enforcement-dei-token-semantici</span>
<span class="key">type:</span> <span class="val">pattern</span>
<span class="key">content:</span> <span class="val">Sostituisci i colori raw di Tailwind con i token semantici</span>
<span class="key">confidence:</span> <span class="val">0.91</span>           <span class="cmt"># rafforzato in 8 sessioni</span>
<span class="key">sessions:</span> <span class="val">8</span>
<span class="key">last_applied:</span> <span class="val">2 ore fa</span>
<span class="key">status:</span> <span class="ok">componendo</span>      <span class="cmt"># emerge per primo nella ricerca</span>`,
    },
    transport: {
      title: 'Non sei vincolato a nessun editor',
      text: 'La tua conoscenza non dovrebbe essere intrappolata in un solo strumento. Il Motore di conoscenza funziona come un unico server MCP. Diversi trasporti si collegano ad esso.',
      keyPoint: 'Un motore, molti trasporti.',
      code: `<span class="key">my-agent/</span>           <span class="cmt"># la cartella del tuo agente</span>
├── <span class="ok">agent.yaml</span>       <span class="cmt"># identità + configurazione</span>
├── <span class="key">instructions/</span>    <span class="cmt"># regole comportamentali</span>
└── .mcp.json        <span class="cmt"># connessione al motore</span>

<span class="key">@soleri/core</span>        <span class="cmt"># Motore di conoscenza</span>
├── <span class="ok">MCP (stdio)</span>    <span class="cmt"># Claude Code, Cursor</span>
├── HTTP/SSE       <span class="cmt"># dashboard, API</span>
└── WebSocket      <span class="cmt"># streaming, Telegram</span>`,
    },
    llm: {
      title: 'Funziona senza chiavi API',
      text: "L'infrastruttura della conoscenza non dovrebbe richiedere un abbonamento. La ricerca nel Vault, il pattern matching e il tracciamento del cervello funzionano localmente. Il provider LLM \u00E8 opzionale \u2014 aggiungine uno quando desideri suggerimenti AI.",
      keyPoint: 'Funzionalit\u00E0 di base garantita senza chiavi.',
      code: `<span class="cmt"># agent.yaml \u2014 Configurazione LLM</span>
<span class="key">llm:</span>
  <span class="key">provider:</span> <span class="val">anthropic</span>    <span class="cmt"># oppure: openai, ollama, nessuno</span>
  <span class="key">model:</span>    <span class="val">claude-sonnet-4-6</span>
  <span class="key">fallback:</span> <span class="val">nessuno</span>        <span class="cmt"># funziona senza chiavi API</span>`,
    },
  },
};

interface HowItWorksContent {
  title: string;
  description: string;
  eyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  archLayers: { name: string; desc: string }[];
  vault: {
    title: string;
    text: string;
    keyPoint: string;
    code1: string;
    code2: string;
  };
  brain: {
    title: string;
    text: string;
    keyPoint: string;
    code: string;
  };
  lifecycle: {
    title: string;
    text: string;
    keyPoint: string;
    steps: { label: string; desc: string; color: 'amber' | 'teal' | 'green' }[];
    code1: string;
    code2: string;
  };
  transport: {
    title: string;
    text: string;
    keyPoint: string;
    code: string;
  };
  llm: {
    title: string;
    text: string;
    keyPoint: string;
    code: string;
  };
}
