/**
 * Multi-consumer async stream that replays from a buffer.
 * Source executes exactly once — new iterators replay from buffer[0].
 */
export class ReplayableStream<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private source: AsyncIterator<T>;
  private done = false;
  private error: unknown = undefined;
  private waiters: Array<{
    resolve: (result: IteratorResult<T, undefined>) => void;
    reject: (err: unknown) => void;
  }> = [];
  private advancing = false;

  constructor(source: AsyncIterable<T>) {
    this.source = source[Symbol.asyncIterator]();
  }

  private async advance(): Promise<void> {
    if (this.advancing || this.done) return;
    this.advancing = true;
    try {
      const result = await this.source.next();
      if (result.done) {
        this.done = true;
        for (const waiter of this.waiters) {
          waiter.resolve({ value: undefined, done: true });
        }
        this.waiters.length = 0;
      } else {
        this.buffer.push(result.value);
        for (const waiter of this.waiters) {
          waiter.resolve({ value: result.value, done: false });
        }
        this.waiters.length = 0;
      }
    } catch (err) {
      this.done = true;
      this.error = err;
      for (const waiter of this.waiters) {
        waiter.reject(err);
      }
      this.waiters.length = 0;
    } finally {
      this.advancing = false;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    let index = 0;
    return {
      next: async (): Promise<IteratorResult<T>> => {
        if (index < this.buffer.length) {
          return { value: this.buffer[index++], done: false };
        }
        if (this.done) {
          if (this.error) throw this.error;
          return { value: undefined, done: true };
        }
        // Need to advance the source
        return new Promise<IteratorResult<T, undefined>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
          if (!this.advancing) {
            this.advance().catch(() => {
              // Error already propagated to waiters via reject
            });
          }
        }).then((result) => {
          if (!result.done) index++;
          return result;
        });
      },
    };
  }

  async collect(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }

  get isDone(): boolean {
    return this.done;
  }
}
