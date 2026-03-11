/**
 * Deprecation utility tests.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  deprecationWarning,
  wrapDeprecated,
  resetDeprecationWarnings,
} from '../runtime/deprecation.js';

describe('deprecation utilities', () => {
  beforeEach(() => {
    resetDeprecationWarnings();
    vi.restoreAllMocks();
  });

  test('logs deprecation warning to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('old_op');
    expect(spy.mock.calls[0][0]).toContain('deprecated since v2.5.0');
  });

  test('includes replacement in warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'old_op', since: '2.5.0', replacement: 'new_op' });
    expect(spy.mock.calls[0][0]).toContain('new_op');
  });

  test('includes removeIn in warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'old_op', since: '2.5.0', removeIn: '3.0.0' });
    expect(spy.mock.calls[0][0]).toContain('v3.0.0');
  });

  test('warns only once per op', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    expect(spy).toHaveBeenCalledOnce();
  });

  test('warns separately for different ops', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'op_a', since: '2.5.0' });
    deprecationWarning({ name: 'op_b', since: '2.5.0' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('resetDeprecationWarnings clears warned set', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    resetDeprecationWarnings();
    deprecationWarning({ name: 'old_op', since: '2.5.0' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('wrapDeprecated calls original function and warns', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = (x: number) => x * 2;
    const wrapped = wrapDeprecated(original, { name: 'double', since: '2.5.0' });
    const result = wrapped(5);
    expect(result).toBe(10);
    expect(spy).toHaveBeenCalledOnce();
  });

  test('wrapDeprecated warns only once across calls', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapped = wrapDeprecated((x: number) => x, { name: 'identity', since: '2.5.0' });
    wrapped(1);
    wrapped(2);
    wrapped(3);
    expect(spy).toHaveBeenCalledOnce();
  });
});
