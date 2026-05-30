import * as React from "react";
import { render } from "@testing-library/react";
import { INTERNAL } from "../src/types";

let counter = 0;
export const uniqueDbName = (prefix = "test"): string => `${prefix}-${++counter}-${Date.now()}`;

/**
 * Cross-version `renderHook`. `@testing-library/react` only exposed `renderHook`
 * starting at v13; the v12 line we have to use on the React 16/17 CI matrix
 * cells does not. This polyfill is small enough that owning it is cheaper than
 * version-conditional imports.
 */
export interface RenderHookResult<T, P> {
  result: { current: T };
  rerender: (newProps?: P) => void;
  unmount: () => void;
}

export function renderHook<T, P = void>(
  callback: (props: P) => T,
  options?: { initialProps?: P },
): RenderHookResult<T, P> {
  const result: { current: T } = { current: undefined as unknown as T };
  let currentProps = options?.initialProps as P;

  const TestComponent: React.FC<{ hookProps: P }> = ({ hookProps }) => {
    result.current = callback(hookProps);
    return null;
  };

  const utils = render(React.createElement(TestComponent, { hookProps: currentProps }));

  return {
    result,
    rerender: (newProps?: P) => {
      currentProps = (newProps ?? currentProps) as P;
      utils.rerender(React.createElement(TestComponent, { hookProps: currentProps }));
    },
    unmount: () => utils.unmount(),
  };
}

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
