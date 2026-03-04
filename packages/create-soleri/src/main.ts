#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cliPkg = require.resolve('@soleri/cli/package.json');
const cliBin = join(dirname(cliPkg), 'dist', 'main.js');

const child = spawn('node', [cliBin, 'create', ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
