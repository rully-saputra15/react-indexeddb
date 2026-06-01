import { useState } from "react";
import { useIDBMutation } from "react-idb-hooks";
import { snipDb, type Snip, type Attachment, type VaultMeta } from "./db";
import { Treemap } from "./components/Treemap";
import { CapturePane } from "./components/CapturePane";
import { TriagePane } from "./components/TriagePane";
import { ConnectionBadge, UnsupportedBanner } from "./components/ConnectionBadge";
import { VaultMeter } from "./components/VaultMeter";
import { loadDemoDataset } from "./seed";

export function App() {
  const [selected, setSelected] = useState<Snip | null>(null);
  const [seedProgress, setSeedProgress] = useState<number | null>(null);

  const snipsMutation = useIDBMutation(snipDb, "snips");
  const attachmentsMutation = useIDBMutation(snipDb, "attachments");
  const metaMutation = useIDBMutation(snipDb, "meta");

  const onLoadDemo = async (): Promise<void> => {
    setSeedProgress(0);
    try {
      await loadDemoDataset(
        (s: Snip) => snipsMutation.mutate({ type: "put", value: s }),
        (a: Attachment) => attachmentsMutation.mutate({ type: "put", value: a }),
        (m: VaultMeta) => metaMutation.mutate({ type: "put", value: m }),
        setSeedProgress,
      );
    } finally {
      setSeedProgress(null);
    }
  };

  return (
    <div className="app">
      <UnsupportedBanner />

      <header className="app-header">
        <div className="title-block">
          <h1>Snip Shelf</h1>
          <span className="subtitle">
            offline · reactive · cross-tab · 2.4 KB <code>react-idb-hooks</code>
          </span>
        </div>
        <div className="header-right">
          <VaultMeter />
          <ConnectionBadge />
          <button
            type="button"
            className="demo-btn"
            onClick={() => void onLoadDemo()}
            disabled={seedProgress !== null}
          >
            {seedProgress === null
              ? "Load demo dataset"
              : `Loading… ${Math.round(seedProgress * 100)}%`}
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="treemap-col">
          <Treemap onSelect={setSelected} selectedId={selected?.id ?? null} />
          <Legend />
        </div>
        <div className="side-col">
          <CapturePane />
          <TriagePane selectedId={selected?.id ?? null} onSelect={setSelected} />
        </div>
      </main>

      {selected && <SnipDetail snip={selected} onClose={() => setSelected(null)} />}

      <footer className="app-footer">
        Open this page in two browser tabs side-by-side. Capture in one, triage in the other —
        both stay in sync via <code>BroadcastChannel</code>, no extra code required.
      </footer>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span className="legend-item">
        <span className="legend-dot legend-text" /> text
      </span>
      <span className="legend-item">
        <span className="legend-dot legend-json" /> json
      </span>
      <span className="legend-item">
        <span className="legend-dot legend-markdown" /> markdown
      </span>
      <span className="legend-spacer" />
      <span className="legend-hint">tile size = byte count</span>
    </div>
  );
}

interface SnipDetailProps {
  snip: Snip;
  onClose: () => void;
}

function SnipDetail({ snip, onClose }: SnipDetailProps) {
  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <span className={`type-dot type-dot-${snip.contentType}`} />
          <h3>{snip.title}</h3>
          <span className="detail-meta">
            {formatBytes(snip.byteSize)} · {snip.contentType}
          </span>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <pre className="detail-body">{snip.body}</pre>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
