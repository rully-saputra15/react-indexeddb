import { useState } from "react";
import { useIDB, useIDBMutation, useIDBQuery } from "react-indexeddb";
import { appDb, type Todo } from "./db";

const styles = {
  container: { maxWidth: 560, margin: "40px auto", fontFamily: "system-ui, sans-serif" },
  badge: (status: string): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    background:
      status === "ready" ? "#16a34a" : status === "error" ? "#dc2626" : "#475569",
    color: "white",
  }),
  row: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid #eee",
  },
  input: { flex: 1, padding: 8, fontSize: 14, borderRadius: 6, border: "1px solid #cbd5e1" },
  button: {
    padding: "8px 12px",
    fontSize: 14,
    background: "#2563eb",
    color: "white",
    border: 0,
    borderRadius: 6,
    cursor: "pointer",
  },
  small: { fontSize: 12, color: "#64748b", marginTop: 8 },
} as const;

export function App() {
  const conn = useIDB(appDb);
  const todos = useIDBQuery(appDb, async (db) => db.getAll("todos"), ["todos"]);
  const mutation = useIDBMutation(appDb, "todos");
  const [draft, setDraft] = useState("");

  const onAdd = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft("");
    await mutation.mutate({
      type: "put",
      value: { id: crypto.randomUUID(), title: trimmed, done: false, createdAt: Date.now() },
    });
  };

  const toggle = (todo: Todo) =>
    mutation.mutate({ type: "put", value: { ...todo, done: !todo.done } });

  const remove = (id: string) => mutation.mutate({ type: "delete", key: id });

  return (
    <div style={styles.container}>
      <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
        Todos <span style={styles.badge(conn.status)}>{conn.status}</span>
      </h1>

      <div style={styles.row}>
        <input
          style={styles.input}
          placeholder="What needs doing?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
        />
        <button
          style={styles.button}
          onClick={() => void onAdd()}
          disabled={mutation.status === "pending"}
        >
          Add
        </button>
      </div>

      {todos.status === "loading" && <p>Loading...</p>}
      {todos.status === "error" && <p style={{ color: "crimson" }}>{todos.error?.message}</p>}
      {todos.status === "success" && (todos.data ?? []).length === 0 && (
        <p style={styles.small}>No todos yet. Open this page in a second window to see live cross-tab sync.</p>
      )}
      {todos.data?.map((t) => (
        <div key={t.id} style={styles.row}>
          <input type="checkbox" checked={t.done} onChange={() => void toggle(t)} />
          <span
            style={{
              flex: 1,
              textDecoration: t.done ? "line-through" : "none",
              color: t.done ? "#94a3b8" : "inherit",
            }}
          >
            {t.title}
          </span>
          <button
            onClick={() => void remove(t.id)}
            style={{ ...styles.button, background: "#475569" }}
          >
            Delete
          </button>
        </div>
      ))}

      <p style={styles.small}>
        Cross-tab demo: open this page in two browser windows. Mutations in one window appear in the
        other within a microtask via `BroadcastChannel`.
      </p>
    </div>
  );
}
