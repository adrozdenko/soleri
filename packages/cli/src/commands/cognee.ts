/**
 * Cognee vector search management — enable, disable, setup, status.
 *
 * `soleri cognee enable`  — Wire Cognee into the agent runtime
 * `soleri cognee disable` — Remove Cognee integration from the agent
 * `soleri cognee setup`   — Interactive config wizard (base URL, embedding, auth)
 * `soleri cognee status`  — Check Cognee configuration and sidecar health
 */

import { join } from 'node:path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import type { AgentConfig } from '@soleri/forge/lib';
import { generateEntryPoint } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

// Docker Compose file name (copied into agent project on enable)
const COGNEE_COMPOSE_FILE = 'docker-compose.cognee.yml';

// npm scripts added on enable
const COGNEE_SCRIPTS: Record<string, string> = {
  'cognee:up': `docker compose -f ${COGNEE_COMPOSE_FILE} up -d`,
  'cognee:down': `docker compose -f ${COGNEE_COMPOSE_FILE} down`,
  'cognee:logs': `docker compose -f ${COGNEE_COMPOSE_FILE} logs -f cognee`,
};

// ─── Registration ───────────────────────────────────────────────────

export function registerCognee(program: Command): void {
  const cmd = program
    .command('cognee')
    .description('Manage Cognee vector search integration for the current agent');

  // ─── enable ─────────────────────────────────────────────────────
  cmd
    .command('enable')
    .description('Enable Cognee vector search for the current agent')
    .action(() => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Check if already enabled
      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.soleri?.cognee === true) {
        p.log.warn('Cognee is already enabled for this agent.');
        p.log.info('Run `soleri cognee setup` to configure it.');
        return;
      }

      // Reconstruct AgentConfig and regenerate entry point with cognee: true
      const config = readAgentConfig(ctx.agentPath, ctx.agentId);
      if (!config) {
        p.log.error('Could not read agent config from persona.ts and entry point.');
        process.exit(1);
        return;
      }

      const s = p.spinner();

      // 1. Regenerate entry point with cognee: true
      s.start('Regenerating entry point with Cognee integration...');
      const entryPointCode = generateEntryPoint({ ...config, cognee: true });
      writeFileSync(join(ctx.agentPath, 'src', 'index.ts'), entryPointCode, 'utf-8');
      s.stop('Entry point regenerated with Cognee integration');

      // 2. Copy docker-compose.cognee.yml if available
      const sourceCompose = join(ctx.agentPath, '..', '..', 'docker', COGNEE_COMPOSE_FILE);
      const targetCompose = join(ctx.agentPath, COGNEE_COMPOSE_FILE);
      if (existsSync(sourceCompose) && !existsSync(targetCompose)) {
        copyFileSync(sourceCompose, targetCompose);
        p.log.info(`Copied ${COGNEE_COMPOSE_FILE} to agent project`);
      } else if (!existsSync(targetCompose)) {
        p.log.warn(
          `${COGNEE_COMPOSE_FILE} not found — create one manually or run Cognee externally`,
        );
      }

      // 3. Update package.json
      let pkgChanged = false;
      if (!pkg.soleri) pkg.soleri = {};
      pkg.soleri.cognee = true;
      pkgChanged = true;

      if (!pkg.scripts) pkg.scripts = {};
      for (const [name, script] of Object.entries(COGNEE_SCRIPTS)) {
        if (!pkg.scripts[name]) {
          pkg.scripts[name] = script;
          pkgChanged = true;
        }
      }

      if (pkgChanged) {
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        p.log.info('Updated package.json with cognee flag and scripts');
      }

      p.log.success('Cognee enabled!');
      p.log.info('Next steps:');
      p.log.info('  1. Run `soleri cognee setup` to configure base URL and auth');
      p.log.info('  2. Run `npm run cognee:up` to start the Cognee sidecar');
      p.log.info('  3. Rebuild: `npm run build`');
    });

  // ─── setup ──────────────────────────────────────────────────────
  cmd
    .command('setup')
    .description('Interactive Cognee configuration wizard')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      // Check if enabled
      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.soleri?.cognee) {
        p.log.error('Cognee is not enabled. Run `soleri cognee enable` first.');
        process.exit(1);
        return;
      }

      p.intro(`Cognee Setup for ${ctx.agentId}`);

      // Step 1: Base URL
      p.log.step('Step 1: Cognee API endpoint');
      const baseUrl = await p.text({
        message: 'Cognee API base URL:',
        placeholder: 'http://localhost:8000',
        defaultValue: 'http://localhost:8000',
      });
      if (p.isCancel(baseUrl)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Step 2: Embedding provider
      p.log.step('Step 2: Embedding provider');
      const embeddingProvider = await p.select({
        message: 'Which embedding provider?',
        options: [
          { value: 'ollama', label: 'Ollama (local, free — nomic-embed-text)' },
          { value: 'openai', label: 'OpenAI (text-embedding-3-small)' },
          { value: 'env', label: 'Use environment variables (skip)' },
        ],
      });
      if (p.isCancel(embeddingProvider)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Step 3: API token (optional)
      p.log.step('Step 3: Authentication (optional)');
      p.log.message('  Leave empty for local Cognee (AUTH_REQUIRED=false)');
      const apiToken = await p.text({
        message: 'Cognee API token:',
        placeholder: '(empty for local, no auth)',
        defaultValue: '',
      });
      if (p.isCancel(apiToken)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Step 4: Dataset name
      p.log.step('Step 4: Dataset');
      const dataset = await p.text({
        message: 'Dataset name for this agent:',
        placeholder: ctx.agentId,
        defaultValue: ctx.agentId,
      });
      if (p.isCancel(dataset)) {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      // Save config
      const configDir = join(homedir(), `.${ctx.agentId}`);
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'cognee.json');

      const cogneeConfig: Record<string, unknown> = {
        baseUrl: (baseUrl as string).trim(),
        embeddingProvider: embeddingProvider === 'env' ? 'ollama' : embeddingProvider,
        ...(apiToken ? { apiToken } : {}),
        dataset: (dataset as string).trim(),
      };

      writeFileSync(configPath, JSON.stringify(cogneeConfig, null, 2) + '\n', 'utf-8');

      p.outro(`Configuration saved to ${configPath}`);

      console.log('');
      p.log.info('  Start Cognee: npm run cognee:up');
      p.log.info('  Check status: soleri cognee status');
      console.log('');
    });

  // ─── disable ────────────────────────────────────────────────────
  cmd
    .command('disable')
    .description('Remove Cognee vector search from the current agent')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.soleri?.cognee) {
        p.log.warn('Cognee is not enabled for this agent.');
        return;
      }

      const confirmed = await p.confirm({
        message: `Disable Cognee vector search for ${ctx.agentId}? (Vault FTS5 search continues to work)`,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel('Cancelled.');
        return;
      }

      // 1. Regenerate entry point without cognee
      const config = readAgentConfig(ctx.agentPath, ctx.agentId);
      if (config) {
        const s = p.spinner();
        s.start('Regenerating entry point without Cognee...');
        const entryPointCode = generateEntryPoint({ ...config, cognee: false });
        writeFileSync(join(ctx.agentPath, 'src', 'index.ts'), entryPointCode, 'utf-8');
        s.stop('Entry point regenerated without Cognee');
      }

      // 2. Remove docker-compose
      const composePath = join(ctx.agentPath, COGNEE_COMPOSE_FILE);
      if (existsSync(composePath)) {
        unlinkSync(composePath);
        p.log.info('Removed docker-compose.cognee.yml');
      }

      // 3. Update package.json
      let changed = false;
      if (pkg.soleri?.cognee) {
        pkg.soleri.cognee = false;
        changed = true;
      }
      for (const name of Object.keys(COGNEE_SCRIPTS)) {
        if (pkg.scripts?.[name]) {
          delete pkg.scripts[name];
          changed = true;
        }
      }
      if (changed) {
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        p.log.info('Removed cognee scripts from package.json');
      }

      p.log.success('Cognee disabled. Vault FTS5 search still works.');
      p.log.info('Run `npm run build` to rebuild.');
    });

  // ─── status ─────────────────────────────────────────────────────
  cmd
    .command('status')
    .description('Check Cognee configuration and sidecar health')
    .action(async () => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory.');
        process.exit(1);
        return;
      }

      const pkgPath = join(ctx.agentPath, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const enabled = pkg.soleri?.cognee === true;

      console.log(`\n  Agent: ${ctx.agentId}`);
      console.log(`  Cognee: ${enabled ? 'enabled' : 'disabled'}`);

      if (!enabled) {
        console.log('\n  Run `soleri cognee enable` to add vector search.');
        console.log('');
        return;
      }

      // Check Docker Compose file
      const composePath = join(ctx.agentPath, COGNEE_COMPOSE_FILE);
      console.log(`  Docker Compose: ${existsSync(composePath) ? 'present' : 'missing'}`);

      // Check npm scripts
      const hasScripts = Object.keys(COGNEE_SCRIPTS).every((s) => !!pkg.scripts?.[s]);
      console.log(`  Scripts: ${hasScripts ? 'all present' : 'some missing'}`);

      // Check config file
      const configPath = join(homedir(), `.${ctx.agentId}`, 'cognee.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          console.log(`  Config: ${configPath}`);
          console.log(`  Base URL: ${config.baseUrl ?? 'not set'}`);
          console.log(`  Embedding: ${config.embeddingProvider ?? 'not set'}`);
          console.log(`  Dataset: ${config.dataset ?? ctx.agentId}`);
          console.log(`  API token: ${config.apiToken ? 'set' : 'not set (local mode)'}`);
        } catch {
          console.log(`  Config: ${configPath} (invalid JSON)`);
        }
      } else {
        console.log(`  Config: not found at ${configPath}`);
        console.log('  Run `soleri cognee setup` to configure.');
      }

      // Try health check
      const baseUrl =
        process.env.COGNEE_BASE_URL ??
        (existsSync(configPath)
          ? JSON.parse(readFileSync(configPath, 'utf-8')).baseUrl
          : 'http://localhost:8000');

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
        clearTimeout(timeout);
        console.log(`  Sidecar: ${res.ok ? 'running' : `HTTP ${res.status}`} at ${baseUrl}`);
      } catch {
        console.log(`  Sidecar: not reachable at ${baseUrl}`);
      }

      // Overall status
      const ready = enabled && existsSync(configPath);
      console.log(`\n  Status: ${ready ? 'configured' : 'needs configuration'}`);
      if (!existsSync(configPath)) {
        console.log('  Next: Run `soleri cognee setup`');
      } else {
        console.log('  Next: Run `npm run cognee:up` to start the sidecar');
      }
      console.log('');
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────

function readAgentConfig(agentPath: string, agentId: string): AgentConfig | null {
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
    telegram: pkg.soleri?.telegram ?? false,
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
