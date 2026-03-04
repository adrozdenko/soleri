#!/usr/bin/env node

import { Command } from 'commander';
import { registerCreate } from './commands/create.js';
import { registerList } from './commands/list.js';
import { registerAddDomain } from './commands/add-domain.js';
import { registerInstallKnowledge } from './commands/install-knowledge.js';
import { registerDev } from './commands/dev.js';
import { registerDoctor } from './commands/doctor.js';
import { registerHooks } from './commands/hooks.js';

const program = new Command();

program
  .name('soleri')
  .description('Developer CLI for creating and managing Soleri AI agents')
  .version('1.0.0');

registerCreate(program);
registerList(program);
registerAddDomain(program);
registerInstallKnowledge(program);
registerDev(program);
registerDoctor(program);
registerHooks(program);

program.parse();
