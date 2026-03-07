/**
 * Input type that supports arbitrary nesting of sync/async values.
 */
export type NestableInput<T> =
  | T
  | T[]
  | Promise<T | T[]>
  | AsyncIterable<T>
  | Iterable<NestableInput<T>>;

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value
  );
}

function isSyncIterable<T>(value: unknown): value is Iterable<T> {
  return (
    value !== null && value !== undefined && typeof value === 'object' && Symbol.iterator in value
  );
}

/**
 * Recursively flatten nested async/sync inputs into a flat AsyncIterable<T>.
 * Discrimination: Promise → AsyncIterable → Iterable (excluding strings) → leaf T.
 */
export async function* normalize<T>(input: NestableInput<T>): AsyncIterable<T> {
  if (input instanceof Promise) {
    const resolved = await input;
    yield* normalize<T>(resolved as NestableInput<T>);
  } else if (isAsyncIterable<T>(input)) {
    for await (const item of input) {
      yield item;
    }
  } else if (typeof input !== 'string' && isSyncIterable<NestableInput<T>>(input)) {
    for (const item of input) {
      yield* normalize<T>(item);
    }
  } else {
    yield input as T;
  }
}

/**
 * Collect an AsyncIterable<T> into a Promise<T[]>.
 */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) {
    items.push(item);
  }
  return items;
}
