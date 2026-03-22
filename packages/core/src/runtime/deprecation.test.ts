/**
 * Colocated unit tests for deprecation.ts — pure functions + console.warn spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deprecationWarning,
  wrapDeprecated,
  resetDeprecationWarnings,
  type DeprecationInfo,
} from './deprecation.js';

describe('deprecationWarning', () => {
  beforeEach(() => {
    resetDeprecationWarnings();
    vi.restoreAllMocks();
  });

  it('logs once per unique op name', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'x', since: '1.0.0' });
    deprecationWarning({ name: 'x', since: '1.0.0' });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('includes all provided fields in the message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info: DeprecationInfo = {
      name: 'old_op',
      since: '2.0.0',
      removeIn: '3.0.0',
      replacement: 'new_op',
      message: 'Migrate now.',
    };
    deprecationWarning(info);
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain('"old_op"');
    expect(msg).toContain('v2.0.0');
    expect(msg).toContain('v3.0.0');
    expect(msg).toContain('"new_op"');
    expect(msg).toContain('Migrate now.');
  });

  it('omits optional fields gracefully', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'minimal', since: '1.0.0' });
    const msg = spy.mock.calls[0][0] as string;
    expect(msg).toContain('"minimal"');
    expect(msg).not.toContain('Use');
    expect(msg).not.toContain('Will be removed');
  });
});

describe('wrapDeprecated', () => {
  beforeEach(() => {
    resetDeprecationWarnings();
    vi.restoreAllMocks();
  });

  it('preserves original function return value', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = (a: number, b: number) => a + b;
    const wrapped = wrapDeprecated(fn, { name: 'add', since: '1.0.0' });
    expect(wrapped(3, 4)).toBe(7);
  });

  it('emits warning on first call only', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapped = wrapDeprecated(() => 0, { name: 'noop', since: '1.0.0' });
    wrapped();
    wrapped();
    wrapped();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('passes through all arguments', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn();
    const wrapped = wrapDeprecated(fn, { name: 'multi', since: '1.0.0' });
    wrapped('a', 'b', 'c');
    expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
  });
});

describe('resetDeprecationWarnings', () => {
  beforeEach(() => {
    resetDeprecationWarnings();
    vi.restoreAllMocks();
  });

  it('allows the same op to warn again after reset', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'test_op', since: '1.0.0' });
    resetDeprecationWarnings();
    deprecationWarning({ name: 'test_op', since: '1.0.0' });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
