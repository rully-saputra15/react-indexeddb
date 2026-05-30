import { describe, expect, it, vi } from "vitest";
import { createReactivityStore } from "../src/store";

describe("createReactivityStore", () => {
  it("subscribe / notify / unsubscribe lifecycle", () => {
    const store = createReactivityStore();
    const listener = vi.fn();
    const unsub = store.subscribe(["a"], listener);

    store.notify(["a"]);
    expect(listener).toHaveBeenCalledTimes(1);

    store.notify(["b"]); // unrelated channel
    expect(listener).toHaveBeenCalledTimes(1);

    store.notify(["a", "b"]); // both, listener still fires once
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
    store.notify(["a"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("getVersion is stable until a relevant channel is notified", () => {
    const store = createReactivityStore();
    expect(store.getVersion(["a", "b"])).toBe(0);

    store.notify(["c"]);
    expect(store.getVersion(["a", "b"])).toBe(0);

    store.notify(["a"]);
    expect(store.getVersion(["a", "b"])).toBe(1);

    store.notify(["b"]);
    expect(store.getVersion(["a", "b"])).toBe(2);
  });

  it("listeners subscribed to multiple channels fire at most once per notify", () => {
    const store = createReactivityStore();
    const listener = vi.fn();
    store.subscribe(["a", "b"], listener);

    store.notify(["a", "b"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break sibling listeners", () => {
    const store = createReactivityStore();
    const a = vi.fn(() => {
      throw new Error("boom");
    });
    const b = vi.fn();
    store.subscribe(["x"], a);
    store.subscribe(["x"], b);

    store.notify(["x"]);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});
