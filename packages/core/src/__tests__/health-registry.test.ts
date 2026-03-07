import { describe, it, expect, vi } from 'vitest';
import { HealthRegistry, withDegradation } from '../health/health-registry.js';

describe('HealthRegistry', () => {
  it('registers subsystems with default healthy status', () => {
    const reg = new HealthRegistry();
    reg.register('vault');
    const sub = reg.get('vault');
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('healthy');
    expect(sub!.failureCount).toBe(0);
  });

  it('ignores duplicate registration', () => {
    const reg = new HealthRegistry();
    reg.register('vault', 'healthy');
    reg.update('vault', 'degraded', 'test');
    reg.register('vault'); // should NOT reset
    expect(reg.get('vault')!.status).toBe('degraded');
  });

  it('tracks status transitions', () => {
    const reg = new HealthRegistry();
    reg.register('cognee');
    reg.update('cognee', 'degraded', 'timeout');
    expect(reg.get('cognee')!.status).toBe('degraded');
    expect(reg.get('cognee')!.failureCount).toBe(1);
    expect(reg.get('cognee')!.lastError).toBe('timeout');

    reg.update('cognee', 'healthy');
    expect(reg.get('cognee')!.failureCount).toBe(0);
    expect(reg.get('cognee')!.lastError).toBeNull();
    expect(reg.get('cognee')!.lastHealthyAt).toBeGreaterThan(0);
  });

  it('auto-registers on update if not registered', () => {
    const reg = new HealthRegistry();
    reg.update('new-sub', 'degraded', 'oops');
    expect(reg.get('new-sub')!.status).toBe('degraded');
  });

  it('computes overall status', () => {
    const reg = new HealthRegistry();
    reg.register('a', 'healthy');
    reg.register('b', 'healthy');
    expect(reg.snapshot().overall).toBe('healthy');

    reg.update('b', 'degraded');
    expect(reg.snapshot().overall).toBe('degraded');

    reg.update('a', 'down');
    expect(reg.snapshot().overall).toBe('down');
  });

  it('fires status change listeners', () => {
    const reg = new HealthRegistry();
    reg.register('vault');
    const changes: Array<[string, string, string]> = [];
    reg.onStatusChange((name, prev, next) => {
      changes.push([name, prev, next]);
    });

    reg.update('vault', 'degraded');
    reg.update('vault', 'degraded'); // same status — no listener
    reg.update('vault', 'down');
    reg.update('vault', 'healthy');

    expect(changes).toEqual([
      ['vault', 'healthy', 'degraded'],
      ['vault', 'degraded', 'down'],
      ['vault', 'down', 'healthy'],
    ]);
  });

  it('does not fire listener for same status', () => {
    const reg = new HealthRegistry();
    reg.register('llm', 'healthy');
    const listener = vi.fn();
    reg.onStatusChange(listener);

    reg.update('llm', 'healthy');
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires recovery hooks when transitioning to healthy', () => {
    const reg = new HealthRegistry();
    reg.register('cognee', 'down');
    const hook = vi.fn();
    reg.onRecovery('cognee', hook);

    reg.update('cognee', 'healthy');
    expect(hook).toHaveBeenCalledWith('cognee');
  });

  it('does not fire recovery hooks for non-recovery transitions', () => {
    const reg = new HealthRegistry();
    reg.register('cognee', 'healthy');
    const hook = vi.fn();
    reg.onRecovery('cognee', hook);

    reg.update('cognee', 'degraded');
    reg.update('cognee', 'down');
    expect(hook).not.toHaveBeenCalled();
  });

  it('snapshot returns copies', () => {
    const reg = new HealthRegistry();
    reg.register('vault', 'healthy');
    const snap = reg.snapshot();
    snap.subsystems['vault'].status = 'down'; // mutate copy
    expect(reg.get('vault')!.status).toBe('healthy'); // original unchanged
  });

  it('listener errors do not crash the registry', () => {
    const reg = new HealthRegistry();
    reg.register('vault');
    reg.onStatusChange(() => {
      throw new Error('bad listener');
    });
    // Should not throw
    reg.update('vault', 'degraded');
    expect(reg.get('vault')!.status).toBe('degraded');
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
      withDegradation(
        reg,
        'test',
        async () => {
          throw new Error('fail');
        },
        null,
      );

    await fail(); // healthy → degraded
    expect(reg.get('test')!.status).toBe('degraded');

    await fail(); // degraded → down
    expect(reg.get('test')!.status).toBe('down');
  });
});
