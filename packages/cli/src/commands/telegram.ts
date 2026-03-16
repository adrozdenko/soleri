/**
 * Telegram transport management — enable, disable, setup, status.
 *
 * `soleri telegram enable`  — Add Telegram files to the current agent
 * `soleri telegram disable` — Remove Telegram files from the current agent
 * `soleri telegram setup`   — Interactive config wizard (bot token, API key, model)
 * `soleri telegram status`  — Check Telegram configuration status
 */

import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import {
  generateTelegramBot,
  generateTelegramAgent,
  generateTelegramConfig,
  generateTelegramSupervisor,
} from '@soleri/forge/lib';
import type { AgentConfig } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

// ─── Telegram file paths relative to agent src/ ─────────────────────

const TELEGRAM_FILES = [
  'src/telegram-bot.ts',
  'src/telegram-agent.ts',
  'src/telegram-config.ts',
  'src/telegram-supervisor.ts',
] as const;

// ─── Registration ───────────────────────────────────────────────────

export function registerTelegram(program: Command): void {
  const tg = program
    .command('telegram')
    .description('Manage Telegram transport for the current agent');

  // ─── enable ─────────────────────────────────────────────────────
  tg.command('enable')
    .description('Add Telegram transport files to the current agent')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Check if already enabled
      const existingFiles = TELEGRAM_FILES.filter((f) => existsSync(join(ctx.agentPath, f)));
      if (existingFiles.length === TELEGRAM_FILES.length) {
        p.log.warn('Telegram is already enabled for this agent.');
        p.log.info('Run `soleri telegram setup` to configure it.');
        return;
      }
      if (existingFiles.length > 0) {
        p.log.warn(
          `Partial Telegram setup detected (${existingFiles.length}/${TELEGRAM_FILES.length} files). Regenerating all files.`,
        );
      }

      // Reconstruct AgentConfig
      const config = readAgentConfig(ctx.agentPath, ctx.agentId);
      if (!config) {
        p.log.error('Could not read agent config from persona.ts and entry point.');
        process.exit(1);
        return;
      }

      // Generate the 4 Telegram files
      const s = p.spinner();
      s.start('Generating Telegram transport files...');

      const telegramFiles: Array<[string, string]> = [
        ['src/telegram-bot.ts', generateTelegramBot(config)],
        ['src/telegram-agent.ts', generateTelegramAgent(config)],
        ['src/telegram-config.ts', generateTelegramConfig(config)],
        ['src/telegram-supervisor.ts', generateTelegramSupervisor(config)],
      ];

      for (const [relPath, content] of telegramFiles) {
        writeFileSync(join(ctx.agentPath, relPath), content, 'utf-8');
      }

      s.stop('Generated 4 Telegram transport files');

      // Add grammy to package.json if not present
      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      let pkgChanged = false;

      if (!pkg.dependencies?.grammy) {
        if (!pkg.dependencies) pkg.dependencies = {};
        pkg.dependencies.grammy = '^1.35.0';
        pkgChanged = true;
        p.log.info('Added grammy dependency to package.json');
      }

      // Add npm scripts if not present
      if (!pkg.scripts) pkg.scripts = {};
      if (!pkg.scripts['telegram:start']) {
        pkg.scripts['telegram:start'] = 'node dist/telegram-supervisor.js';
        pkgChanged = true;
      }
      if (!pkg.scripts['telegram:dev']) {
        pkg.scripts['telegram:dev'] = 'tsx src/telegram-bot.ts';
        pkgChanged = true;
      }

      if (pkgChanged) {
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        p.log.info('Updated package.json with telegram scripts');
      }

      // Install grammy
      const installSpinner = p.spinner();
      installSpinner.start('Installing grammy...');
      try {
        execFileSync('npm', ['install', '--no-fund', '--no-audit'], {
          cwd: ctx.agentPath,
          stdio: 'pipe',
          timeout: 120_000,
        });
        installSpinner.stop('Installed grammy');
      } catch {
        installSpinner.stop('npm install skipped — run `npm install` manually');
      }

      p.log.success('Telegram enabled!');
      p.log.info(`Run \`soleri telegram setup\` to configure bot token and API key.`);
    });

  // ─── setup ──────────────────────────────────────────────────────
  tg.command('setup')
    .description('Interactive Telegram configuration wizard')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Check that Telegram files exist
      const missingFiles = TELEGRAM_FILES.filter((f) => !existsSync(join(ctx.agentPath, f)));
      if (missingFiles.length > 0) {
        p.log.error('Telegram is not enabled. Run `soleri telegram enable` first.');
        process.exit(1);
        return;
      }

      p.intro(`Telegram Setup for ${ctx.agentId}`);

      // Step 1: Bot token
      p.log.step('Step 1: Create a Telegram bot');
      p.log.message(
        [
          '  Open Telegram and talk to @BotFather',
          '  Send /newbot and follow the instructions',
          '  Copy the bot token when you get it',
        ].join('\n'),
      );

      const botToken = await p.text({
        message: 'Paste your bot token:',
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
        validate: (val) => {
          if (!val || val.trim().length === 0) return 'Bot token is required';
          if (!val.includes(':')) return 'Invalid token format (expected number:string)';
          return undefined;
        },
      });
      if (p.isCancel(botToken)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Step 2: LLM API key
      p.log.step('Step 2: LLM API Key');
      p.log.message('  Your agent needs an API key to think');

      const provider = await p.select({
        message: 'Which provider?',
        options: [
          { value: 'anthropic', label: 'Anthropic (Claude)' },
          { value: 'openai', label: 'OpenAI' },
          { value: 'env', label: 'Use environment variable (skip)' },
        ],
      });
      if (p.isCancel(provider)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      let apiKey = '';
      if (provider !== 'env') {
        const keyPlaceholder = provider === 'anthropic' ? 'sk-ant-...' : 'sk-...';
        const envHint = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';

        const keyInput = await p.text({
          message: `Paste your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key:`,
          placeholder: keyPlaceholder,
          validate: (val) => {
            if (!val || val.trim().length === 0)
              return `API key is required (or set ${envHint} env var)`;
            return undefined;
          },
        });
        if (p.isCancel(keyInput)) {
          p.cancel('Setup cancelled.');
          process.exit(0);
        }
        apiKey = keyInput;
      }

      // Step 3: Security
      p.log.step('Step 3: Security (optional)');

      const passphrase = await p.text({
        message: 'Set a passphrase? Users must send this to authenticate.',
        placeholder: '(empty for open access)',
        defaultValue: '',
      });
      if (p.isCancel(passphrase)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Step 4: Model selection
      p.log.step('Step 4: Model selection');

      const modelOptions =
        provider === 'openai'
          ? [
              { value: 'gpt-4.1', label: 'gpt-4.1 (recommended)' },
              { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini (fast)' },
              { value: 'o3', label: 'o3 (reasoning)' },
            ]
          : [
              { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4 (fast, recommended)' },
              { value: 'claude-opus-4-20250514', label: 'claude-opus-4 (powerful)' },
              { value: 'claude-haiku-3-5-20241022', label: 'claude-3.5-haiku (economical)' },
            ];

      const model = await p.select({
        message: 'Default model:',
        options: modelOptions,
      });
      if (p.isCancel(model)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Save config
      const configDir = join(homedir(), `.${ctx.agentId}`);
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'telegram.json');

      const telegramConfig: Record<string, unknown> = {
        botToken: (botToken as string).trim(),
        ...(apiKey ? { apiKey } : {}),
        provider: provider === 'env' ? 'anthropic' : provider,
        model,
        ...(passphrase ? { passphrase } : {}),
        allowedUsers: [],
      };

      writeFileSync(configPath, JSON.stringify(telegramConfig, null, 2) + '\n', 'utf-8');

      p.outro(`Configuration saved to ${configPath}`);

      console.log('');
      p.log.info('  Run: npm run telegram:start');
      p.log.info('  Or:  npm run telegram:dev (with auto-restart)');
      console.log('');
    });

  // ─── disable ────────────────────────────────────────────────────
  tg.command('disable')
    .description('Remove Telegram transport from the current agent')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Check if any Telegram files exist
      const existingFiles = TELEGRAM_FILES.filter((f) => existsSync(join(ctx.agentPath, f)));
      if (existingFiles.length === 0) {
        p.log.warn('Telegram is not enabled for this agent.');
        return;
      }

      const confirmed = await p.confirm({
        message: `Remove ${existingFiles.length} Telegram files and related config from ${ctx.agentId}?`,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Cancelled.');
        return;
      }

      // Remove Telegram source files
      for (const relPath of TELEGRAM_FILES) {
        const fullPath = join(ctx.agentPath, relPath);
        if (existsSync(fullPath)) {
          unlinkSync(fullPath);
        }
      }
      p.log.info(`Removed ${existingFiles.length} Telegram source files`);

      // Remove grammy from package.json and telegram scripts
      const pkgPath = join(ctx.agentPath, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        let changed = false;

        if (pkg.dependencies?.grammy) {
          delete pkg.dependencies.grammy;
          changed = true;
        }
        if (pkg.scripts?.['telegram:start']) {
          delete pkg.scripts['telegram:start'];
          changed = true;
        }
        if (pkg.scripts?.['telegram:dev']) {
          delete pkg.scripts['telegram:dev'];
          changed = true;
        }

        if (changed) {
          writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
          p.log.info('Removed grammy dependency and telegram scripts from package.json');
        }
      }

      p.log.success('Telegram disabled.');
      p.log.info('Run `npm install` to clean up node_modules.');
    });

  // ─── status ─────────────────────────────────────────────────────
  tg.command('status')
    .description('Check Telegram configuration status')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      console.log(`\n  Agent: ${ctx.agentId}`);

      // Check source files
      const presentFiles = TELEGRAM_FILES.filter((f) => existsSync(join(ctx.agentPath, f)));
      const filesEnabled = presentFiles.length === TELEGRAM_FILES.length;
      console.log(
        `  Files: ${filesEnabled ? 'all present' : `${presentFiles.length}/${TELEGRAM_FILES.length} present`}`,
      );
      if (!filesEnabled && presentFiles.length > 0) {
        for (const f of TELEGRAM_FILES) {
          const exists = existsSync(join(ctx.agentPath, f));
          console.log(`    ${exists ? '+' : '-'} ${f}`);
        }
      }

      // Check grammy dependency
      const pkgPath = join(ctx.agentPath, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const hasGrammy = !!pkg.dependencies?.grammy;
        console.log(
          `  Grammy: ${hasGrammy ? `installed (${pkg.dependencies.grammy})` : 'not in dependencies'}`,
        );

        const hasStartScript = !!pkg.scripts?.['telegram:start'];
        const hasDevScript = !!pkg.scripts?.['telegram:dev'];
        console.log(
          `  Scripts: ${hasStartScript && hasDevScript ? 'telegram:start, telegram:dev' : hasStartScript ? 'telegram:start only' : hasDevScript ? 'telegram:dev only' : 'none'}`,
        );
      }

      // Check config file
      const configPath = join(homedir(), `.${ctx.agentId}`, 'telegram.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const hasToken = !!config.botToken;
          const hasKey = !!config.apiKey;
          console.log(`  Config: ${configPath}`);
          console.log(`  Bot token: ${hasToken ? 'set' : 'not set'}`);
          console.log(`  API key: ${hasKey ? 'set' : 'not set (check env vars)'}`);
          if (config.model) console.log(`  Model: ${config.model}`);
          if (config.passphrase) console.log(`  Passphrase: set`);
        } catch {
          console.log(`  Config: ${configPath} (invalid JSON)`);
        }
      } else {
        console.log(`  Config: not found at ${configPath}`);
        if (filesEnabled) {
          console.log('  Run `soleri telegram setup` to configure.');
        }
      }

      // Overall status
      const ready = filesEnabled && existsSync(configPath);
      console.log(`\n  Status: ${ready ? 'ready to start' : 'needs configuration'}`);
      if (!filesEnabled) {
        console.log('  Next: Run `soleri telegram enable`');
      } else if (!existsSync(configPath)) {
        console.log('  Next: Run `soleri telegram setup`');
      } else {
        console.log('  Next: Run `npm run telegram:start` or `npm run telegram:dev`');
      }
      console.log('');
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Reconstruct an AgentConfig from an existing scaffolded agent.
 * Mirrors the logic in agent.ts but returns a config with telegram: true.
 */
function readAgentConfig(agentPath: string, agentId: string): AgentConfig | null {
  // Try both locations: v6+ (src/identity/) and v5 (src/activation/)
  const personaCandidates = [
    join(agentPath, 'src', 'identity', 'persona.ts'),
    join(agentPath, 'src', 'activation', 'persona.ts'),
  ];
  const personaPath = personaCandidates.find((candidate) => existsSync(candidate));
  if (!personaPath) return null;
  const personaSrc = readFileSync(personaPath, 'utf-8');

  const name = extractStringField(personaSrc, 'name') ?? agentId;
  const role = extractStringField(personaSrc, 'role') ?? '';
  const description = extractStringField(personaSrc, 'description') ?? '';
  const tone =
    (extractStringField(personaSrc, 'tone') as 'precise' | 'mentor' | 'pragmatic') ?? 'pragmatic';
  const greeting = extractStringField(personaSrc, 'greeting') ?? `Hello! I'm ${name}.`;
  const principles = extractArrayField(personaSrc, 'principles');

  // Read domains from entry point
  const indexPath = join(agentPath, 'src', 'index.ts');
  const domains = existsSync(indexPath) ? extractDomains(readFileSync(indexPath, 'utf-8')) : [];

  const pkg = JSON.parse(readFileSync(join(agentPath, 'package.json'), 'utf-8'));

  return {
    id: agentId,
    name,
    role,
    description,
    domains,
    principles,
    tone,
    greeting,
    outputDir: agentPath,
    hookPacks: [],
    model: pkg.soleri?.model ?? 'claude-code-sonnet-4',
    setupTarget: pkg.soleri?.setupTarget ?? 'claude',
    telegram: true, // Force true — we're enabling telegram
    cognee: pkg.soleri?.cognee ?? false,
  };
}

function extractStringField(src: string, field: string): string | undefined {
  const re = new RegExp(`${field}:\\s*'([^']*)'`);
  const m = src.match(re);
  return m ? m[1].replace(/\\'/g, "'") : undefined;
}

function extractArrayField(src: string, field: string): string[] {
  const re = new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`);
  const m = src.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

function extractDomains(indexSrc: string): string[] {
  const m = indexSrc.match(/createDomainFacades\(runtime,\s*['"][^'"]+['"]\s*,\s*\[([\s\S]*?)\]\)/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}
