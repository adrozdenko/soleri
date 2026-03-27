/**
 * RuntimeAdapterRegistry — simple Map-backed registry for runtime adapters.
 *
 * Adapters register at engine startup. No dynamic loading.
 */

import type { RuntimeAdapter } from './types.js';

export class RuntimeAdapterRegistry {
  private readonly adapters = new Map<string, RuntimeAdapter>();
  private defaultType: string | undefined;

  /** Register an adapter. Throws if the type is already registered. */
  register(type: string, adapter: RuntimeAdapter): void {
    if (this.adapters.has(type)) {
      throw new Error(`RuntimeAdapterRegistry: adapter type "${type}" is already registered.`);
    }
    this.adapters.set(type, adapter);
  }

  /** Get an adapter by type. Throws if not found. */
  get(type: string): RuntimeAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      const available = this.list().join(', ') || '(none)';
      throw new Error(
        `RuntimeAdapterRegistry: unknown adapter type "${type}". Registered: ${available}`,
      );
    }
    return adapter;
  }

  /** List all registered adapter type strings. */
  list(): string[] {
    return [...this.adapters.keys()];
  }

  /** Set the default adapter type. Throws if the type is not registered. */
  setDefault(type: string): void {
    if (!this.adapters.has(type)) {
      throw new Error(`RuntimeAdapterRegistry: cannot set default to unregistered type "${type}".`);
    }
    this.defaultType = type;
  }

  /** Get the default adapter. Throws if no default is set. */
  getDefault(): RuntimeAdapter {
    if (!this.defaultType) {
      throw new Error('RuntimeAdapterRegistry: no default adapter has been set.');
    }
    return this.get(this.defaultType);
  }
}
