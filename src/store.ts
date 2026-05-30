/**
 * The reactivity layer.
 *
 * Holds per-channel version counters and listener sets. A "channel" is just
 * a string identifier - the hooks layer uses object-store names. When a
 * channel is `notify()`d, every listener subscribed to that channel fires
 * and the channel's version increments.
 *
 * This file is intentionally framework-agnostic. It MUST NOT import React,
 * the IndexedDB API, or `crossTab.ts`. That separation is what makes the
 * library testable in isolation.
 */

export interface ReactivityStore {
  /**
   * Subscribe `listener` to the union of `channels`. The listener fires
   * whenever any one of those channels is notified.
   *
   * Returns an unsubscribe function.
   */
  subscribe(channels: ReadonlyArray<string>, listener: () => void): () => void;

  /**
   * Returns a number that is stable across calls until any of the given
   * `channels` is notified, at which point it strictly increases.
   *
   * Suitable as the snapshot for `useSyncExternalStore`: identical numeric
   * value compares equal via `Object.is`, so React skips re-rendering.
   */
  getVersion(channels: ReadonlyArray<string>): number;

  /**
   * Bump the version of every listed channel and fan out to every listener
   * subscribed to any of them. Each unique listener fires at most once per
   * `notify` call, even if it subscribed to multiple of the listed channels.
   */
  notify(channels: ReadonlyArray<string>): void;
}

export function createReactivityStore(): ReactivityStore {
  const versions = new Map<string, number>();
  const listeners = new Map<string, Set<() => void>>();

  const versionOf = (channel: string): number => versions.get(channel) ?? 0;

  return {
    subscribe(channels, listener) {
      for (const channel of channels) {
        let set = listeners.get(channel);
        if (!set) {
          set = new Set();
          listeners.set(channel, set);
        }
        set.add(listener);
      }
      return () => {
        for (const channel of channels) {
          const set = listeners.get(channel);
          if (!set) continue;
          set.delete(listener);
          if (set.size === 0) listeners.delete(channel);
        }
      };
    },

    getVersion(channels) {
      let sum = 0;
      for (const channel of channels) sum += versionOf(channel);
      return sum;
    },

    notify(channels) {
      const fired = new Set<() => void>();
      for (const channel of channels) {
        versions.set(channel, versionOf(channel) + 1);
        const set = listeners.get(channel);
        if (!set) continue;
        for (const l of set) fired.add(l);
      }
      for (const l of fired) {
        try {
          l();
        } catch {
          // Listeners must not throw. Swallow to avoid breaking siblings.
        }
      }
    },
  };
}
