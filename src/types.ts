/**
 * Public type vocabulary for `react-idb-hooks`.
 *
 * This file is intentionally type-only. It MUST NOT contain runtime code,
 * import React, or import the IndexedDB API.
 */

/**
 * The shape a user provides to {@link defineIDB} to describe one object store.
 *
 * `value` is the runtime record type. `key` is the primary key type.
 * `indexes` maps user-friendly index names to the keyPath value type.
 */
export interface StoreSchema {
  value: unknown;
  key: IDBValidKey;
  indexes?: Record<string, IDBValidKey>;
}

/**
 * A schema is a record of store name -> {@link StoreSchema}.
 *
 * Example:
 *
 * ```ts
 * interface AppSchema {
 *   todos: { value: Todo; key: string; indexes: { byDone: 0 | 1 } };
 *   meta:  { value: number; key: "version" };
 * }
 * ```
 */
export type Schema = { [storeName: string]: StoreSchema };

/**
 * F-bounded helper used as the actual constraint on `defineIDB` and the
 * hooks. Plain object types and `interface`s without an index signature
 * do not satisfy `Record<string, StoreSchema>` directly, so we instead
 * require that every property of `S` extends `StoreSchema`. Equivalent
 * shape, friendlier to literal user types.
 */
export type SchemaLike<S> = { [K in keyof S]: StoreSchema };

/** All store names declared by the schema. */
export type StoreName<S> = keyof S & string;

/** The record type stored in store `N`. */
export type ValueOf<S, N extends StoreName<S>> = S[N] extends { value: infer V } ? V : never;

/** The primary-key type of store `N`. */
export type KeyOf<S, N extends StoreName<S>> = S[N] extends { key: infer K } ? K : IDBValidKey;

/** All index names declared on store `N` (or `never` if none). */
export type IndexNameOf<S, N extends StoreName<S>> = S[N] extends {
  indexes: infer I;
}
  ? keyof I & string
  : never;

/** The key type of an index on store `N`. */
export type IndexKeyOf<S, N extends StoreName<S>, I extends IndexNameOf<S, N>> = S[N] extends {
  indexes: infer Idx;
}
  ? I extends keyof Idx
    ? Idx[I] extends IDBValidKey
      ? Idx[I]
      : IDBValidKey
    : IDBValidKey
  : IDBValidKey;

/**
 * Status of a long-lived `Database` connection. Returned by `useIDB`.
 *
 * - `loading`     — initial open in flight (or SSR snapshot)
 * - `ready`       — open succeeded
 * - `error`       — open failed; see `error`
 * - `unsupported` — `indexedDB` is not available in this environment
 */
export type ConnectionStatus = "loading" | "ready" | "error" | "unsupported";

/** Status of a `useIDBQuery` read. */
export type QueryStatus = "loading" | "success" | "error";

/** Status of a `useIDBMutation` write. */
export type MutationStatus = "idle" | "pending" | "success" | "error";

/**
 * Operations a {@link Database} exposes for use inside `useIDBQuery`'s
 * read function. Each method is a thin, type-safe wrapper over IDB.
 */
export interface DatabaseQueryAPI<S> {
  get<N extends StoreName<S>>(store: N, key: KeyOf<S, N>): Promise<ValueOf<S, N> | undefined>;
  getAll<N extends StoreName<S>>(
    store: N,
    range?: IDBKeyRange | null,
    limit?: number,
  ): Promise<Array<ValueOf<S, N>>>;
  getAllKeys<N extends StoreName<S>>(
    store: N,
    range?: IDBKeyRange | null,
    limit?: number,
  ): Promise<Array<KeyOf<S, N>>>;
  count<N extends StoreName<S>>(store: N, range?: IDBKeyRange | null): Promise<number>;
  byIndex<N extends StoreName<S>, I extends IndexNameOf<S, N>>(
    store: N,
    index: I,
    key: IndexKeyOf<S, N, I>,
  ): Promise<ValueOf<S, N> | undefined>;
  byIndexAll<N extends StoreName<S>, I extends IndexNameOf<S, N>>(
    store: N,
    index: I,
    range?: IDBKeyRange | IndexKeyOf<S, N, I> | null,
    limit?: number,
  ): Promise<Array<ValueOf<S, N>>>;
}

/**
 * Discriminated union of all write operations supported by `useIDBMutation`.
 */
export type MutationOp<S, N extends StoreName<S>> =
  | { type: "put"; value: ValueOf<S, N>; key?: KeyOf<S, N> }
  | { type: "add"; value: ValueOf<S, N>; key?: KeyOf<S, N> }
  | { type: "delete"; key: KeyOf<S, N> }
  | { type: "clear" };

/**
 * Internal-shape symbol used by `Database` to expose its inner machinery to
 * the hooks layer without making it part of the public API.
 *
 * This keeps `db.ts` and `hooks.ts` decoupled at the type level: only `hooks.ts`
 * imports the `INTERNAL` symbol and reads through it.
 */
export const INTERNAL = Symbol.for("react-idb-hooks.internal");
export type INTERNAL = typeof INTERNAL;

/**
 * The handle returned by `defineIDB`. It exposes the schema-typed read
 * methods (`get`, `getAll`, `byIndex`, ...) directly so that
 * `useIDBQuery(db, async (db) => db.get("todos", id), ["todos"])` reads
 * naturally. The `INTERNAL` slot carries everything the hooks layer needs
 * (status, subscriptions, mutations, close).
 *
 * Reads from `Database` outside of a hook are perfectly valid one-shot
 * promises - they just won't auto-rerender.
 */
export interface Database<S> extends DatabaseQueryAPI<S> {
  /** The database name. Useful for logging and the cross-tab channel name. */
  readonly name: string;
  /** The schema version. */
  readonly version: number;
  /** Opaque internal access for the hooks layer. */
  readonly [INTERNAL]: DatabaseInternal<S>;
}

/**
 * Internal contract `db.ts` exposes to `hooks.ts`. Not exported from `index.ts`.
 */
export interface DatabaseInternal<S> {
  /** Resolves to a connected `IDBDatabase`. Idempotent (singleton open promise). */
  getConnection(): Promise<IDBDatabase>;
  /** Connection status as observed today. */
  getStatus(): { status: ConnectionStatus; error?: Error };
  /** Subscribe to connection-status changes. Returns unsubscribe. */
  subscribeStatus(listener: () => void): () => void;
  /** Run a read query against the schema. */
  query: DatabaseQueryAPI<S>;
  /** Apply a mutation; resolves after the transaction commits. */
  mutate<N extends StoreName<S>>(store: N, op: MutationOp<S, N>): Promise<void>;
  /** Subscribe to invalidations of any of `stores`. Returns unsubscribe. */
  subscribeStores(stores: ReadonlyArray<StoreName<S>>, listener: () => void): () => void;
  /** Disconnect (test-only). */
  close(): void;
}
