import { describe, it, expect } from 'vitest';
import { ContextHealthMonitor } from './context-health.js';

describe('ContextHealthMonitor', () => {
  it('should return green status when fresh', () => {
    const monitor = new ContextHealthMonitor();
    const status = monitor.check();

    expect(status.level).toBe('green');
    expect(status.estimatedFill).toBe(0);
    expect(status.toolCallCount).toBe(0);
    expect(status.estimatedTokens).toBe(0);
    expect(status.recommendation).toBe('Context usage is healthy. No action needed.');
  });

  it('should return yellow after ~80K tokens worth of events', () => {
    const monitor = new ContextHealthMonitor();

    // 80K tokens / 1.5 overhead = ~53333 payload bytes needed
    // Use 100 calls with ~534 bytes each
    for (let i = 0; i < 100; i++) {
      monitor.track({ type: 'tool_call', payloadSize: 534 });
    }

    const status = monitor.check();
    expect(status.level).toBe('yellow');
    expect(status.estimatedFill).toBeGreaterThanOrEqual(0.4);
    expect(status.estimatedFill).toBeLessThan(0.6);
    expect(status.toolCallCount).toBe(100);
    expect(status.recommendation).toBe('Consider compacting context soon.');
  });

  it('should return red after ~120K tokens worth of events', () => {
    const monitor = new ContextHealthMonitor();

    // 120K tokens / 1.5 overhead = 80000 payload bytes needed
    // Use 200 calls with 400 bytes each = 80000 total
    for (let i = 0; i < 200; i++) {
      monitor.track({ type: 'tool_call', payloadSize: 400 });
    }

    const status = monitor.check();
    expect(status.level).toBe('red');
    expect(status.estimatedFill).toBeGreaterThanOrEqual(0.6);
    expect(status.toolCallCount).toBe(200);
    expect(status.recommendation).toBe('Session capture recommended before context degradation.');
  });

  it('should reset all tracking', () => {
    const monitor = new ContextHealthMonitor();

    for (let i = 0; i < 200; i++) {
      monitor.track({ type: 'tool_call', payloadSize: 400 });
    }
    expect(monitor.check().level).toBe('red');

    monitor.reset();
    const status = monitor.check();

    expect(status.level).toBe('green');
    expect(status.toolCallCount).toBe(0);
    expect(status.estimatedTokens).toBe(0);
    expect(status.estimatedFill).toBe(0);
  });

  it('should cap estimatedFill at 1.0', () => {
    const monitor = new ContextHealthMonitor();

    // Way over the limit: 500K payload * 1.5 = 750K tokens
    monitor.track({ type: 'huge_call', payloadSize: 500_000 });

    const status = monitor.check();
    expect(status.level).toBe('red');
    expect(status.estimatedFill).toBe(1.0);
  });
});
