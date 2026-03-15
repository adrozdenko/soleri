#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerCreate } from './commands/create.js';
import { registerList } from './commands/list.js';
import { registerAddDomain } from './commands/add-domain.js';
import { registerAddPack } from './commands/add-pack.js';
import { registerInstallKnowledge } from './commands/install-knowledge.js';
import { registerDev } from './commands/dev.js';
import { registerDoctor } from './commands/doctor.js';
import { registerHooks } from './commands/hooks.js';
import { registerGovernance } from './commands/governance.js';
import { registerTest } from './commands/test.js';
import { registerUpgrade } from './commands/upgrade.js';
import { registerExtend } from './commands/extend.js';
import { registerInstall } from './commands/install.js';
import { registerUninstall } from './commands/uninstall.js';
import { registerPack } from './commands/pack.js';
import { registerSkills } from './commands/skills.js';
import { registerAgent } from './commands/agent.js';
import { registerTelegram } from './commands/telegram.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function showWelcome(): void {
  console.log();
  console.log(`  ${BOLD}${CYAN}soleri${RESET} ${DIM}v${version}${RESET}`);
  console.log(`  ${DIM}The agent forge${RESET}`);
  console.log();
  console.log(`  ${GREEN}Get started${RESET}`);
  console.log(`    ${BOLD}soleri create${RESET}        Scaffold a new agent`);
  console.log(`    ${BOLD}soleri doctor${RESET}        Check system health`);
  console.log();
  console.log(`  ${YELLOW}Working on an agent${RESET}`);
  console.log(`    ${BOLD}soleri dev${RESET}           Run in development mode`);
  console.log(`    ${BOLD}soleri test${RESET}          Run agent tests`);
  console.log(`    ${BOLD}soleri add-domain${RESET}    Add a knowledge domain`);
  console.log(`    ${BOLD}soleri hooks${RESET}         Manage editor hooks`);
  console.log(`    ${BOLD}soleri install${RESET}       Register agent as MCP server`);
  console.log(`    ${BOLD}soleri uninstall${RESET}     Remove agent MCP server entry`);
  console.log();
  console.log(`  ${DIM}Run ${BOLD}soleri --help${RESET}${DIM} for all commands${RESET}`);
  console.log();
}

const program = new Command();

program
  .name('soleri')
  .description('Developer CLI for creating and managing Soleri AI agents')
  .version(version)
  .action(() => {
    showWelcome();
  });

registerCreate(program);
registerList(program);
registerAddDomain(program);
registerAddPack(program);
registerInstallKnowledge(program);
registerDev(program);
registerDoctor(program);
registerHooks(program);
registerGovernance(program);
registerTest(program);
registerUpgrade(program);
registerExtend(program);
registerInstall(program);
registerUninstall(program);
registerPack(program);
registerSkills(program);
registerAgent(program);
registerTelegram(program);

program.parse();
