/**
 * Tests for the playbooks barrel export (index.ts).
 *
 * Validates that the public API surface is complete — every expected
 * function, class, and type-level export is accessible from the barrel.
 */

import { describe, it, expect } from 'vitest';
import * as playbooksModule from './index.js';

describe('playbooks barrel export', () => {
  it('should export getBuiltinPlaybook function', () => {
    expect(typeof playbooksModule.getBuiltinPlaybook).toBe('function');
  });

  it('should export getAllBuiltinPlaybooks function', () => {
    expect(typeof playbooksModule.getAllBuiltinPlaybooks).toBe('function');
  });

  it('should export scorePlaybook function', () => {
    expect(typeof playbooksModule.scorePlaybook).toBe('function');
  });

  it('should export mergePlaybooks function', () => {
    expect(typeof playbooksModule.mergePlaybooks).toBe('function');
  });

  it('should export matchPlaybooks function', () => {
    expect(typeof playbooksModule.matchPlaybooks).toBe('function');
  });

  it('should export playbookDefinitionToEntry function', () => {
    expect(typeof playbooksModule.playbookDefinitionToEntry).toBe('function');
  });

  it('should export entryToPlaybookDefinition function', () => {
    expect(typeof playbooksModule.entryToPlaybookDefinition).toBe('function');
  });

  it('should export seedDefaultPlaybooks function', () => {
    expect(typeof playbooksModule.seedDefaultPlaybooks).toBe('function');
  });

  it('should export PlaybookExecutor class', () => {
    expect(typeof playbooksModule.PlaybookExecutor).toBe('function');
    const executor = new playbooksModule.PlaybookExecutor();
    expect(executor).toBeInstanceOf(playbooksModule.PlaybookExecutor);
  });

  it('should not export unexpected runtime values', () => {
    const expectedExports = [
      'getBuiltinPlaybook',
      'getAllBuiltinPlaybooks',
      'scorePlaybook',
      'mergePlaybooks',
      'matchPlaybooks',
      'playbookDefinitionToEntry',
      'entryToPlaybookDefinition',
      'seedDefaultPlaybooks',
      'PlaybookExecutor',
    ];

    const actualExports = Object.keys(playbooksModule);
    expect(actualExports.sort()).toEqual(expectedExports.sort());
  });

  it('should return playbooks from getAllBuiltinPlaybooks via barrel', () => {
    const playbooks = playbooksModule.getAllBuiltinPlaybooks();
    expect(playbooks.length).toBeGreaterThanOrEqual(6);
  });

  it('should allow constructing and using PlaybookExecutor via barrel', () => {
    const executor = new playbooksModule.PlaybookExecutor();
    const sessions = executor.listSessions();
    expect(sessions).toEqual([]);
  });
});
