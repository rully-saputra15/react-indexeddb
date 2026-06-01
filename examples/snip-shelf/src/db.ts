import { defineIDB, type Database } from "react-idb-hooks";

export type ContentType = "text" | "json" | "markdown";

export interface Snip {
  id: string;
  title: string;
  body: string;
  contentType: ContentType;
  tags: string[];
  byteSize: number;
  createdAt: number;
  updatedAt: number;
}

export interface Attachment {
  id: string;
  snipId: string;
  blob: Blob;
  mime: string;
}

export interface VaultMeta {
  key: "vault";
  totalBytes: number;
  snipCount: number;
  attachmentCount: number;
  attachmentBytes: number;
}

export interface SnipSchema {
  snips: {
    value: Snip;
    key: string;
    indexes: { byUpdated: number; byType: string };
  };
  attachments: {
    value: Attachment;
    key: string;
    indexes: { bySnip: string };
  };
  meta: {
    value: VaultMeta;
    key: "vault";
  };
}

/**
 * defineIDB v2.
 *
 * v1 (oldVersion < 1): create `snips` (with `byUpdated` index) and `meta`.
 * v2 (oldVersion < 2): add `byType` index to `snips`, create `attachments`
 *                      with the `bySnip` index.
 *
 * Both upgrade steps are intentionally synchronous IDB API calls. The
 * `upgrade` callback runs inside a versionchange transaction; await-ing a
 * foreign promise here would let the tx auto-commit and the schema would
 * not be applied. See docs/build-plan.html#tx-contract.
 */
export const snipDb: Database<SnipSchema> = defineIDB<SnipSchema>({
  name: "react-idb-hooks-snip-shelf",
  version: 2,
  upgrade({ db, oldVersion, tx }) {
    if (oldVersion < 1) {
      const snips = db.createObjectStore("snips", { keyPath: "id" });
      snips.createIndex("byUpdated", "updatedAt");
      db.createObjectStore("meta", { keyPath: "key" });
    }
    if (oldVersion < 2) {
      tx.objectStore("snips").createIndex("byType", "contentType");
      const attachments = db.createObjectStore("attachments", { keyPath: "id" });
      attachments.createIndex("bySnip", "snipId");
    }
  },
});

/**
 * Recompute and persist `meta` from the current snips + attachments.
 *
 * Cheap: ~150 records max in this demo. Called after every mutation so the
 * vault meter (powered by `useIDBQuery(db.get('meta', 'vault'))`) stays
 * consistent without requiring a second mutation point at every write site.
 */
export async function recomputeVaultMeta(): Promise<VaultMeta> {
  const [snips, attachments] = await Promise.all([
    snipDb.getAll("snips"),
    snipDb.getAll("attachments"),
  ]);
  const totalBytes = snips.reduce((sum, s) => sum + s.byteSize, 0);
  const attachmentBytes = attachments.reduce((sum, a) => sum + a.blob.size, 0);
  const meta: VaultMeta = {
    key: "vault",
    totalBytes,
    snipCount: snips.length,
    attachmentCount: attachments.length,
    attachmentBytes,
  };
  return meta;
}
