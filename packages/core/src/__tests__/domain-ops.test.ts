import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAgentRuntime } from '../runtime/runtime.js';
import { createDomainFacade, createDomainFacades } from '../runtime/domain-ops.js';
import type { AgentRuntime } from '../runtime/types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

describe('createDomainFacade', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({
      agentId: 'test-domain',
      vaultPath: ':memory:',
    });
  });

  afterEach(() => {
    runtime.close();
  });

  it('should create facade with correct name', () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    expect(facade.name).toBe('test-domain_security');
  });

  it('should create facade with 5 ops', () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    expect(facade.ops.length).toBe(5);
    const names = facade.ops.map((o) => o.name);
    expect(names).toContain('get_patterns');
    expect(names).toContain('search');
    expect(names).toContain('get_entry');
    expect(names).toContain('capture');
    expect(names).toContain('remove');
  });

  it('should handle kebab-case domain names', () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'api-design');
    expect(facade.name).toBe('test-domain_api_design');
  });

  it('get_patterns should scope to domain', async () => {
    runtime.vault.seed([
      {
        id: 'sec-1',
        type: 'pattern',
        domain: 'security',
        title: 'Auth',
        severity: 'warning',
        description: 'Auth.',
        tags: ['auth'],
      },
      {
        id: 'api-1',
        type: 'pattern',
        domain: 'api-design',
        title: 'REST',
        severity: 'warning',
        description: 'REST.',
        tags: ['rest'],
      },
    ]);
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const op = facade.ops.find((o) => o.name === 'get_patterns')!;
    const results = (await op.handler({})) as IntelligenceEntry[];
    expect(results.every((e) => e.domain === 'security')).toBe(true);
  });

  it('capture should add entry with correct domain', async () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const captureOp = facade.ops.find((o) => o.name === 'capture')!;
    await captureOp.handler({
      id: 'cap-1',
      type: 'pattern',
      title: 'Captured Pattern',
      severity: 'warning',
      description: 'Test capture.',
      tags: ['test'],
    });
    const entry = runtime.vault.get('cap-1');
    expect(entry).not.toBeNull();
    expect(entry!.domain).toBe('security');
  });

  it('remove should delete entry', async () => {
    runtime.vault.seed([
      {
        id: 'rm-1',
        type: 'pattern',
        domain: 'security',
        title: 'Remove me',
        severity: 'warning',
        description: 'Remove.',
        tags: ['test'],
      },
    ]);
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const removeOp = facade.ops.find((o) => o.name === 'remove')!;
    const result = (await removeOp.handler({ id: 'rm-1' })) as { removed: boolean };
    expect(result.removed).toBe(true);
    expect(runtime.vault.get('rm-1')).toBeNull();
  });

  it('capture should include governance action on default (moderate) preset', async () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const captureOp = facade.ops.find((o) => o.name === 'capture')!;
    const result = (await captureOp.handler({
      id: 'gov-cap-1',
      type: 'pattern',
      title: 'Governed Pattern',
      severity: 'warning',
      description: 'Test governance capture.',
      tags: ['gov'],
    })) as { captured: boolean; governance: { action: string } };
    expect(result.captured).toBe(true);
    expect(result.governance.action).toBe('capture');
    expect(runtime.vault.get('gov-cap-1')).not.toBeNull();
  });

  it('capture should create proposal under strict preset', async () => {
    runtime.governance.applyPreset('.', 'strict', 'test');
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const captureOp = facade.ops.find((o) => o.name === 'capture')!;
    const result = (await captureOp.handler({
      id: 'gov-prop-1',
      type: 'pattern',
      title: 'Needs Review',
      severity: 'warning',
      description: 'Should be proposed.',
      tags: ['gov'],
    })) as {
      captured: boolean;
      governance: { action: string; proposalId: number; reason?: string };
    };
    expect(result.captured).toBe(false);
    expect(result.governance.action).toBe('propose');
    expect(result.governance.proposalId).toBeGreaterThan(0);
    // Entry should NOT be in vault
    expect(runtime.vault.get('gov-prop-1')).toBeNull();
  });

  it('capture should reject when total quota exceeded', async () => {
    runtime.governance.setPolicy('.', 'quota', { maxEntriesTotal: 1 }, 'test');
    runtime.vault.seed([
      {
        id: 'existing-1',
        type: 'pattern',
        domain: 'security',
        title: 'Existing',
        severity: 'warning',
        description: 'Takes the slot.',
        tags: ['fill'],
      },
    ]);
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const captureOp = facade.ops.find((o) => o.name === 'capture')!;
    const result = (await captureOp.handler({
      id: 'gov-rej-1',
      type: 'pattern',
      title: 'Over Quota',
      severity: 'warning',
      description: 'Should be rejected.',
      tags: ['gov'],
    })) as { captured: boolean; governance: { action: string; reason?: string } };
    expect(result.captured).toBe(false);
    expect(result.governance.action).toBe('reject');
    expect(runtime.vault.get('gov-rej-1')).toBeNull();
  });

  it('get_entry should return specific entry', async () => {
    runtime.vault.seed([
      {
        id: 'ge-1',
        type: 'pattern',
        domain: 'security',
        title: 'Get me',
        severity: 'warning',
        description: 'Get.',
        tags: ['test'],
      },
    ]);
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const getOp = facade.ops.find((o) => o.name === 'get_entry')!;
    const result = (await getOp.handler({ id: 'ge-1' })) as IntelligenceEntry;
    expect(result.id).toBe('ge-1');
  });

  it('get_entry should return error for missing entry', async () => {
    const facade = createDomainFacade(runtime, 'test-domain', 'security');
    const getOp = facade.ops.find((o) => o.name === 'get_entry')!;
    const result = (await getOp.handler({ id: 'nope' })) as { error: string };
    expect(result.error).toBeDefined();
  });
});

describe('createDomainFacades', () => {
  let runtime: AgentRuntime;

  beforeEach(() => {
    runtime = createAgentRuntime({
      agentId: 'test-multi',
      vaultPath: ':memory:',
    });
  });

  afterEach(() => {
    runtime.close();
  });

  it('should create one facade per domain', () => {
    const facades = createDomainFacades(runtime, 'test-multi', [
      'security',
      'api-design',
      'testing',
    ]);
    expect(facades.length).toBe(3);
    expect(facades[0].name).toBe('test-multi_security');
    expect(facades[1].name).toBe('test-multi_api_design');
    expect(facades[2].name).toBe('test-multi_testing');
  });

  it('should return empty array for no domains', () => {
    const facades = createDomainFacades(runtime, 'test-multi', []);
    expect(facades.length).toBe(0);
  });
});
