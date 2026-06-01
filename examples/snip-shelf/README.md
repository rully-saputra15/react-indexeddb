# Snip Shelf — flagship demo for `react-idb-hooks`

An offline snippet vault that proves what `react-idb-hooks` is for: persistent reactive storage for **megabytes** of structured records and **Blob attachments**, with **load-bearing cross-tab sync** built in.

## What it shows

- **Treemap of the whole vault** — every snip is a tile sized by byte count and colored by content type. The screenshot for the README.
- **Capture pane** — paste a 50–100 KB JSON dump or log; save without jank. `useIDBMutation` with `add`.
- **Triage pane** — list filtered by type or recency via index reads (`byType`, `byUpdated`). Tag, retitle, delete with `put` / `delete`.
- **Cross-tab workflow** — open the app in two tabs. Capture in one, triage in the other. Both panes stay live via `BroadcastChannel`.
- **Schema migration** — v1 → v2 in `src/db.ts` adds `attachments` and a second index. Real upgrade path, not contrived.
- **Typed errors** — `IDBQuotaExceededError` becomes an inline "trim large snips" warning; `IDBUnsupportedError` shows a full-width banner.

## Run locally

```sh
cd examples/snip-shelf
npm install
npm run dev
```

Then open the URL in **two** browser windows side-by-side and watch the cross-tab story unfold.

## Why not just localStorage?

`localStorage` is ~5 MB, synchronous, string-only, and rewrites the whole array on every save. A vault that grows past 100 snips of medium-size logs hits all three walls. IndexedDB stores Blobs, indexes structured fields, writes async, and survives reload. This example is built specifically to put each of those properties on screen.
