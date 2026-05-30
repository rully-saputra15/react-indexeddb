/**
 * Vendored `useSyncExternalStore` shim.
 *
 * - On React 18+, re-exports the native `useSyncExternalStore` directly.
 * - On React 16.8 / 17, falls back to a small `useState` + `useEffect`
 *   implementation that is correct for stable snapshots (which is the
 *   contract our store layer guarantees).
 *
 * This file is the ONLY place in the library that selects between native
 * and fallback. Hooks in `hooks.ts` import `useSyncExternalStore` from here.
 *
 * Adapted under the MIT License from React's `use-sync-external-store`
 * package (Copyright (c) Meta Platforms, Inc. and affiliates).
 */

import * as React from "react";

type Subscribe = (onStoreChange: () => void) => () => void;
type GetSnapshot<T> = () => T;

const NATIVE = (React as unknown as { useSyncExternalStore?: unknown })
  .useSyncExternalStore as
  | (<T>(subscribe: Subscribe, getSnapshot: GetSnapshot<T>, getServerSnapshot?: GetSnapshot<T>) => T)
  | undefined;

function useSyncExternalStoreFallback<T>(
  subscribe: Subscribe,
  getSnapshot: GetSnapshot<T>,
  getServerSnapshot?: GetSnapshot<T>,
): T {
  const isServer = typeof window === "undefined";
  const initial =
    isServer && getServerSnapshot ? getServerSnapshot() : getSnapshot();

  const [snapshot, setSnapshot] = React.useState<T>(initial);

  const getSnapshotRef = React.useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;

  React.useEffect(() => {
    const sync = () => {
      const next = getSnapshotRef.current();
      setSnapshot((prev) => (Object.is(prev, next) ? prev : next));
    };
    sync();
    return subscribe(sync);
  }, [subscribe]);

  return snapshot;
}

export const useSyncExternalStore: <T>(
  subscribe: Subscribe,
  getSnapshot: GetSnapshot<T>,
  getServerSnapshot?: GetSnapshot<T>,
) => T = NATIVE ?? useSyncExternalStoreFallback;
