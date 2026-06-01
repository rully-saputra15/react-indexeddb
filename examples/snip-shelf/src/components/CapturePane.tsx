import { useState } from "react";
import { useIDBMutation, IDBQuotaExceededError } from "react-idb-hooks";
import { snipDb, recomputeVaultMeta, type ContentType, type Snip } from "../db";

const TYPES: ContentType[] = ["text", "json", "markdown"];

function detectType(body: string): ContentType {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // fall through
    }
  }
  if (/^#{1,6}\s|\n#{1,6}\s|\*\*|^- |^\d+\.\s/.test(trimmed)) return "markdown";
  return "text";
}

export function CapturePane() {
  const snipsMutation = useIDBMutation(snipDb, "snips");
  const metaMutation = useIDBMutation(snipDb, "meta");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [autoType, setAutoType] = useState(true);
  const [tagsRaw, setTagsRaw] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const byteSize = new TextEncoder().encode(body).length;
  const effectiveType = autoType ? detectType(body) : contentType;
  const isLarge = byteSize > 50 * 1024;
  const canSave = body.trim().length > 0 && snipsMutation.status !== "pending";

  const onSave = async (): Promise<void> => {
    if (!canSave) return;
    const now = Date.now();
    const trimmedTitle = title.trim() || autoTitle(body);
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const snip: Snip = {
      id: crypto.randomUUID(),
      title: trimmedTitle,
      body,
      contentType: effectiveType,
      tags,
      byteSize,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await snipsMutation.mutate({ type: "add", value: snip });
      const meta = await recomputeVaultMeta();
      await metaMutation.mutate({ type: "put", value: meta });
      setSavedNote(`Saved “${trimmedTitle}” (${formatBytes(byteSize)})`);
      setBody("");
      setTitle("");
      setTagsRaw("");
      window.setTimeout(() => setSavedNote(null), 3000);
    } catch {
      // useIDBMutation also stores the error in `snipsMutation.error`
      // for the inline UI below.
    }
  };

  const quotaHit = snipsMutation.error instanceof IDBQuotaExceededError;

  return (
    <section className="pane capture">
      <header className="pane-header">
        <h2>Capture</h2>
        <span className="pane-byte">{formatBytes(byteSize)}</span>
      </header>

      <input
        className="title-input"
        placeholder={autoTitle(body) || "Title (optional)"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="body-input"
        placeholder="Paste a JSON dump, a stack trace, a markdown note…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        spellCheck={false}
      />

      <div className="capture-row">
        <label className="auto-type">
          <input
            type="checkbox"
            checked={autoType}
            onChange={(e) => setAutoType(e.target.checked)}
          />
          auto-detect type
        </label>
        <div className="type-picker" aria-disabled={autoType}>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={autoType}
              className={`chip${(autoType ? effectiveType : contentType) === t ? " chip-active" : ""}`}
              onClick={() => setContentType(t)}
            >
              {t}
              {autoType && effectiveType === t && <span className="chip-auto"> auto</span>}
            </button>
          ))}
        </div>
      </div>

      <input
        className="tags-input"
        placeholder="tags, comma, separated"
        value={tagsRaw}
        onChange={(e) => setTagsRaw(e.target.value)}
      />

      {isLarge && !quotaHit && (
        <div className="hint hint-info">
          Large snip ({formatBytes(byteSize)}). IndexedDB writes async — no UI freeze.
        </div>
      )}

      {quotaHit && (
        <div className="hint hint-error">
          <strong>Storage quota exceeded.</strong> Trim large snips, delete old entries, or clear
          the vault from the triage pane.
        </div>
      )}

      {snipsMutation.error && !quotaHit && (
        <div className="hint hint-error">Save failed: {snipsMutation.error.message}</div>
      )}

      {savedNote && <div className="hint hint-ok">{savedNote}</div>}

      <button
        type="button"
        className="save-btn"
        onClick={() => void onSave()}
        disabled={!canSave}
      >
        {snipsMutation.status === "pending" ? "Saving…" : `Save snip (${formatBytes(byteSize)})`}
      </button>
    </section>
  );
}

function autoTitle(body: string): string {
  const first = body.split("\n").find((l) => l.trim().length > 0);
  if (!first) return "Untitled";
  const cleaned = first.replace(/^#+\s*/, "").trim();
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned || "Untitled";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
