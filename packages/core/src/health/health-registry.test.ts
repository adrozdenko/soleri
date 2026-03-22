import { describe, it, expect, vi } from 'vitest';
import { HealthRegistry, withDegradation } from './health-registry.js';

describe('HealthRegistry', () => {
  it('registers a subsystem with default healthy status', () => {
    const reg = new HealthRegistry();
    reg.register('vault');
    const sub = reg.get('vault');
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('healthy');
    expect(sub!.failureCount).toBe(0);
    expect(sub!.lastError).toBeNull();
  });

  it('ignores duplicate registration (does not reset)', () => {
    const reg = new HealthRegistry();
    reg.register('vault', 'healthy');
    reg.update('vault', 'degraded', 'err');
    reg.register('vault');
    expect(reg.get('vault')!.status).toBe('degraded');
  });

  it('tracks transitions: healthy -> degraded -> healthy', () => {
    const reg = new HealthRegistry();
    reg.register('svc');
    reg.update('svc', 'degraded', 'timeout');
    expect(reg.get('svc')!.status).toBe('degraded');
    expect(reg.get('svc')!.failureCount).toBe(1);
    expect(reg.get('svc')!.lastError).toBe('timeout');

    reg.update('svc', 'healthy');
    expect(reg.get('svc')!.failureCount).toBe(0);
    expect(reg.get('svc')!.lastError).toBeNull();
    expect(reg.get('svc')!.lastHealthyAt).toBeGreaterThan(0);
  });

  it('auto-registers on update if not previously registered', () => {
    const reg = new HealthRegistry();
    reg.update('new', 'degraded', 'oops');
    expect(reg.get('new')!.status).toBe('degraded');
  });

  it('computes overall: healthy, degraded, down', () => {
    const reg = new HealthRegistry();
    reg.register('a', 'healthy');
    reg.register('b', 'healthy');
    expect(reg.snapshot().overall).toBe('healthy');

    reg.update('b', 'degraded');
    expect(reg.snapshot().overall).toBe('degraded');

    reg.update('a', 'down');
    expect(reg.snapshot().overall).toBe('down');
  });

  it('fires status change listeners on transitions', () => {
    const reg = new HealthRegistry();
    reg.register('x');
    const changes: string[][] = [];
    reg.onStatusChange((name, prev, next) => changes.push([name, prev, next]));

    reg.update('x', 'degraded');
    reg.update('x', 'degraded'); // same status, no fire
    reg.update('x', 'down');
    reg.update('x', 'healthy');

    expect(changes).toEqual([
      ['x', 'healthy', 'degraded'],
      ['x', 'degraded', 'down'],
      ['x', 'down', 'healthy'],
    ]);
  });

  it('does not fire listener for same-status update', () => {
    const reg = new HealthRegistry();
    reg.register('llm', 'healthy');
    const listener = vi.fn();
    reg.onStatusChange(listener);
    reg.update('llm', 'healthy');
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires recovery hooks on transition to healthy', () => {
    const reg = new HealthRegistry();
    reg.register('ext', 'down');
    const hook = vi.fn();
    reg.onRecovery('ext', hook);
    reg.update('ext', 'healthy');
    expect(hook).toHaveBeenCalledWith('ext');
  });

  it('does not fire recovery hooks for non-recovery transitions', () => {
    const reg = new HealthRegistry();
    reg.register('ext', 'healthy');
    const hook = vi.fn();
    reg.onRecovery('ext', hook);
    reg.update('ext', 'degraded');
    reg.update('ext', 'down');
    expect(hook).not.toHaveBeenCalled();
  });

  it('snapshot returns defensive copies', () => {
    const reg = new HealthRegistry();
    reg.register('vault', 'healthy');
    const snap = reg.snapshot();
    snap.subsystems['vault'].status = 'down';
    expect(reg.get('vault')!.status).toBe('healthy');
  });

  it('listener errors do not crash the registry', () => {
    const reg = new HealthRegistry();
    reg.register('vault');
    reg.onStatusChange(() => {
      throw new Error('bad listener');
    });
    reg.update('vault', 'degraded');
    expect(reg.get('vault')!.status).toBe('degraded');
  });

  it('returns undefined for unregistered subsystem', () => {
    const reg = new HealthRegistry();
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  it('snapshot includes registeredAt timestamp', () => {
    const before = Date.now();
    const reg = new HealthRegistry();
    const snap = reg.snapshot();
    expect(snap.registeredAt).toBeGreaterThanOrEqual(before);
    expect(snap.registeredAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('withDegradation', () => {
  it('returns result on success and marks healthy', async () => {
    const reg = new HealthRegistry();
    reg.register('test', 'degraded');
    const result = await withDegradation(reg, 'test', async () => 42, 0);
    expect(result).toBe(42);
    expect(reg.get('test')!.status).toBe('healthy');
  });

  it('returns fallback on failure and marks degraded', async () => {
    const reg = new HealthRegistry();
    reg.register('test');
    const result = await withDegradation(
      reg,
      'test',
      async () => {
        throw new Error('boom');
      },
      'fallback',
    );
    expect(result).toBe('fallback');
    expect(reg.get('test')!.status).toBe('degraded');
    expect(reg.get('test')!.lastError).toBe('boom');
  });

  it('escalates to down on repeated failures', async () => {
    const reg = new HealthRegistry();
    reg.register('test');

    const fail = () =>
      withDegradation(reg, 'test', async () => { throw new Error('fail'); }, null);

    await fail();
    expect(reg.get('test')!.status).toBe('degraded');
    await fail();
    expect(reg.get('test')!.status).toBe('down');
  });

  it('handles non-Error thrown values', async () => {
    const reg = new HealthRegistry();
    reg.register('test');
    const result = await withDegradation(
      reg,
      'test',
      async () => {
        throw 'string error';
      },
      'default',
    );
    expect(result).toBe('default');
    expect(reg.get('test')!.lastError).toBe('string error');
  });
});
