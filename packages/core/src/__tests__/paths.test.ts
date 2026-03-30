import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { findProjectRoot } from '../paths.js';

// Resolve the monorepo root from __dirname (packages/core/src/__tests__)
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

describe('findProjectRoot', () => {
  it('finds monorepo root from package subdirectory', () => {
    const packageDir = join(MONOREPO_ROOT, 'packages', 'core');
    const root = findProjectRoot(packageDir);
    expect(root).toBe(MONOREPO_ROOT);
  });

  it('finds root from deeply nested directory', () => {
    const deepDir = join(MONOREPO_ROOT, 'packages', 'core', 'src', 'runtime');
    const root = findProjectRoot(deepDir);
    expect(root).toBe(MONOREPO_ROOT);
  });

  it('returns root when already at root', () => {
    const root = findProjectRoot(MONOREPO_ROOT);
    expect(root).toBe(MONOREPO_ROOT);
  });

  it('returns startDir as fallback for non-project directory', () => {
    const tmpDir = '/tmp';
    const result = findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });
});
