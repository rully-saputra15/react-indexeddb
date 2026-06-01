import { useIDB, IDBUnsupportedError } from "react-idb-hooks";
import { snipDb } from "../db";

const LABELS: Record<string, string> = {
  loading: "Connecting…",
  ready: "Ready",
  error: "Error",
  unsupported: "Unsupported",
};

export function ConnectionBadge() {
  const { status, error } = useIDB(snipDb);
  return (
    <span className={`badge badge-${status}`} title={error?.message}>
      <span className="badge-dot" />
      {LABELS[status] ?? status}
    </span>
  );
}

/**
 * Full-width banner shown only when IndexedDB is not available in this
 * browser (Firefox private mode, certain WebViews, very old browsers, SSR).
 * Distinguishes the IDBUnsupportedError class explicitly so users see what
 * the library catches.
 */
export function UnsupportedBanner() {
  const { status, error } = useIDB(snipDb);
  if (status !== "unsupported") return null;
  const isTyped = error instanceof IDBUnsupportedError;
  return (
    <div className="banner banner-unsupported" role="alert">
      <strong>IndexedDB is not available in this browser.</strong> Snip Shelf needs IndexedDB to
      persist data — we caught this as <code>IDBUnsupportedError</code> from <code>useIDB</code>.
      {!isTyped && error && <span className="banner-detail"> ({error.message})</span>}
    </div>
  );
}
