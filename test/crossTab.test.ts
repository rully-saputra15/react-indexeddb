import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannel } from "../src/crossTab";

describe("createChannel", () => {
  describe("when BroadcastChannel is unavailable", () => {
    let original: typeof BroadcastChannel | undefined;
    beforeEach(() => {
      original = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
      delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    });
    afterEach(() => {
      if (original) (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = original;
    });

    it("returns a no-op channel", () => {
      const channel = createChannel("any");
      expect(() => channel.post({ stores: ["x"] })).not.toThrow();
      const unsub = channel.onMessage(() => {
        throw new Error("should never be called");
      });
      unsub();
      channel.close();
    });
  });

  describe("when BroadcastChannel exists", () => {
    let posted: Array<{ name: string; data: unknown }> = [];
    let listeners: Map<string, Array<(e: { data: unknown }) => void>>;
    let originalBC: typeof BroadcastChannel | undefined;

    beforeEach(() => {
      posted = [];
      listeners = new Map();
      originalBC = (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel;
      class FakeBC {
        // Match the shape of the real BroadcastChannel.onmessage closely
        // enough that runtime calls work; precise event typing is not
        // exercised here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        public onmessage: ((this: BroadcastChannel, ev: MessageEvent<any>) => any) | null = null;
        constructor(public readonly name: string) {
          if (!listeners.has(name)) listeners.set(name, []);
          listeners.get(name)!.push((e) => this.onmessage?.call(this as unknown as BroadcastChannel, e as MessageEvent));
        }
        postMessage(data: unknown): void {
          posted.push({ name: this.name, data });
          for (const l of listeners.get(this.name) ?? []) {
            queueMicrotask(() => l({ data }));
          }
        }
        close(): void {
          const arr = listeners.get(this.name);
          if (arr) {
            const idx = arr.findIndex((l) => l === (this.onmessage as unknown));
            if (idx >= 0) arr.splice(idx, 1);
          }
        }
      }
      (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel =
        FakeBC as unknown as typeof BroadcastChannel;
    });
    afterEach(() => {
      if (originalBC) {
        (globalThis as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel = originalBC;
      }
    });

    it("post and onMessage round-trip across two channels with the same dbName", async () => {
      const a = createChannel("app");
      const b = createChannel("app");
      const seen: Array<ReadonlyArray<string>> = [];
      b.onMessage((m) => seen.push(m.stores));

      a.post({ stores: ["todos"] });
      await new Promise((r) => queueMicrotask(() => r(undefined)));
      await new Promise((r) => queueMicrotask(() => r(undefined)));
      expect(seen).toEqual([["todos"]]);
      a.close();
      b.close();
    });

    it("close stops further message delivery on that channel", async () => {
      const a = createChannel("scoped");
      const b = createChannel("scoped");
      const fn = vi.fn();
      b.onMessage(fn);
      b.close();
      a.post({ stores: ["x"] });
      await new Promise((r) => queueMicrotask(() => r(undefined)));
      expect(fn).not.toHaveBeenCalled();
      a.close();
    });
  });
});
