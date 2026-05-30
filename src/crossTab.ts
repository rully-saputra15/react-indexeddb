/**
 * Cross-tab sync via `BroadcastChannel`.
 *
 * On a successful write, the source tab posts a list of object stores that
 * were touched. Every other tab listening on the same channel name calls
 * the receiver, which the hooks layer wires to `ReactivityStore.notify(...)`.
 *
 * If `BroadcastChannel` is not defined (older browsers, certain WebViews,
 * SSR), `createChannel` returns a no-op channel - cross-tab sync silently
 * degrades but the rest of the library still works. We deliberately do not
 * polyfill via `storage` events: the matrix of corner cases is not worth
 * the bytes for v1.
 *
 * This file MUST NOT import React, the IndexedDB API, or `store.ts`.
 */

const PREFIX = "react-idb-hooks:";

export interface CrossTabMessage {
  /** Names of object stores touched by the originating write. */
  stores: ReadonlyArray<string>;
}

export interface CrossTabChannel {
  /** Send a message to other tabs on the same database name. */
  post(message: CrossTabMessage): void;
  /** Subscribe to messages from other tabs. Returns unsubscribe. */
  onMessage(listener: (message: CrossTabMessage) => void): () => void;
  /** Close the underlying channel (idempotent). */
  close(): void;
}

const NOOP_CHANNEL: CrossTabChannel = {
  post() {},
  onMessage() {
    return () => {};
  },
  close() {},
};

export function createChannel(dbName: string): CrossTabChannel {
  if (typeof BroadcastChannel === "undefined") return NOOP_CHANNEL;

  let bc: BroadcastChannel | null = new BroadcastChannel(PREFIX + dbName);
  const listeners = new Set<(message: CrossTabMessage) => void>();

  bc.onmessage = (event: MessageEvent<CrossTabMessage>) => {
    const message = event.data;
    if (!message || !Array.isArray(message.stores)) return;
    for (const l of listeners) {
      try {
        l(message);
      } catch {

      }
    }
  };

  return {
    post(message) {
      bc?.postMessage(message);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      if (!bc) return;
      bc.onmessage = null;
      bc.close();
      bc = null;
      listeners.clear();
    },
  };
}
