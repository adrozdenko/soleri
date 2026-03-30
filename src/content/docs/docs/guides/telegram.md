---
title: 'Telegram Integration'
description: 'Give your agent a Telegram interface — chat with it from your phone.'
---

Your agent can run as a Telegram bot, giving you a mobile-friendly interface to your knowledge base, planning, and all agent capabilities. The Telegram transport runs alongside the [standard MCP interface](/docs/guides/transports/) — you can use both.

## Enabling Telegram

From your agent project directory:

```bash
npx @soleri/cli telegram enable
```

This generates four files in your agent's `src/` directory:

| File                    | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `telegram-bot.ts`       | Bot entry point and message handling           |
| `telegram-agent.ts`     | Agent integration layer                        |
| `telegram-config.ts`    | Configuration loading                          |
| `telegram-supervisor.ts`| Process supervisor with auto-restart           |

It also adds the [grammy](https://grammy.dev/) dependency to your `package.json` and registers two npm scripts:

- `npm run telegram:start` — production mode
- `npm run telegram:dev` — development mode with auto-restart (via tsx)

## Setup wizard

After enabling, run the interactive setup:

```bash
npx @soleri/cli telegram setup
```

The wizard walks you through four steps:

### Step 1: Create a Telegram bot

1. Open Telegram and talk to [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the instructions
3. Copy the bot token when you receive it
4. Paste it into the wizard

### Step 2: LLM API key

Choose your provider:

- **Anthropic (Claude)** — recommended
- **OpenAI** — GPT-4.1, GPT-4.1-mini, or o3
- **Environment variable** — skip if you set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in your environment

### Step 3: Security

Optionally set a passphrase. When set, users must send the passphrase to authenticate before the bot responds to their messages. Leave empty for open access.

### Step 4: Model selection

Pick a default model. For Anthropic: Claude Sonnet 4 (fast, recommended), Claude Opus 4 (powerful), or Claude 3.5 Haiku (economical). For OpenAI: GPT-4.1, GPT-4.1-mini, or o3.

The wizard saves configuration to `~/.{agent-id}/telegram.json`.

## Running the bot

```bash
npm run telegram:start    # Production
npm run telegram:dev      # Development (auto-restart on changes)
```

## Checking status

```bash
npx @soleri/cli telegram status
```

This shows:

- Whether all Telegram source files are present
- Grammy dependency status
- npm script registration
- Configuration file location and contents (token set, API key set, model)
- Overall readiness and next steps

## Disabling Telegram

```bash
npx @soleri/cli telegram disable
```

This removes the four Telegram source files, the grammy dependency, and the telegram npm scripts from `package.json`. Run `npm install` afterward to clean up `node_modules`.

## Monitoring

Once running, you can monitor the bot:

```bash
tail -f ~/.{agent-id}/logs/telegram-*.log     # Bot logs
tail -f ~/.{agent-id}/logs/events-*.jsonl      # Event stream
```

Replace `{agent-id}` with your agent's ID.

---

_Previous: [Getting Started](/docs/getting-started/) — install and scaffold your first agent. Next: [Customizing Your Agent](/docs/guides/customizing/) — shape your agent's personality, domains, and behavior. See also [Transports](/docs/guides/transports/) for other connection methods and the [CLI Reference](/docs/cli-reference/) for all `soleri telegram` subcommands._
