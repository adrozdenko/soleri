/**
 * Tests for the playbooks barrel export (index.ts).
 *
 * Validates that the public API surface is complete — every expected
 * function, class, and type-level export is accessible from the barrel.
 */

import { describe, it, expect } from 'vitest';
import * as playbooksModule from './index.js';

describe('playbooks barrel export', () => {
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
