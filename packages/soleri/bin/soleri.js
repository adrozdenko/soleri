#!/usr/bin/env node
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve @soleri/cli's bin entry and run it
const require = createRequire(import.meta.url);
const cliPkg = dirname(require.resolve('@soleri/cli/package.json'));
const main = resolve(cliPkg, 'dist', 'main.js');
await import(main);
