/**
 * The React layer.
 *
 * Three hooks, each ~30 - 60 LOC:
 *   - `useIDB`         : connection status
 *   - `useIDBQuery`    : reactive read driven by a user fn + an explicit
 *                        list of stores it depends on
 *   - `useIDBMutation` : write with idle/pending/success/error status
 *
 * This file is the only one allowed to import React or `shim.ts`. It does
 * not import IDB directly - everything goes through the `Database<S>`
 * `INTERNAL` slot that `db.ts` populated.
 */

import * as React from "react";
import { useSyncExternalStore } from "./shim";
import {
  INTERNAL,
  type ConnectionStatus,
  type Database,
  type MutationOp,
  type MutationStatus,
  type QueryStatus,
  type SchemaLike,
  type StoreName,
} from "./types";

// ---------- useIDB ---------------------------------------------------------

interface UseIDBResult {
  status: ConnectionStatus;
  error?: Error;
}

const SSR_STATUS: UseIDBResult = { status: "loading" };

/**
 * Returns the current connection status of `db`. The hook also kicks the
 * connection open lazily on the client; on the server it returns
 * `{ status: "loading" }`.
 */
export function useIDB<S extends SchemaLike<S>>(db: Database<S>): UseIDBResult {
  const internal = db[INTERNAL];

  const subscribe = React.useCallback(
    (cb: () => void) => internal.subscribeStatus(cb),
    [internal],
  );

  // Status is a small mutable object; we cache the last snapshot so
  // useSyncExternalStore can do a proper Object.is check.
  const lastRef = React.useRef<UseIDBResult | null>(null);
  const getSnapshot = React.useCallback((): UseIDBResult => {
    const next = internal.getStatus();
    const prev = lastRef.current;
    if (
      prev &&
      prev.status === next.status &&
      prev.error === next.error
    ) {
      return prev;
    }
    lastRef.current = next;
    return next;
  }, [internal]);

  const getServerSnapshot = React.useCallback(() => SSR_STATUS, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Trigger a lazy open on first mount. Errors flow through getStatus().
  React.useEffect(() => {
    if (snapshot.status === "unsupported") return;
    void internal.getConnection().catch(() => {
    });
  }, [internal, snapshot.status]);

  return snapshot;
}

// ---------- useIDBQuery ----------------------------------------------------

interface UseIDBQueryResult<T> {
  data: T | undefined;
  status: QueryStatus;
  error?: Error;
}

/**
 * Reactive read.
 *
 * `fn` runs once on mount and again whenever any of `stores` is invalidated
 * (locally by `useIDBMutation` or remotely by another tab). It receives the
 * `Database<S>` itself, so calls like `db.get(...)`, `db.getAll(...)`, and
 * `db.byIndex(...)` are inferred from your schema.
 *
 * `stores` is the explicit dependency list - the hook does not auto-track
 * which stores the body touches. This is a deliberate trade-off: zero magic,
 * no Proxy, no instrumentation, and the dep list is right there in code
 * review.
 */
export function useIDBQuery<S extends SchemaLike<S>, T>(
  db: Database<S>,
  fn: (db: Database<S>) => Promise<T>,
  stores: ReadonlyArray<StoreName<S>>,
): UseIDBQueryResult<T> {
  const internal = db[INTERNAL];

  // Stabilize the dep list by content so subscribe is stable across
  // renders even when the caller passes a fresh array literal.
  const storesKey = stores.join("\u0000");

  const stableStores = React.useMemo(() => stores.slice(), [storesKey]);

  // We drive re-runs via a numeric version snapshot. Each notify on any
  // of `stableStores` bumps `versionRef`; useSyncExternalStore picks up
  // the change via Object.is on a primitive number.
  const versionRef = React.useRef(0);
  const subscribe = React.useCallback(
    (cb: () => void) =>
      internal.subscribeStores(stableStores, () => {
        versionRef.current += 1;
        cb();
      }),
    [internal, stableStores],
  );
  const getSnapshot = React.useCallback(() => versionRef.current, []);
  const getServerSnapshot = React.useCallback(() => 0, []);
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep the latest fn in a ref so the run-effect re-fires only when
  // `db` or `version` changes, not on every render.
  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  const [state, setState] = React.useState<UseIDBQueryResult<T>>(() => ({
    data: undefined,
    status: "loading",
  }));

  React.useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev.status === "loading" ? prev : { ...prev, status: "loading" }));
    fnRef
      .current(db)
      .then((data) => {
        if (!cancelled) setState({ data, status: "success" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: undefined,
          status: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [db, version]);

  return state;
}

// ---------- useIDBMutation -------------------------------------------------

interface UseIDBMutationResult<S, N extends StoreName<S>> {
  mutate: (op: MutationOp<S, N>) => Promise<void>;
  status: MutationStatus;
  error?: Error;
}

/**
 * Write to a single object store. `mutate` resolves after the IDB
 * transaction commits and the local + cross-tab invalidations have fired.
 * The returned promise rejects with a typed error on failure.
 */
export function useIDBMutation<S extends SchemaLike<S>, N extends StoreName<S>>(
  db: Database<S>,
  store: N,
): UseIDBMutationResult<S, N> {
  const internal = db[INTERNAL];

  const [state, setState] = React.useState<{ status: MutationStatus; error?: Error }>(
    () => ({ status: "idle" }),
  );

  // Track mounted state so we don't setState after unmount.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = React.useCallback(
    async (op: MutationOp<S, N>) => {
      if (mountedRef.current) setState({ status: "pending" });
      try {
        await internal.mutate(store, op);
        if (mountedRef.current) setState({ status: "success" });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (mountedRef.current) setState({ status: "error", error });
        throw error;
      }
    },
    [internal, store],
  );

  return { mutate, status: state.status, ...(state.error ? { error: state.error } : {}) };
}
