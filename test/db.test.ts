import { describe, expect, it } from "vitest";
import { defineIDB, IDBUnsupportedError } from "../src";
import { INTERNAL } from "../src/types";
import { uniqueDbName, closeDb } from "./helpers";

interface AppSchema {
  todos: { value: { id: string; title: string; done: boolean }; key: string };
}

const makeDb = (name: string) =>
  defineIDB<AppSchema>({
    name,
    version: 1,
    upgrade({ db }) {
      db.createObjectStore("todos", { keyPath: "id" });
    },
  });

describe("defineIDB", () => {
  it("opens a database and runs upgrade exactly once", async () => {
    const name = uniqueDbName("open");
    const db = makeDb(name);
    await db.getAll("todos");
    expect(db.name).toBe(name);
    expect(db.version).toBe(1);
    closeDb(db);
  });

  it("returns the same Database instance for the same (name, version)", () => {
    const name = uniqueDbName("cache");
    const a = makeDb(name);
    const b = makeDb(name);
    expect(a).toBe(b);
    closeDb(a);
  });

  it("get / put / delete / clear round-trip", async () => {
    const db = makeDb(uniqueDbName("crud"));

    expect(await db.getAll("todos")).toEqual([]);

    const { mutate } = db[INTERNAL];
    await mutate("todos", { type: "put", value: { id: "1", title: "A", done: false } });
    await mutate("todos", { type: "put", value: { id: "2", title: "B", done: true } });

    expect(await db.get("todos", "1")).toEqual({ id: "1", title: "A", done: false });
    expect(await db.count("todos")).toBe(2);
    expect((await db.getAll("todos")).length).toBe(2);

    await mutate("todos", { type: "delete", key: "1" });
    expect(await db.get("todos", "1")).toBeUndefined();
    expect(await db.count("todos")).toBe(1);

    await mutate("todos", { type: "clear" });
    expect(await db.count("todos")).toBe(0);

    closeDb(db);
  });

  it("returns IDBUnsupportedError when indexedDB is missing", async () => {
    const original = globalThis.indexedDB;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    try {
      const db = defineIDB<AppSchema>({
        name: uniqueDbName("nope"),
        version: 1,
        upgrade({ db }) {
          db.createObjectStore("todos", { keyPath: "id" });
        },
      });
      await expect(db.getAll("todos")).rejects.toBeInstanceOf(IDBUnsupportedError);
      closeDb(db);
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it("propagates upgrade errors as a rejection on the first read", async () => {
    const db = defineIDB<AppSchema>({
      name: uniqueDbName("badupgrade"),
      version: 1,
      upgrade() {
        throw new Error("upgrade kaboom");
      },
    });
    await expect(db.getAll("todos")).rejects.toThrow(/kaboom|aborted/i);
    closeDb(db);
  });
});
