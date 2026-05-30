import { defineIDB } from "react-indexeddb";

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
  name: "react-indexeddb-todos",
  version: 1,
  upgrade({ db }) {
    db.createObjectStore("todos", { keyPath: "id" });
  },
});
