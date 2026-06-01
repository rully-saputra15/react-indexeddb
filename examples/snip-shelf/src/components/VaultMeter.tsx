import { useIDBQuery } from "react-idb-hooks";
import { snipDb, type VaultMeta } from "../db";

const ZERO: VaultMeta = {
  key: "vault",
  totalBytes: 0,
  snipCount: 0,
  attachmentCount: 0,
  attachmentBytes: 0,
};

export function VaultMeter() {
  const { data } = useIDBQuery(
    snipDb,
    async (db): Promise<VaultMeta> => (await db.get("meta", "vault")) ?? ZERO,
    ["meta"],
  );
  const m = data ?? ZERO;
  const total = m.totalBytes + m.attachmentBytes;
  return (
    <div className="vault-meter" aria-label="Vault statistics">
      <span className="meter-primary">{formatBytes(total)}</span>
      <span className="meter-divider">/</span>
      <span className="meter-secondary">{m.snipCount} snips</span>
      {m.attachmentCount > 0 && (
        <>
          <span className="meter-divider">·</span>
          <span className="meter-secondary">{m.attachmentCount} attachments</span>
        </>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
