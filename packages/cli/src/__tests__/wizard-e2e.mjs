#!/usr/bin/env node
/**
 * Comprehensive E2E tests for the interactive create wizard.
 *
 * Tests all 7 archetypes, custom path, custom greeting, custom domains/principles,
 * hook pack selection, cancel flows, and decline flows.
 *
 * Run: node packages/cli/src/__tests__/wizard-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', '..', 'dist', 'main.js');
const TEST_ROOT = join(tmpdir(), `soleri-e2e-${Date.now()}`);
mkdirSync(TEST_ROOT, { recursive: true });

// ─── Test harness ────────────────────────────────────────

let totalPass = 0;
let totalFail = 0;
const failures = [];

function assert(cond, msg, ctx = '') {
  if (cond) {
    totalPass++;
  } else {
    totalFail++;
    failures.push(ctx ? `${ctx}: ${msg}` : msg);
    console.error(`      FAIL: ${msg}`);
  }
}

function stripAnsi(s) {
  return s
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B\].*?\x07/g, '')
    .replace(new RegExp('\r', 'g'), '');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const ENTER = String.fromCharCode(13);
const CTRL_C = '\x03';
const CTRL_U = '\x15';
const DOWN = '\x1B[B';
const LEFT = '\x1B[D';
const SPACE = ' ';

/**
 * Drive the CLI wizard by waiting for patterns and sending keystrokes.
 */
function runWizard(name, actions, opts = {}) {
  const timeout = opts.timeout || 180000;
  return new Promise((resolve) => {
    let buffer = '';
    const state = { completed: false };
    let actionIndex = 0;

    const proc = spawn('node', [CLI, 'create'], {
      env: { ...process.env, TERM: 'xterm-256color', COLUMNS: '120', LINES: '40' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (d) => { buffer += d.toString(); });
    proc.stderr.on('data', (d) => { buffer += d.toString(); });

    async function drive() {
      while (actionIndex < actions.length && !state.completed) {
        const a = actions[actionIndex];
        const clean = stripAnsi(buffer);
        const matched =
          typeof a.waitFor === 'string'
            ? clean.toLowerCase().includes(a.waitFor.toLowerCase())
            : a.waitFor.test(clean);

        if (matched) {
          actionIndex++;
          await sleep(a.delay || 150);
          if (!state.completed) {
            try {
              proc.stdin.write(a.send);
            } catch {}
          }
        } else {
          await sleep(100);
        }
      }
    }

    drive();
    const poller = setInterval(() => {
      if (!state.completed) drive();
    }, 300);

    proc.on('close', (code) => {
      state.completed = true;
      clearInterval(poller);
      clearTimeout(timer);
      resolve({
        exitCode: code,
        output: stripAnsi(buffer),
        actionsCompleted: actionIndex,
      });
    });

    const timer = setTimeout(() => {
      if (!state.completed) {
        state.completed = true;
        clearInterval(poller);
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {}
          resolve({
            exitCode: -1,
            output: stripAnsi(buffer) + '\n[TIMEOUT]',
            actionsCompleted: actionIndex,
          });
        }, 2000);
      }
    }, timeout);
  });
}

// ─── Helper: standard archetype actions ──────────────────

function archetypeActions(outDir, { downCount = 0 } = {}) {
  const arrows = DOWN.repeat(downCount);
  return [
    { waitFor: 'kind of agent', send: arrows + SPACE + ENTER },
    { waitFor: 'Display name', send: ENTER },
    { waitFor: 'Role', send: ENTER },
    { waitFor: 'Description', send: ENTER },
    { waitFor: /domain|expertise/i, send: ENTER },
    { waitFor: /principle|guiding/i, send: ENTER },
    { waitFor: /tone/i, send: ENTER },
    { waitFor: /skill/i, send: ENTER },
    { waitFor: /greeting/i, send: ENTER },
    { waitFor: /output|directory/i, send: CTRL_U + outDir + ENTER, delay: 300 },
    { waitFor: /hook|pack/i, send: ENTER },
    { waitFor: /create agent/i, send: ENTER },
  ];
}

// ─── Archetype definitions for validation ────────────────

// Note: agentId is slugify(label), not the archetype value.
// e.g., "Full-Stack Assistant" → "full-stack-assistant"
const ARCHETYPES = [
  { value: 'code-reviewer', agentId: 'code-reviewer', label: 'Code Reviewer', tone: 'mentor', totalSkills: 10, downCount: 0 },
  { value: 'security-auditor', agentId: 'security-auditor', label: 'Security Auditor', tone: 'precise', totalSkills: 10, downCount: 1 },
  { value: 'api-architect', agentId: 'api-architect', label: 'API Architect', tone: 'pragmatic', totalSkills: 10, downCount: 2 },
  { value: 'test-engineer', agentId: 'test-engineer', label: 'Test Engineer', tone: 'mentor', totalSkills: 10, downCount: 3 },
  { value: 'devops-pilot', agentId: 'devops-pilot', label: 'DevOps Pilot', tone: 'pragmatic', totalSkills: 10, downCount: 4 },
  { value: 'database-architect', agentId: 'database-architect', label: 'Database Architect', tone: 'precise', totalSkills: 10, downCount: 5 },
  { value: 'full-stack', agentId: 'full-stack-assistant', label: 'Full-Stack Assistant', tone: 'mentor', totalSkills: 11, downCount: 6 },
];

// ══════════════════════════════════════════════════════════
// CANCEL TESTS
// ══════════════════════════════════════════════════════════

async function testCancelArchetype() {
  console.log('\n  [1/14] Cancel at archetype (Ctrl+C)');
  const r = await runWizard('cancel-arch', [
    { waitFor: 'kind of agent', send: CTRL_C },
  ], { timeout: 15000 });
  assert(r.actionsCompleted >= 1, 'prompt reached', 'cancel-archetype');
}

async function testCancelName() {
  console.log('\n  [2/14] Cancel at display name');
  const r = await runWizard('cancel-name', [
    { waitFor: 'kind of agent', send: SPACE + ENTER },
    { waitFor: 'Display name', send: CTRL_C },
  ], { timeout: 15000 });
  assert(r.actionsCompleted >= 2, 'reached name prompt', 'cancel-name');
}

async function testCancelRole() {
  console.log('\n  [3/14] Cancel at role');
  const r = await runWizard('cancel-role', [
    { waitFor: 'kind of agent', send: SPACE + ENTER },
    { waitFor: 'Display name', send: ENTER },
    { waitFor: 'Role', send: CTRL_C },
  ], { timeout: 15000 });
  assert(r.actionsCompleted >= 3, 'reached role prompt', 'cancel-role');
}

async function testCancelSkills() {
  console.log('\n  [4/14] Cancel at skills');
  const r = await runWizard('cancel-skills', [
    { waitFor: 'kind of agent', send: SPACE + ENTER },
    { waitFor: 'Display name', send: ENTER },
    { waitFor: 'Role', send: ENTER },
    { waitFor: 'Description', send: ENTER },
    { waitFor: /domain|expertise/i, send: ENTER },
    { waitFor: /principle|guiding/i, send: ENTER },
    { waitFor: /tone/i, send: ENTER },
    { waitFor: /skill/i, send: CTRL_C },
  ], { timeout: 15000 });
  assert(r.actionsCompleted >= 8, 'reached skills prompt', 'cancel-skills');
}

// ══════════════════════════════════════════════════════════
// DECLINE AT CONFIRMATION
// ══════════════════════════════════════════════════════════

async function testDeclineConfirm() {
  console.log('\n  [5/14] Decline at confirmation');
  const outDir = join(TEST_ROOT, 'decline');
  mkdirSync(outDir, { recursive: true });

  const r = await runWizard('decline', [
    { waitFor: 'kind of agent', send: SPACE + ENTER },
    { waitFor: 'Display name', send: ENTER },
    { waitFor: 'Role', send: ENTER },
    { waitFor: 'Description', send: ENTER },
    { waitFor: /domain|expertise/i, send: ENTER },
    { waitFor: /principle|guiding/i, send: ENTER },
    { waitFor: /tone/i, send: ENTER },
    { waitFor: /skill/i, send: ENTER },
    { waitFor: /greeting/i, send: ENTER },
    { waitFor: /output|directory/i, send: CTRL_U + outDir + ENTER, delay: 300 },
    { waitFor: /hook|pack/i, send: ENTER },
    { waitFor: /create agent/i, send: LEFT + ENTER },
  ], { timeout: 15000 });

  assert(r.actionsCompleted >= 12, `all prompts reached (${r.actionsCompleted}/12)`, 'decline');
  assert(!existsSync(join(outDir, 'code-reviewer', 'package.json')), 'no agent created', 'decline');
}

// ══════════════════════════════════════════════════════════
// ALL 7 ARCHETYPES
// ══════════════════════════════════════════════════════════

async function testArchetype(arch, idx) {
  const testNum = 6 + idx;
  console.log(`\n  [${testNum}/14] Archetype: ${arch.label} (down×${arch.downCount})`);
  const outDir = join(TEST_ROOT, arch.agentId);
  mkdirSync(outDir, { recursive: true });

  const r = await runWizard(arch.agentId, archetypeActions(outDir, { downCount: arch.downCount }));

  const ad = join(outDir, arch.agentId);
  const ctx = `archetype-${arch.agentId}`;

  assert(r.actionsCompleted >= 11, `prompts reached (${r.actionsCompleted}/12)`, ctx);
  assert(r.exitCode === 0, `exit 0 (got ${r.exitCode})`, ctx);
  assert(existsSync(join(ad, 'package.json')), 'package.json exists', ctx);
  assert(existsSync(join(ad, 'dist', 'index.js')), 'dist/index.js built', ctx);

  // Validate persona
  const personaPath = join(ad, 'src', 'identity', 'persona.ts');
  if (existsSync(personaPath)) {
    const persona = readFileSync(personaPath, 'utf-8');
    assert(persona.includes(`'${arch.label}'`) || persona.includes(`"${arch.label}"`),
      `name = ${arch.label}`, ctx);
    assert(persona.includes(`tone: '${arch.tone}'`), `tone = ${arch.tone}`, ctx);
  } else {
    assert(false, 'persona.ts exists', ctx);
  }

  // Validate skills
  const skillsDir = join(ad, 'skills');
  if (existsSync(skillsDir)) {
    const skills = readdirSync(skillsDir);
    assert(skills.length === arch.totalSkills, `${arch.totalSkills} skills (got ${skills.length})`, ctx);
    // Core skills always present
    for (const core of ['brainstorming', 'systematic-debugging', 'verification-before-completion', 'health-check', 'context-resume', 'writing-plans', 'executing-plans']) {
      assert(skills.includes(core), `core skill: ${core}`, ctx);
    }
  } else {
    assert(false, 'skills/ dir exists', ctx);
  }

  // Validate package.json has correct name
  if (existsSync(join(ad, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(ad, 'package.json'), 'utf-8'));
    assert(pkg.name === `${arch.agentId}-mcp`, `package name = ${arch.agentId}-mcp`, ctx);
    assert(pkg.dependencies?.['@soleri/core'], '@soleri/core dependency exists', ctx);
  }

  // Validate domains directory
  const docsDir = join(ad, 'docs', 'vault', 'knowledge');
  if (existsSync(docsDir)) {
    const domains = readdirSync(docsDir);
    assert(domains.length >= 1, `has domain dirs (got ${domains.length})`, ctx);
  }

  console.log(`      exit=${r.exitCode}, agent=${existsSync(ad)}`);
}

// ══════════════════════════════════════════════════════════
// CUSTOM ARCHETYPE PATH
// ══════════════════════════════════════════════════════════

async function testCustomArchetype() {
  console.log('\n  [13/14] Custom archetype — full custom flow');
  const outDir = join(TEST_ROOT, 'custom');
  mkdirSync(outDir, { recursive: true });

  // Navigate to "✦ Create Custom" (8th option = 7 downs)
  const customName = 'GraphQL Guardian';
  const customId = 'graphql-guardian';
  const customRole = 'Validates GraphQL schemas against federation rules';
  const customDesc = 'This agent checks GraphQL schemas for breaking changes, naming conventions, and federation compatibility across subgraphs.';
  const customGreeting = "Hey! Drop your GraphQL schema and I will check it for issues.";

  const r = await runWizard('custom', [
    // Step 1: Select "✦ Create Custom" (9 downs — 9 archetypes before _custom)
    { waitFor: 'kind of agent', send: DOWN.repeat(9) + SPACE + ENTER },
    // Step 2: Type custom name
    { waitFor: 'Display name', send: customName + ENTER },
    // Step 3: Custom role (has playbook note first, then text prompt)
    { waitFor: 'What does your agent do', send: customRole + ENTER },
    // Step 4: Custom description
    { waitFor: 'Describe your agent', send: customDesc + ENTER },
    // Step 5: Domains — select security + api-design (space to toggle, then enter)
    //   Options: security(1st), code-review(2nd), testing(3rd), api-design(4th)
    //   None pre-selected for custom. Select security(space) + down×3 + api-design(space) + enter
    { waitFor: /domain|expertise/i, send: SPACE + DOWN + DOWN + DOWN + SPACE + ENTER },
    // Step 6: Principles — select first two (space, down, space, enter)
    { waitFor: /principle|guiding/i, send: SPACE + DOWN + SPACE + ENTER },
    // Step 7: Tone — select Precise (first option)
    { waitFor: /tone/i, send: ENTER },
    // Step 8: Skills — select vault-navigator + knowledge-harvest (space, down×2, space, enter)
    { waitFor: /skill/i, send: SPACE + DOWN + DOWN + SPACE + ENTER },
    // Step 9: Greeting — select Custom (down + enter)
    { waitFor: /greeting/i, send: DOWN + ENTER },
    // Custom greeting text prompt
    { waitFor: 'Your greeting', send: customGreeting + ENTER },
    // Step 10: Output directory
    { waitFor: /output|directory/i, send: CTRL_U + outDir + ENTER, delay: 300 },
    // Hook packs — skip
    { waitFor: /hook|pack/i, send: ENTER },
    // Confirm
    { waitFor: /create agent/i, send: ENTER },
  ]);

  const ad = join(outDir, customId);
  const ctx = 'custom-archetype';

  assert(r.actionsCompleted >= 13, `prompts reached (${r.actionsCompleted}/14)`, ctx);
  assert(r.exitCode === 0, `exit 0 (got ${r.exitCode})`, ctx);
  assert(existsSync(join(ad, 'package.json')), 'package.json exists', ctx);

  // Validate persona has custom values
  const personaPath = join(ad, 'src', 'identity', 'persona.ts');
  if (existsSync(personaPath)) {
    const persona = readFileSync(personaPath, 'utf-8');
    assert(persona.includes(customName), `name = ${customName}`, ctx);
    assert(persona.includes("tone: 'precise'"), 'tone = precise', ctx);
    assert(persona.includes(customRole), 'custom role present', ctx);
  } else {
    assert(false, 'persona.ts exists', ctx);
  }

  // Validate custom greeting
  const greetingPath = join(ad, 'src', 'identity', 'persona.ts');
  if (existsSync(greetingPath)) {
    const content = readFileSync(greetingPath, 'utf-8');
    assert(content.includes(customGreeting), 'custom greeting present', ctx);
  }

  // Validate skills: 7 core + 2 optional (vault-navigator, knowledge-harvest)
  const skillsDir = join(ad, 'skills');
  if (existsSync(skillsDir)) {
    const skills = readdirSync(skillsDir);
    assert(skills.length === 9, `9 skills (got ${skills.length})`, ctx);
    assert(skills.includes('writing-plans'), 'has writing-plans (core)', ctx);
    assert(skills.includes('vault-navigator'), 'has vault-navigator', ctx);
    assert(!skills.includes('code-patrol'), 'no code-patrol (not selected)', ctx);
  }

  // Validate build
  assert(existsSync(join(ad, 'dist', 'index.js')), 'dist/index.js built', ctx);

  console.log(`      exit=${r.exitCode}, agent=${existsSync(ad)}`);
}

// ══════════════════════════════════════════════════════════
// HOOK PACKS
// ══════════════════════════════════════════════════════════

async function testHookPacks() {
  console.log('\n  [14/14] Hook packs — select a11y + typescript-safety');
  const outDir = join(TEST_ROOT, 'hooks');
  mkdirSync(outDir, { recursive: true });

  // Hook pack options order: a11y(1st), clean-commits(2nd), css-discipline(3rd),
  // full(4th), typescript-safety(5th)
  // Select a11y(space) + down×4 + typescript-safety(space) + enter
  const r = await runWizard('hooks', [
    { waitFor: 'kind of agent', send: SPACE + ENTER },
    { waitFor: 'Display name', send: ENTER },
    { waitFor: 'Role', send: ENTER },
    { waitFor: 'Description', send: ENTER },
    { waitFor: /domain|expertise/i, send: ENTER },
    { waitFor: /principle|guiding/i, send: ENTER },
    { waitFor: /tone/i, send: ENTER },
    { waitFor: /skill/i, send: ENTER },
    { waitFor: /greeting/i, send: ENTER },
    { waitFor: /output|directory/i, send: CTRL_U + outDir + ENTER, delay: 300 },
    // Hook packs: select a11y + typescript-safety
    { waitFor: /hook|pack/i, send: SPACE + DOWN + DOWN + DOWN + DOWN + SPACE + ENTER },
    { waitFor: /create agent/i, send: ENTER },
  ]);

  const ad = join(outDir, 'code-reviewer');
  const ctx = 'hook-packs';

  assert(r.actionsCompleted >= 11, `prompts reached (${r.actionsCompleted}/12)`, ctx);
  assert(r.exitCode === 0, `exit 0 (got ${r.exitCode})`, ctx);

  // Validate hooks were installed
  const output = r.output;
  assert(output.includes('a11y') && output.includes('installed'), 'a11y pack installed', ctx);
  assert(output.includes('typescript-safety') && output.includes('installed'), 'typescript-safety pack installed', ctx);

  // Check .claude directory has hooks
  const claudeDir = join(ad, '.claude');
  if (existsSync(claudeDir)) {
    const files = readdirSync(claudeDir, { recursive: true }).map(String);
    assert(files.length > 0, `.claude/ has hook files (${files.length})`, ctx);
  }

  console.log(`      exit=${r.exitCode}, agent=${existsSync(ad)}, hooks=${r.output.includes('installed')}`);
}

// ══════════════════════════════════════════════════════════
// RUN ALL TESTS
// ══════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════');
console.log(' SOLERI CLI WIZARD — COMPREHENSIVE E2E TESTS');
console.log('═══════════════════════════════════════════════');

const start = Date.now();

// Cancel flows (fast)
await testCancelArchetype();
await testCancelName();
await testCancelRole();
await testCancelSkills();

// Decline
await testDeclineConfirm();

// All 7 archetypes (each scaffolds + builds, slower)
for (let i = 0; i < ARCHETYPES.length; i++) {
  await testArchetype(ARCHETYPES[i], i);
}

// Custom path
await testCustomArchetype();

// Hook packs
await testHookPacks();

// ─── Cleanup ─────────────────────────────────────────────
rmSync(TEST_ROOT, { recursive: true, force: true });

// Clean up any MCP registrations
try {
  const claudeJson = join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude.json',
  );
  if (existsSync(claudeJson)) {
    const c = JSON.parse(readFileSync(claudeJson, 'utf-8'));
    let changed = false;
    for (const arch of ARCHETYPES) {
      if (c.mcpServers?.[arch.agentId]) {
        delete c.mcpServers[arch.agentId];
        changed = true;
      }
    }
    if (c.mcpServers?.['graphql-guardian']) {
      delete c.mcpServers['graphql-guardian'];
      changed = true;
    }
    if (changed) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(claudeJson, JSON.stringify(c, null, 2) + '\n');
    }
  }
} catch {}

// ─── Summary ─────────────────────────────────────────────
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(`\n${'═'.repeat(50)}`);
console.log(` RESULTS: ${totalPass} passed, ${totalFail} failed (${elapsed}s)`);
if (failures.length > 0) {
  console.log('\n FAILURES:');
  for (const f of failures) {
    console.log(`   • ${f}`);
  }
}
console.log('═'.repeat(50));

process.exit(totalFail > 0 ? 1 : 0);
