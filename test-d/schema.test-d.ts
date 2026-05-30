/**
 * Compile-time type tests. Run with `npm run test:types` (which is just
 * `tsc --noEmit` over this folder). Failures show up as type errors.
 *
 * `// @ts-expect-error` lines verify negative cases (the line below MUST
 * fail to typecheck, otherwise tsc itself errors on the unused directive).
 */

import {
  defineIDB,
  useIDB,
  useIDBQuery,
  useIDBMutation,
  type Database,
  type MutationOp,
} from "../src";

interface AppSchema {
  todos: {
    value: { id: string; title: string; done: boolean };
    key: string;
    indexes: { byDone: 0 | 1; byTitle: string };
  };
  meta: {
    value: number;
    key: "version" | "updated";
  };
}

const db: Database<AppSchema> = defineIDB<AppSchema>({
  name: "app",
  version: 1,
  upgrade({ db }) {
    db.createObjectStore("todos", { keyPath: "id" });
    db.createObjectStore("meta");
  },
});

// Helper that asserts T is the expected type (compile-time only).
function expectType<T>(_value: T): void {}

// ---- Database query API ---------------------------------------------------

async function readPaths() {
  const todo = await db.get("todos", "abc");
  expectType<{ id: string; title: string; done: boolean } | undefined>(todo);

  const all = await db.getAll("todos");
  expectType<Array<{ id: string; title: string; done: boolean }>>(all);

  // Index name narrows to the schema's known indexes.
  const oneDone = await db.byIndex("todos", "byDone", 1);
  expectType<{ id: string; title: string; done: boolean } | undefined>(oneDone);

  const meta = await db.get("meta", "version");
  expectType<number | undefined>(meta);
}
void readPaths;

// ---- Negative: unknown store ---------------------------------------------

// @ts-expect-error: "users" is not a store in AppSchema
db.get("users", "x");

// @ts-expect-error: index "byNope" is not declared on todos
db.byIndex("todos", "byNope", 1);

// @ts-expect-error: meta has no indexes; calling byIndex must error
db.byIndex("meta", "anything", 0);

// @ts-expect-error: key for "meta" is "version" | "updated", "nope" is rejected
db.get("meta", "nope");

// ---- useIDBQuery ----------------------------------------------------------

function useExample() {
  const result = useIDBQuery(db, async (d) => d.getAll("todos"), ["todos"]);
  expectType<{ id: string; title: string; done: boolean }[] | undefined>(result.data);

  // Unknown store name in the deps list must be rejected.
  // @ts-expect-error
  useIDBQuery(db, async (d) => d.getAll("todos"), ["users"]);
}
void useExample;

// ---- useIDB ---------------------------------------------------------------

function useExample2() {
  const r = useIDB(db);
  expectType<"loading" | "ready" | "error" | "unsupported">(r.status);
}
void useExample2;

// ---- useIDBMutation -------------------------------------------------------

function useExample3() {
  const m = useIDBMutation(db, "todos");
  expectType<"idle" | "pending" | "success" | "error">(m.status);

  void m.mutate({ type: "put", value: { id: "1", title: "x", done: false } });
  void m.mutate({ type: "delete", key: "1" });
  void m.mutate({ type: "clear" });

  // Wrong value shape rejected:
  // @ts-expect-error
  void m.mutate({ type: "put", value: { id: 1, title: "x", done: false } });

  // Wrong key type rejected:
  // @ts-expect-error
  void m.mutate({ type: "delete", key: 123 });

  // Unknown op type rejected:
  // @ts-expect-error
  void m.mutate({ type: "merge", value: { id: "1", title: "x", done: false } });
}
void useExample3;

// ---- MutationOp discriminated union --------------------------------------

const op: MutationOp<AppSchema, "todos"> = {
  type: "put",
  value: { id: "1", title: "x", done: false },
};
expectType<MutationOp<AppSchema, "todos">>(op);
