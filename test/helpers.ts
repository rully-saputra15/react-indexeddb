import { INTERNAL } from "../src/types";

let counter = 0;
export const uniqueDbName = (prefix = "test"): string => `${prefix}-${++counter}-${Date.now()}`;

export const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

export const waitFor = async <T>(
  fn: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  { timeout = 1000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<T> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitFor: predicate did not become true within ${timeout}ms`);
};

export const closeDb = (db: { readonly [INTERNAL]: { close: () => void } }): void => {
  db[INTERNAL].close();
};
