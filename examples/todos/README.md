# Todos example

A minimal Vite + React app exercising every public hook of `react-idb-hooks`:

- `defineIDB` — schema + migration in `src/db.ts`
- `useIDB` — connection status badge in the header
- `useIDBQuery` — reactive list of todos
- `useIDBMutation` — add / toggle / delete

## Run locally

```sh
cd examples/todos
npm install
npm run dev
```

Open in two browser windows to see the cross-tab `BroadcastChannel` invalidation in action.
