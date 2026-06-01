import { snipDb, recomputeVaultMeta, type Snip, type Attachment, type ContentType } from "./db";

const TYPES: ContentType[] = ["text", "json", "markdown"];

const TAG_POOL = [
  "logs",
  "incident",
  "config",
  "research",
  "todo",
  "snippet",
  "draft",
  "important",
  "client-a",
  "client-b",
  "infra",
  "kafka",
  "redis",
  "auth",
  "billing",
];

const TITLE_PARTS = [
  "Stack trace",
  "Slow query",
  "Cron output",
  "Daily standup",
  "Onboarding doc",
  "Webhook payload",
  "Postmortem",
  "Outage notes",
  "API response",
  "Refactor plan",
  "Deploy log",
  "Migration draft",
  "Edge case",
  "Bug repro",
  "Cluster diff",
];

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function randomTags(r: () => number): string[] {
  const n = Math.floor(r() * 3);
  const out = new Set<string>();
  for (let i = 0; i < n; i++) out.add(pick(TAG_POOL, r));
  return [...out];
}

function bodyOfSize(targetBytes: number, type: ContentType, r: () => number): string {
  if (type === "json") {
    const rows = Math.max(1, Math.floor(targetBytes / 80));
    const records = Array.from({ length: rows }, (_, i) => ({
      id: i,
      ts: Date.now() - Math.floor(r() * 1e8),
      level: pick(["info", "warn", "error"], r),
      message: lorem(8, r),
      meta: { service: pick(["api", "worker", "scheduler"], r), region: pick(["us", "eu", "ap"], r) },
    }));
    return JSON.stringify(records, null, 2);
  }
  if (type === "markdown") {
    const sections = Math.max(2, Math.floor(targetBytes / 240));
    const out: string[] = [];
    for (let i = 0; i < sections; i++) {
      out.push(`## ${lorem(4, r)}\n\n${lorem(40, r)}\n`);
    }
    return out.join("\n");
  }
  const lines = Math.max(2, Math.floor(targetBytes / 80));
  return Array.from({ length: lines }, () => lorem(12, r)).join("\n");
}

function lorem(words: number, r: () => number): string {
  const pool = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
    "sed",
    "do",
    "eiusmod",
    "tempor",
    "incididunt",
    "ut",
    "labore",
    "et",
    "dolore",
    "magna",
    "aliqua",
  ];
  return Array.from({ length: words }, () => pick(pool, r)).join(" ");
}

async function makeThumbnail(label: string, hue: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = `hsl(${hue}, 60%, 22%)`;
  ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(20, 20 + i * 28, 280 - i * 32, 18);
  }
  ctx.fillStyle = "white";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText(label, 20, 180);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/**
 * Bulk-load ~150 synthesized snips totalling ~3 MB and ~10 PNG thumbnails as
 * Blob attachments. Each `mutate` is a one-shot transaction; the bulk load
 * trades atomicity for clarity (no public `transaction()` API yet). For ~150
 * records the cost is negligible and demonstrates the library at scale.
 */
export async function loadDemoDataset(
  putSnip: (s: Snip) => Promise<void>,
  putAttachment: (a: Attachment) => Promise<void>,
  putMeta: (m: Awaited<ReturnType<typeof recomputeVaultMeta>>) => Promise<void>,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const r = rng(20260601);
  const snipCount = 150;
  const now = Date.now();

  for (let i = 0; i < snipCount; i++) {
    const type = pick(TYPES, r);
    // Distribution: most small, a few big. ~3 MB total.
    const target =
      i % 17 === 0
        ? 80 * 1024 + Math.floor(r() * 40 * 1024)
        : Math.floor(r() * 18 * 1024) + 256;
    const body = bodyOfSize(target, type, r);
    const byteSize = new TextEncoder().encode(body).length;
    const updatedAt = now - Math.floor(r() * 21 * 24 * 60 * 60 * 1000);
    const snip: Snip = {
      id: crypto.randomUUID(),
      title: `${pick(TITLE_PARTS, r)} #${i + 1}`,
      body,
      contentType: type,
      tags: randomTags(r),
      byteSize,
      createdAt: updatedAt,
      updatedAt,
    };
    await putSnip(snip);

    if (i % 15 === 0) {
      const blob = await makeThumbnail(snip.title, Math.floor(r() * 360));
      if (blob) {
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          snipId: snip.id,
          blob,
          mime: "image/png",
        };
        await putAttachment(attachment);
      }
    }
    if (onProgress && i % 5 === 0) onProgress(i / snipCount);
  }

  const meta = await recomputeVaultMeta();
  await putMeta(meta);
  onProgress?.(1);
}

// Re-export for callers that just want to read the snipDb directly without
// importing both module paths.
export { snipDb };
