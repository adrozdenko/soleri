import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PackLifecycleManager } from '../../packs/pack-lifecycle.js';
import { VALID_TRANSITIONS } from '../../packs/types.js';
import type { PackState } from '../../packs/types.js';

// =============================================================================
// HELPERS
// =============================================================================

let manager: PackLifecycleManager;

beforeEach(() => {
  manager = new PackLifecycleManager();
});

// =============================================================================
// VALID TRANSITIONS
// =============================================================================

describe('PackLifecycleManager — valid transitions', () => {
  it('installed → ready', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');
    expect(manager.getState('p1')).toBe('ready');
  });

  it('installed → error', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'error', 'activation failed');
    expect(manager.getState('p1')).toBe('error');
  });

  it('installed → uninstalled', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'uninstalled');
    expect(manager.getState('p1')).toBe('uninstalled');
  });

  it('ready → ready (self-transition)', () => {
    manager.initState('p1', 'ready');
    manager.transition('p1', 'ready', 'reloaded');
    expect(manager.getState('p1')).toBe('ready');
  });

  it('ready → disabled', () => {
    manager.initState('p1', 'ready');
    manager.transition('p1', 'disabled');
    expect(manager.getState('p1')).toBe('disabled');
  });

  it('ready → error', () => {
    manager.initState('p1', 'ready');
    manager.transition('p1', 'error', 'runtime failure');
    expect(manager.getState('p1')).toBe('error');
  });

  it('ready → upgrade_pending', () => {
    manager.initState('p1', 'ready');
    manager.transition('p1', 'upgrade_pending');
    expect(manager.getState('p1')).toBe('upgrade_pending');
  });

  it('ready → uninstalled', () => {
    manager.initState('p1', 'ready');
    manager.transition('p1', 'uninstalled');
    expect(manager.getState('p1')).toBe('uninstalled');
  });

  it('disabled → ready', () => {
    manager.initState('p1', 'disabled');
    manager.transition('p1', 'ready');
    expect(manager.getState('p1')).toBe('ready');
  });

  it('disabled → uninstalled', () => {
    manager.initState('p1', 'disabled');
    manager.transition('p1', 'uninstalled');
    expect(manager.getState('p1')).toBe('uninstalled');
  });

  it('error → ready', () => {
    manager.initState('p1', 'error');
    manager.transition('p1', 'ready', 'retry succeeded');
    expect(manager.getState('p1')).toBe('ready');
  });

  it('error → uninstalled', () => {
    manager.initState('p1', 'error');
    manager.transition('p1', 'uninstalled');
    expect(manager.getState('p1')).toBe('uninstalled');
  });

  it('upgrade_pending → ready', () => {
    manager.initState('p1', 'upgrade_pending');
    manager.transition('p1', 'ready', 'upgrade complete');
    expect(manager.getState('p1')).toBe('ready');
  });

  it('upgrade_pending → error', () => {
    manager.initState('p1', 'upgrade_pending');
    manager.transition('p1', 'error', 'upgrade failed');
    expect(manager.getState('p1')).toBe('error');
  });

  it('upgrade_pending → uninstalled', () => {
    manager.initState('p1', 'upgrade_pending');
    manager.transition('p1', 'uninstalled');
    expect(manager.getState('p1')).toBe('uninstalled');
  });

  it('uninstalled → installed', () => {
    manager.initState('p1', 'uninstalled');
    manager.transition('p1', 'installed', 'reinstalled');
    expect(manager.getState('p1')).toBe('installed');
  });
});

// =============================================================================
// INVALID TRANSITIONS
// =============================================================================

describe('PackLifecycleManager — invalid transitions', () => {
  it('installed → disabled throws', () => {
    manager.initState('p1', 'installed');
    expect(() => manager.transition('p1', 'disabled')).toThrow();
  });

  it('disabled → error throws', () => {
    manager.initState('p1', 'disabled');
    expect(() => manager.transition('p1', 'error')).toThrow();
  });

  it('uninstalled → ready throws', () => {
    manager.initState('p1', 'uninstalled');
    expect(() => manager.transition('p1', 'ready')).toThrow();
  });

  it('error → disabled throws', () => {
    manager.initState('p1', 'error');
    expect(() => manager.transition('p1', 'disabled')).toThrow();
  });

  it('error message includes current state, target, and valid targets', () => {
    manager.initState('p1', 'installed');
    try {
      manager.transition('p1', 'disabled');
      expect.unreachable('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('installed');
      expect(msg).toContain('disabled');
      // Valid targets from 'installed' are: ready, error, uninstalled
      expect(msg).toContain('ready');
      expect(msg).toContain('error');
      expect(msg).toContain('uninstalled');
    }
  });

  it('transition on untracked pack throws', () => {
    expect(() => manager.transition('ghost', 'ready')).toThrow("Pack 'ghost' is not being tracked");
  });

  it('installed → upgrade_pending throws', () => {
    manager.initState('p1', 'installed');
    expect(() => manager.transition('p1', 'upgrade_pending')).toThrow();
  });
});

// =============================================================================
// CORE BEHAVIOR
// =============================================================================

describe('PackLifecycleManager — core behavior', () => {
  it('initState() sets state without validation', () => {
    // initState should accept any state without checking transitions
    manager.initState('p1', 'error');
    expect(manager.getState('p1')).toBe('error');
  });

  it('initState() overwrites existing state without validation', () => {
    manager.initState('p1', 'installed');
    manager.initState('p1', 'ready');
    expect(manager.getState('p1')).toBe('ready');
    // Transitions should be reset since initState creates a fresh entry
    expect(manager.getTransitions('p1')).toEqual([]);
  });

  it('getState() returns undefined for unknown pack', () => {
    expect(manager.getState('nonexistent')).toBeUndefined();
  });

  it('getState() returns correct state after transition', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');
    manager.transition('p1', 'disabled');
    expect(manager.getState('p1')).toBe('disabled');
  });

  it('getTransitions() returns empty array for new pack', () => {
    manager.initState('p1', 'installed');
    expect(manager.getTransitions('p1')).toEqual([]);
  });

  it('getTransitions() returns empty array for unknown pack', () => {
    expect(manager.getTransitions('ghost')).toEqual([]);
  });

  it('getTransitions() records all transitions with timestamps', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready', 'activated');
    manager.transition('p1', 'disabled', 'user disabled');
    manager.transition('p1', 'ready', 're-enabled');

    const transitions = manager.getTransitions('p1');
    expect(transitions).toHaveLength(3);

    expect(transitions[0].from).toBe('installed');
    expect(transitions[0].to).toBe('ready');
    expect(transitions[0].reason).toBe('activated');
    expect(typeof transitions[0].timestamp).toBe('number');

    expect(transitions[1].from).toBe('ready');
    expect(transitions[1].to).toBe('disabled');
    expect(transitions[1].reason).toBe('user disabled');

    expect(transitions[2].from).toBe('disabled');
    expect(transitions[2].to).toBe('ready');
    expect(transitions[2].reason).toBe('re-enabled');

    // Timestamps should be monotonically non-decreasing
    expect(transitions[1].timestamp).toBeGreaterThanOrEqual(transitions[0].timestamp);
    expect(transitions[2].timestamp).toBeGreaterThanOrEqual(transitions[1].timestamp);
  });

  it('onTransition() callback fires on every transition', () => {
    const listener = vi.fn();
    manager.onTransition(listener);
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready', 'activated');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('p1', 'installed', 'ready', 'activated');
  });

  it('onTransition() returns unsubscribe function that works', () => {
    const listener = vi.fn();
    const unsub = manager.onTransition(listener);

    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    manager.transition('p1', 'disabled');
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it('multiple listeners all fire', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    manager.onTransition(listener1);
    manager.onTransition(listener2);
    manager.onTransition(listener3);

    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener3).toHaveBeenCalledTimes(1);
  });

  it('remove() clears pack state', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');
    manager.remove('p1');

    expect(manager.getState('p1')).toBeUndefined();
    expect(manager.getTransitions('p1')).toEqual([]);
  });

  it('listAll() returns all tracked packs', () => {
    manager.initState('alpha', 'installed');
    manager.initState('beta', 'ready');
    manager.initState('gamma', 'disabled');

    const all = manager.listAll();
    expect(all).toHaveLength(3);
    expect(all).toEqual(
      expect.arrayContaining([
        { packId: 'alpha', state: 'installed' },
        { packId: 'beta', state: 'ready' },
        { packId: 'gamma', state: 'disabled' },
      ]),
    );
  });

  it('listAll() returns empty array when no packs tracked', () => {
    expect(manager.listAll()).toEqual([]);
  });

  it('reset() clears everything', () => {
    const listener = vi.fn();
    manager.onTransition(listener);

    manager.initState('p1', 'installed');
    manager.initState('p2', 'ready');
    manager.transition('p1', 'ready');

    manager.reset();

    expect(manager.listAll()).toEqual([]);
    expect(manager.getState('p1')).toBeUndefined();
    expect(manager.getState('p2')).toBeUndefined();

    // Listeners should be cleared too — re-init and transition should not fire old listener
    manager.initState('p3', 'installed');
    manager.transition('p3', 'ready');
    expect(listener).toHaveBeenCalledTimes(1); // only the pre-reset call
  });

  it('transition reason is optional', () => {
    manager.initState('p1', 'installed');
    manager.transition('p1', 'ready');

    const transitions = manager.getTransitions('p1');
    expect(transitions[0].reason).toBeUndefined();
  });
});

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

describe('PackLifecycleManager — backward compatibility', () => {
  it('PackState includes old PackStatus values (installed, error, uninstalled)', () => {
    // These are the three original PackStatus values — they must remain valid PackState values
    const oldStatuses: PackState[] = ['installed', 'error', 'uninstalled'];
    for (const status of oldStatuses) {
      manager.initState('test', status);
      expect(manager.getState('test')).toBe(status);
    }
  });

  it('VALID_TRANSITIONS is exported and has all 6 states as keys', () => {
    const expectedStates: PackState[] = [
      'installed',
      'ready',
      'disabled',
      'error',
      'upgrade_pending',
      'uninstalled',
    ];
    const keys = Object.keys(VALID_TRANSITIONS);
    expect(keys).toHaveLength(6);
    for (const state of expectedStates) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it('VALID_TRANSITIONS values are all valid PackState values', () => {
    const allStates: PackState[] = [
      'installed',
      'ready',
      'disabled',
      'error',
      'upgrade_pending',
      'uninstalled',
    ];
    for (const [_from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const target of targets) {
        expect(allStates).toContain(target);
      }
    }
  });
});
