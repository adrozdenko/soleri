/**
 * Typed Event Bus — generic event emitter for decoupled subsystem communication.
 *
 * Wraps Node EventEmitter with type-safe emit/subscribe.
 * Any module can define its own event map and create a bus.
 */

import { EventEmitter } from 'node:events';

/**
 * Create a typed event bus.
 *
 * Usage:
 * ```ts
 * type MyEvents = {
 *   'entry:created': { id: string; title: string };
 *   'entry:deleted': { id: string };
 * };
 * const bus = new TypedEventBus<MyEvents>();
 * bus.on('entry:created', (payload) => console.log(payload.title));
 * bus.emit('entry:created', { id: '1', title: 'Hello' });
 * ```
 */
export class TypedEventBus<TEvents extends Record<string, unknown>> {
  private emitter = new EventEmitter();

  on<E extends keyof TEvents & string>(event: E, listener: (payload: TEvents[E]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<E extends keyof TEvents & string>(event: E, listener: (payload: TEvents[E]) => void): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<E extends keyof TEvents & string>(event: E, listener: (payload: TEvents[E]) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<E extends keyof TEvents & string>(event: E, payload: TEvents[E]): boolean {
    return this.emitter.emit(event, payload);
  }

  listenerCount(): number {
    let total = 0;
    for (const name of this.emitter.eventNames()) {
      total += this.emitter.listenerCount(name);
    }
    return total;
  }

  removeAllListeners(): this {
    this.emitter.removeAllListeners();
    return this;
  }
}
