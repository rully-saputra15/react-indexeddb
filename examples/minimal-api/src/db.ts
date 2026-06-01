import { defineIDB } from "react-idb-hooks";

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export interface AppSchema {
  todos: { value: Todo; key: string };
}

export const appDb = defineIDB<AppSchema>({
  name: "react-idb-hooks-todos",
  version: 1,
  upgrade({ db }) {
    db.createObjectStore("todos", { keyPath: "id" });
  },
});
