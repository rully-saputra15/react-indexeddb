/**
 * The IndexedDB layer.
 *
 * - Owns the only `indexedDB.open` call in the library.
 * - Implements every read/write op as a single-request transaction so we
 *   never `await` a foreign promise inside an open `IDBTransaction`
 *   (which would let it auto-commit early and corrupt your data).
 * - Wires post-commit invalidations into the reactivity store and posts
 *   them on the cross-tab channel.
 *
 * `db.ts` is the only file in the library that imports the IndexedDB
 * global. It is the only file allowed to import from `store.ts` and
 * `crossTab.ts` simultaneously (they remain unaware of each other and of
 * IndexedDB). Hooks consume the `Database<S>` returned by `defineIDB` via
 * the opaque `INTERNAL` slot.
 */

import {
  INTERNAL,
  type ConnectionStatus,
  type Database,
  type DatabaseInternal,
  type DatabaseQueryAPI,
  type IndexKeyOf,
  type IndexNameOf,
  type KeyOf,
  type MutationOp,
  type SchemaLike,
  type StoreName,
  type ValueOf,
} from "./types";
import { createReactivityStore } from "./store";
import { createChannel, type CrossTabChannel } from "./crossTab";

// ---------- Typed errors ---------------------------------------------------

/** Schema version conflict (e.g. you opened with a lower version than exists). */
export class IDBVersionError extends Error {
  override name = "IDBVersionError";
}
/** Another connection is preventing an upgrade. */
export class IDBBlockedError extends Error {
  override name = "IDBBlockedError";
}
/** Storage quota exceeded on a write. */
export class IDBQuotaExceededError extends Error {
  override name = "IDBQuotaExceededError";
}
/** `indexedDB` is not available in this environment (SSR, RN, Safari private mode failures, etc.). */
export class IDBUnsupportedError extends Error {
  override name = "IDBUnsupportedError";
}

function mapError(err: unknown): Error {
  if (err instanceof Error && err.name && err.name.startsWith("IDB")) return err;
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: string }).name;
    const message = (err as { message?: string }).message ?? String(err);
    if (name === "VersionError") return new IDBVersionError(message);
    if (name === "QuotaExceededError") return new IDBQuotaExceededError(message);
    if (err instanceof Error) return err;
    return new Error(message);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// ---------- Public config --------------------------------------------------

export interface DefineIDBConfig<_S> {
  /** Logical database name. Used as the IDB name and the cross-tab channel id. */
  name: string;
  /** Schema version. Bump to trigger `upgrade`. */
  version: number;
  /**
   * Migration callback. Runs inside an open `versionchange` transaction.
   * Synchronous: do not `await` foreign promises here. This is the only
   * place where you call `db.createObjectStore` / `store.createIndex`.
   */
  upgrade: (ctx: { db: IDBDatabase; oldVersion: number; tx: IDBTransaction }) => void;
  /** Enable cross-tab invalidation via BroadcastChannel. Default: `true`. */
  crossTab?: boolean;
}

// ---------- Module-level cache (StrictMode-safe) ---------------------------

const STATUS_CHANNEL = "__rxidb_status__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, Database<any>>();

function cacheKeyOf(name: string, version: number): string {
  return `${name}@${version}`;
}

// ---------- defineIDB ------------------------------------------------------

export function defineIDB<S extends SchemaLike<S>>(config: DefineIDBConfig<S>): Database<S> {
  const key = cacheKeyOf(config.name, config.version);
  const cached = cache.get(key);
  if (cached) return cached as unknown as Database<S>;

  const reactivity = createReactivityStore();
  const channel: CrossTabChannel =
    config.crossTab === false ? createChannel("__noop__") : createChannel(config.name);

  // Wire incoming cross-tab messages into the local reactivity store.
  // We deliberately do NOT re-broadcast here, otherwise tabs would echo
  // forever.
  if (config.crossTab !== false) {
    channel.onMessage(({ stores }) => reactivity.notify(stores));
  }

  // ---- Connection state -------------------------------------------------

  let connection: IDBDatabase | null = null;
  let openInFlight: Promise<IDBDatabase> | null = null;
  let status: ConnectionStatus = typeof indexedDB === "undefined" ? "unsupported" : "loading";
  let lastError: Error | undefined;

  const setStatus = (next: ConnectionStatus, err?: Error): void => {
    if (status === next && lastError === err) return;
    status = next;
    lastError = err;
    reactivity.notify([STATUS_CHANNEL]);
  };

  const open = (): Promise<IDBDatabase> => {
    if (typeof indexedDB === "undefined") {
      const err = new IDBUnsupportedError(
        "indexedDB is not available in this environment.",
      );
      setStatus("unsupported", err);
      return Promise.reject(err);
    }
    if (connection) return Promise.resolve(connection);
    if (openInFlight) return openInFlight;

    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(config.name, config.version);
      } catch (err) {
        reject(mapError(err));
        return;
      }

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction;
        if (!tx) {
          reject(new Error("upgrade transaction was unexpectedly null"));
          return;
        }
        try {
          config.upgrade({ db, oldVersion: event.oldVersion, tx });
        } catch (err) {
          // Abort the upgrade tx so the open fails cleanly.
          try {
            tx.abort();
          } catch {
            // ignore abort errors
          }
          reject(mapError(err));
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // If another tab opens with a higher version, release our connection
        // so theirs can complete the upgrade.
        db.onversionchange = () => {
          db.close();
          if (connection === db) connection = null;
          setStatus("loading");
        };
        // The connection can be force-closed by the browser (e.g. quota).
        db.onclose = () => {
          if (connection === db) connection = null;
          setStatus("loading");
        };
        connection = db;
        resolve(db);
      };

      request.onerror = () => reject(mapError(request.error));

      request.onblocked = () =>
        reject(
          new IDBBlockedError(
            `Database "${config.name}" is blocked: another tab holds an older version. Close it and reload.`,
          ),
        );
    });

    openInFlight = promise;
    promise
      .then(() => setStatus("ready"))
      .catch((err: Error) => setStatus("error", err))
      .finally(() => {
        openInFlight = null;
      });
    return promise;
  };

  // ---- Single-request helpers (transaction-safe) ------------------------
  //
  // Each helper opens its own one-shot transaction and waits on a single
  // IDBRequest. We never await a foreign promise inside the tx callback,
  // so the tx auto-commit cannot strand us mid-write.

  const reqAsPromise = <T>(request: IDBRequest<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(mapError(request.error));
    });

  const readOne = async <T>(
    storeName: string,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    const tx = db.transaction(storeName, "readonly");
    return reqAsPromise(fn(tx.objectStore(storeName)));
  };

  const readIndex = async <T>(
    storeName: string,
    indexName: string,
    fn: (index: IDBIndex) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    const tx = db.transaction(storeName, "readonly");
    return reqAsPromise(fn(tx.objectStore(storeName).index(indexName)));
  };

  // Use the unparameterized `IDBRequest` so the callback can return any
  // request shape - put returns `IDBRequest<IDBValidKey>`, delete returns
  // `IDBRequest<undefined>`, etc. We don't care about the result here; we
  // only await tx.complete.
  //
  // Capturing `request.error` is more reliable than `tx.error`: the spec
  // populates `tx.error` only at abort-time, while many browsers (and
  // fake-indexeddb) leave it `null` when `tx.onerror` fires.
  const writeOne = async (
    storeName: string,
    // `any` here is deliberate: IDB request handlers are typed `this`-variant
    // on `IDBRequest`, so concrete callers like `store.put(value)` would not
    // be assignable to `IDBRequest<unknown>`. We only consume `request.error`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (store: IDBObjectStore) => IDBRequest<any>,
  ): Promise<void> => {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      let captured: Error | null = null;
      try {
        const request = fn(tx.objectStore(storeName));
        request.onerror = () => {
          captured = mapError(request.error);
        };
      } catch (err) {
        captured = mapError(err);
        try {
          tx.abort();
        } catch {
          // ignore
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(captured ?? mapError(tx.error));
      tx.onabort = () => reject(captured ?? mapError(tx.error));
    });
  };

  // ---- Typed query API --------------------------------------------------

  const query: DatabaseQueryAPI<S> = {
    get<N extends StoreName<S>>(store: N, k: KeyOf<S, N>) {
      return readOne(store, (s) => s.get(k as IDBValidKey)) as Promise<
        ValueOf<S, N> | undefined
      >;
    },
    getAll<N extends StoreName<S>>(store: N, range?: IDBKeyRange | null, limit?: number) {
      return readOne(store, (s) =>
        s.getAll(range ?? undefined, limit ?? undefined),
      ) as Promise<Array<ValueOf<S, N>>>;
    },
    getAllKeys<N extends StoreName<S>>(store: N, range?: IDBKeyRange | null, limit?: number) {
      return readOne(store, (s) =>
        s.getAllKeys(range ?? undefined, limit ?? undefined),
      ) as Promise<Array<KeyOf<S, N>>>;
    },
    count<N extends StoreName<S>>(store: N, range?: IDBKeyRange | null) {
      return readOne(store, (s) => s.count(range ?? undefined));
    },
    byIndex<N extends StoreName<S>, I extends IndexNameOf<S, N>>(
      store: N,
      index: I,
      k: IndexKeyOf<S, N, I>,
    ) {
      return readIndex(store, index, (i) => i.get(k as IDBValidKey)) as Promise<
        ValueOf<S, N> | undefined
      >;
    },
    byIndexAll<N extends StoreName<S>, I extends IndexNameOf<S, N>>(
      store: N,
      index: I,
      range?: IDBKeyRange | IndexKeyOf<S, N, I> | null,
      limit?: number,
    ) {
      const arg =
        range == null
          ? undefined
          : range instanceof IDBKeyRange
            ? range
            : (range as IDBValidKey);
      return readIndex(store, index, (i) =>
        i.getAll(arg, limit ?? undefined),
      ) as Promise<Array<ValueOf<S, N>>>;
    },
  };

  // ---- Mutate -----------------------------------------------------------

  async function mutate<N extends StoreName<S>>(
    storeName: N,
    op: MutationOp<S, N>,
  ): Promise<void> {
    switch (op.type) {
      case "put":
        await writeOne(storeName, (s) =>
          op.key !== undefined
            ? s.put(op.value as unknown, op.key as IDBValidKey)
            : s.put(op.value as unknown),
        );
        break;
      case "add":
        await writeOne(storeName, (s) =>
          op.key !== undefined
            ? s.add(op.value as unknown, op.key as IDBValidKey)
            : s.add(op.value as unknown),
        );
        break;
      case "delete":
        await writeOne(storeName, (s) => s.delete(op.key as IDBValidKey));
        break;
      case "clear":
        await writeOne(storeName, (s) => s.clear());
        break;
    }
    // Fan out to local subscribers and to other tabs.
    reactivity.notify([storeName]);
    if (config.crossTab !== false) channel.post({ stores: [storeName] });
  }

  // ---- DatabaseInternal -------------------------------------------------

  const internal: DatabaseInternal<S> = {
    getConnection: open,
    getStatus: () => ({
      status,
      ...(lastError === undefined ? {} : { error: lastError }),
    }),
    subscribeStatus: (listener) => reactivity.subscribe([STATUS_CHANNEL], listener),
    query,
    mutate,
    subscribeStores: (stores, listener) =>
      reactivity.subscribe(stores as ReadonlyArray<string>, listener),
    close: () => {
      if (connection) {
        connection.close();
        connection = null;
      }
      openInFlight = null;
      channel.close();
      cache.delete(key);
    },
  };

  const db: Database<S> = {
    name: config.name,
    version: config.version,
    [INTERNAL]: internal,
    get: query.get,
    getAll: query.getAll,
    getAllKeys: query.getAllKeys,
    count: query.count,
    byIndex: query.byIndex,
    byIndexAll: query.byIndexAll,
  };

  cache.set(key, db);
  return db;
}

/**
 * Test-only: drop every cached `Database` AND close their connections.
 * Not exported from `index.ts`.
 */
export function __resetCache(): void {
  for (const db of cache.values()) {
    (db[INTERNAL] as DatabaseInternal<unknown>).close();
  }
  cache.clear();
}

/**
 * Test-only: drop the singleton cache WITHOUT closing connections, so a
 * subsequent `defineIDB` call returns a fresh `Database` instance for the
 * same `(name, version)`. Used by cross-tab tests to simulate two tabs.
 */
export function __dropCache(): void {
  cache.clear();
}
