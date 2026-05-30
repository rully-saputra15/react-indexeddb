# Changelog

## 0.1.0 - 2026-05-30

Initial release.

- `defineIDB(config)` opens / migrates an IndexedDB database with a typed schema.
- `useIDB(db)` exposes connection status (`loading` / `ready` / `error` / `unsupported`).
- `useIDBQuery(db, fn, stores)` reactive read with explicit store deps; re-runs on local mutations and on cross-tab invalidations.
- `useIDBMutation(db, store)` write with `idle` / `pending` / `success` / `error` status.
- Cross-tab sync via `BroadcastChannel` (opt-out with `crossTab: false`).
- Vendored `useSyncExternalStore` shim covering React 16.8 - 17.
- Typed errors: `IDBVersionError`, `IDBBlockedError`, `IDBQuotaExceededError`, `IDBUnsupportedError`.
- Zero runtime dependencies.
