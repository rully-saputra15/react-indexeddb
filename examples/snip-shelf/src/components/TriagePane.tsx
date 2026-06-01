import { useState, useMemo } from "react";
import { useIDBQuery, useIDBMutation } from "react-idb-hooks";
import { snipDb, recomputeVaultMeta, type ContentType, type Snip } from "../db";

type TypeFilter = "all" | ContentType;
type TimeFilter = "all" | "today" | "week";

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
];

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "week", label: "Last 7 days" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

interface TriagePaneProps {
  selectedId: string | null;
  onSelect: (snip: Snip | null) => void;
}

export function TriagePane({ selectedId, onSelect }: TriagePaneProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [showWipe, setShowWipe] = useState(false);

  const snipsMutation = useIDBMutation(snipDb, "snips");
  const metaMutation = useIDBMutation(snipDb, "meta");
  const attachmentsMutation = useIDBMutation(snipDb, "attachments");

  // The reactive list. We use index reads when a filter is active so the demo
  // shows `byType` / `byUpdated` actually being exercised on the database side
  // (not a JS .filter() in memory).
  const { data: snips, status } = useIDBQuery(
    snipDb,
    async (db) => {
      if (typeFilter !== "all") {
        const all = await db.byIndexAll("snips", "byType", typeFilter);
        return restrictByTime(all, timeFilter);
      }
      if (timeFilter !== "all") {
        const cutoff = timeFilter === "today" ? Date.now() - DAY_MS : Date.now() - 7 * DAY_MS;
        const range = IDBKeyRange.lowerBound(cutoff);
        return db.byIndexAll("snips", "byUpdated", range);
      }
      return db.getAll("snips");
    },
    ["snips"],
  );

  const sorted = useMemo(() => {
    if (!snips) return [];
    return [...snips].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snips]);

  const onDelete = async (snip: Snip): Promise<void> => {
    // Also delete that snip's attachments. Each delete is its own one-shot
    // transaction (per the library's contract); we then recompute meta.
    const attachments = await snipDb.byIndexAll("attachments", "bySnip", snip.id);
    for (const a of attachments) {
      await attachmentsMutation.mutate({ type: "delete", key: a.id });
    }
    await snipsMutation.mutate({ type: "delete", key: snip.id });
    const meta = await recomputeVaultMeta();
    await metaMutation.mutate({ type: "put", value: meta });
    if (selectedId === snip.id) onSelect(null);
  };

  const onTagsEdit = async (snip: Snip, tagsRaw: string): Promise<void> => {
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    await snipsMutation.mutate({
      type: "put",
      value: { ...snip, tags, updatedAt: Date.now() },
    });
  };

  const onWipe = async (): Promise<void> => {
    await snipsMutation.mutate({ type: "clear" });
    await attachmentsMutation.mutate({ type: "clear" });
    const meta = await recomputeVaultMeta();
    await metaMutation.mutate({ type: "put", value: meta });
    setShowWipe(false);
    onSelect(null);
  };

  return (
    <section className="pane triage">
      <header className="pane-header">
        <h2>Triage</h2>
        <button
          type="button"
          className="wipe-btn"
          onClick={() => setShowWipe(true)}
          aria-label="Wipe vault"
        >
          Wipe
        </button>
      </header>

      <div className="filter-bar">
        <div className="filter-group">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip${typeFilter === f.id ? " chip-active" : ""}`}
              onClick={() => setTypeFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {TIME_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip${timeFilter === f.id ? " chip-active" : ""}`}
              onClick={() => setTimeFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && <p className="muted">Loading…</p>}
      {status === "success" && sorted.length === 0 && (
        <p className="muted">No snips match the current filters.</p>
      )}

      <ul className="triage-list">
        {sorted.map((s) => (
          <TriageRow
            key={s.id}
            snip={s}
            isSelected={s.id === selectedId}
            onSelect={() => onSelect(s)}
            onDelete={() => void onDelete(s)}
            onTagsEdit={(raw) => void onTagsEdit(s, raw)}
          />
        ))}
      </ul>

      {showWipe && (
        <div className="modal-backdrop" onClick={() => setShowWipe(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Wipe entire vault?</h3>
            <p>This deletes every snip and every attachment. Cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowWipe(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger" onClick={() => void onWipe()}>
                Wipe vault
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  snip: Snip;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTagsEdit: (rawTags: string) => void;
}

function TriageRow({ snip, isSelected, onSelect, onDelete, onTagsEdit }: RowProps) {
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState(snip.tags.join(", "));

  return (
    <li className={`triage-row${isSelected ? " triage-row-selected" : ""}`}>
      <button type="button" className="triage-row-main" onClick={onSelect}>
        <span className={`type-dot type-dot-${snip.contentType}`} />
        <span className="triage-title">{snip.title}</span>
        <span className="triage-meta">
          {formatBytes(snip.byteSize)} · {relativeTime(snip.updatedAt)}
        </span>
      </button>
      {editingTags ? (
        <input
          autoFocus
          className="tags-edit"
          value={draftTags}
          onChange={(e) => setDraftTags(e.target.value)}
          onBlur={() => {
            onTagsEdit(draftTags);
            setEditingTags(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onTagsEdit(draftTags);
              setEditingTags(false);
            }
            if (e.key === "Escape") setEditingTags(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="tags-display"
          onClick={() => {
            setDraftTags(snip.tags.join(", "));
            setEditingTags(true);
          }}
          aria-label="Edit tags"
        >
          {snip.tags.length === 0 ? (
            <span className="muted">+ tag</span>
          ) : (
            snip.tags.map((t) => (
              <span key={t} className="tag-pill">
                {t}
              </span>
            ))
          )}
        </button>
      )}
      <button type="button" className="row-delete" onClick={onDelete} aria-label="Delete snip">
        ×
      </button>
    </li>
  );
}

function restrictByTime(snips: Snip[], time: TimeFilter): Snip[] {
  if (time === "all") return snips;
  const cutoff = time === "today" ? Date.now() - DAY_MS : Date.now() - 7 * DAY_MS;
  return snips.filter((s) => s.updatedAt >= cutoff);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * DAY_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  return new Date(ts).toLocaleDateString();
}
