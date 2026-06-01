import { useMemo, useRef, useEffect, useState } from "react";
import { useIDBQuery } from "react-idb-hooks";
import { snipDb, type ContentType, type Snip } from "../db";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Tile<T> {
  item: T;
  value: number;
}

interface LayoutTile<T> extends Rect {
  item: T;
  value: number;
}

/**
 * Squarified treemap layout (Bruls, Huijing, van Wijk 1999).
 *
 * Recursively groups the largest remaining items into a row in the short
 * dimension of the remaining rect, balancing aspect ratios. Returns absolute
 * rectangles sized to `bounds`. ~60 LOC, no dependencies.
 */
function squarify<T>(items: Tile<T>[], bounds: Rect): LayoutTile<T>[] {
  if (items.length === 0 || bounds.w <= 0 || bounds.h <= 0) return [];
  const total = items.reduce((s, t) => s + t.value, 0);
  if (total <= 0) return [];

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const scale = (bounds.w * bounds.h) / total;
  const queue = sorted.map((t) => ({ ...t, area: t.value * scale }));

  const out: LayoutTile<T>[] = [];
  let rect = { ...bounds };
  let row: (typeof queue)[number][] = [];

  const worst = (r: typeof row, side: number): number => {
    if (r.length === 0) return Infinity;
    const sum = r.reduce((s, x) => s + x.area, 0);
    const max = Math.max(...r.map((x) => x.area));
    const min = Math.min(...r.map((x) => x.area));
    const s2 = sum * sum;
    const w2 = side * side;
    return Math.max((w2 * max) / s2, s2 / (w2 * min));
  };

  const placeRow = (r: typeof row): void => {
    const sum = r.reduce((s, x) => s + x.area, 0);
    if (sum <= 0) return;
    const horizontal = rect.w >= rect.h;
    if (horizontal) {
      const stripW = sum / rect.h;
      let y = rect.y;
      for (const t of r) {
        const h = t.area / stripW;
        out.push({ x: rect.x, y, w: stripW, h, item: t.item, value: t.value });
        y += h;
      }
      rect = { x: rect.x + stripW, y: rect.y, w: rect.w - stripW, h: rect.h };
    } else {
      const stripH = sum / rect.w;
      let x = rect.x;
      for (const t of r) {
        const w = t.area / stripH;
        out.push({ x, y: rect.y, w, h: stripH, item: t.item, value: t.value });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + stripH, w: rect.w, h: rect.h - stripH };
    }
  };

  while (queue.length > 0) {
    const next = queue[0]!;
    const side = Math.min(rect.w, rect.h);
    const tentative = [...row, next];
    if (row.length === 0 || worst(tentative, side) <= worst(row, side)) {
      row = tentative;
      queue.shift();
    } else {
      placeRow(row);
      row = [];
    }
  }
  if (row.length > 0) placeRow(row);
  return out;
}

const TYPE_COLORS: Record<ContentType, string> = {
  json: "#f59e0b",
  markdown: "#3b82f6",
  text: "#10b981",
};

interface Size {
  w: number;
  h: number;
}

function useElementSize<E extends HTMLElement>(): [React.RefObject<E>, Size] {
  const ref = useRef<E>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

interface TreemapProps {
  onSelect?: (snip: Snip) => void;
  selectedId?: string | null;
}

export function Treemap({ onSelect, selectedId }: TreemapProps) {
  const { data: snips, status } = useIDBQuery(
    snipDb,
    async (db) => db.getAll("snips"),
    ["snips"],
  );

  const [ref, size] = useElementSize<HTMLDivElement>();

  const tiles = useMemo<LayoutTile<Snip>[]>(() => {
    if (!snips || snips.length === 0 || size.w === 0 || size.h === 0) return [];
    const inputs: Tile<Snip>[] = snips.map((s) => ({
      item: s,
      value: Math.max(s.byteSize, 64),
    }));
    return squarify(inputs, { x: 0, y: 0, w: size.w, h: size.h });
  }, [snips, size.w, size.h]);

  return (
    <div ref={ref} className="treemap" aria-label="Vault treemap">
      {status === "loading" && <div className="treemap-empty">Loading vault…</div>}
      {status === "success" && tiles.length === 0 && (
        <div className="treemap-empty">
          Empty vault. Paste a snip or load the demo dataset to see your shelf fill in.
        </div>
      )}
      {tiles.map((t) => {
        const isSel = selectedId === t.item.id;
        const minSide = Math.min(t.w, t.h);
        return (
          <button
            key={t.item.id}
            type="button"
            onClick={() => onSelect?.(t.item)}
            className={`tile${isSel ? " tile-selected" : ""}`}
            style={{
              left: t.x,
              top: t.y,
              width: t.w,
              height: t.h,
              background: TYPE_COLORS[t.item.contentType],
            }}
            title={`${t.item.title} · ${formatBytes(t.item.byteSize)} · ${t.item.contentType}`}
          >
            {minSide > 56 && (
              <span className="tile-label">
                <span className="tile-title">{t.item.title}</span>
                <span className="tile-size">{formatBytes(t.item.byteSize)}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
