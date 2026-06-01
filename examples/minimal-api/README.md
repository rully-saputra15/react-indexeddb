# Minimal API example

A minimal Vite + React todos app exercising every public hook of `react-idb-hooks` in ~80 LOC. This is the read-everything-in-one-sitting reference. For the visually-rich flagship demo (treemap, Blob attachments, two-tab capture/triage workflow), see [`examples/snip-shelf`](../snip-shelf).

What this example covers:

- `defineIDB` — schema + migration in `src/db.ts`
- `useIDB` — connection status badge in the header
- `useIDBQuery` — reactive list of todos
- `useIDBMutation` — add / toggle / delete

## Run locally

```sh
cd examples/minimal-api
npm install
npm run dev
```

Open in two browser windows to see the cross-tab `BroadcastChannel` invalidation in action.
