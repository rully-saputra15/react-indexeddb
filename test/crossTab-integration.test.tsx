import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { defineIDB, useIDBMutation, useIDBQuery } from "../src";
import { __dropCache } from "../src/db";
import { closeDb, uniqueDbName, renderHook } from "./helpers";

interface AppSchema {
  todos: { value: { id: string; title: string }; key: string };
}

const make = (name: string) =>
  defineIDB<AppSchema>({
    name,
    version: 1,
    upgrade({ db }) {
      db.createObjectStore("todos", { keyPath: "id" });
    },
  });

// In-process BroadcastChannel mock that fans out to every instance with
// the same name (mirroring real cross-tab behavior, but without the
// browser process boundary).
let bcRegistry: Map<string, Set<{ deliver: (data: unknown) => void }>>;
let originalBC: typeof BroadcastChannel | undefined;

beforeEach(() => {
  bcRegistry = new Map();
  originalBC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;

  class FakeBroadcastChannel {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public onmessage: ((this: BroadcastChannel, ev: MessageEvent<any>) => any) | null = null;
    private entry = {
      deliver: (data: unknown) =>
        this.onmessage?.call(this as unknown as BroadcastChannel, { data } as MessageEvent),
    };
    constructor(public readonly name: string) {
      let set = bcRegistry.get(name);
      if (!set) {
        set = new Set();
        bcRegistry.set(name, set);
      }
      set.add(this.entry);
    }
    postMessage(data: unknown): void {
      const set = bcRegistry.get(this.name);
      if (!set) return;
      for (const peer of set) {
        if (peer === this.entry) continue; // do not echo to self
        queueMicrotask(() => peer.deliver(data));
      }
    }
    close(): void {
      bcRegistry.get(this.name)?.delete(this.entry);
    }
  }

  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
});

afterEach(() => {
  if (originalBC) {
    (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = originalBC;
  }
});

describe("cross-tab sync", () => {
  it("a mutation in tab A invalidates a query hook bound to tab B", async () => {
    const name = uniqueDbName("xtab");

    // Tab A: a Database with its own ReactivityStore.
    const dbA = make(name);

    // Drop the singleton cache so the next defineIDB returns a SEPARATE
    // Database instance, simulating a different tab. They share IDB
    // storage (same name) and share the BroadcastChannel by virtue of
    // FakeBroadcastChannel's per-name registry.
    __dropCache();
    const dbB = make(name);
    expect(dbA).not.toBe(dbB);

    // Tab B observes the todos store via a query hook.
    const { result: query } = renderHook(() =>
      useIDBQuery(dbB, async (db) => db.getAll("todos"), ["todos"]),
    );
    await waitFor(() => expect(query.current.status).toBe("success"));
    expect(query.current.data).toEqual([]);

    // Tab A writes via its own mutation hook.
    const { result: mutation } = renderHook(() => useIDBMutation(dbA, "todos"));
    await act(async () => {
      await mutation.current.mutate({
        type: "put",
        value: { id: "x", title: "from A" },
      });
    });

    // The cross-tab message should make Tab B re-run its query and pick
    // up the new record.
    await waitFor(() => expect(query.current.data?.length).toBe(1), { timeout: 2000 });
    expect(query.current.data?.[0]).toEqual({ id: "x", title: "from A" });

    closeDb(dbA);
    closeDb(dbB);
  });
});
