#!/usr/bin/env node

/**
 * Soleri Knowledge Engine — thin wrapper that delegates to @soleri/core.
 *
 * Usage:
 *   npx @soleri/engine --agent ./agent.yaml
 *   soleri-engine --agent ./agent.yaml
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';

// Resolve @soleri/core's engine binary
const require = createRequire(import.meta.url);
const corePath = dirname(require.resolve('@soleri/core/package.json'));
const engineBin = resolve(corePath, 'dist', 'engine', 'bin', 'soleri-engine.js');

// Dynamic import — the actual engine
await import(engineBin);
