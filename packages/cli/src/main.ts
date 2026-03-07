#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerCreate } from './commands/create.js';
import { registerList } from './commands/list.js';
import { registerAddDomain } from './commands/add-domain.js';
import { registerInstallKnowledge } from './commands/install-knowledge.js';
import { registerDev } from './commands/dev.js';
import { registerDoctor } from './commands/doctor.js';
import { registerHooks } from './commands/hooks.js';
import { registerGovernance } from './commands/governance.js';
import { registerTest } from './commands/test.js';
import { registerUpgrade } from './commands/upgrade.js';
import { registerExtend } from './commands/extend.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('soleri')
  .description('Developer CLI for creating and managing Soleri AI agents')
  .version(version);

registerCreate(program);
registerList(program);
registerAddDomain(program);
registerInstallKnowledge(program);
registerDev(program);
registerDoctor(program);
registerHooks(program);
registerGovernance(program);
registerTest(program);
registerUpgrade(program);
registerExtend(program);

program.parse();
