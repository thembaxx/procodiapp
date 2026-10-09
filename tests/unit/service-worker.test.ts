import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = {
  request?: { url: string; method: string; mode: string };
  respondWith?: (response: Promise<Response>) => void;
  waitUntil?: (task: Promise<unknown>) => void;
};

function worker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const current = {
    match: vi.fn().mockResolvedValue(undefined),
    addAll: vi.fn().mockResolvedValue(undefined),
  };
  const previous = { match: vi.fn().mockResolvedValue(undefined) };
  const fetch = vi.fn().mockResolvedValue(new Response("network"));
  const storage = {
    open: vi.fn(async (key: string) => (key === "grocery-shell-test-new" ? current : previous)),
    keys: vi
      .fn()
      .mockResolvedValue([
        "grocery-shell-v1",
        "unrelated-cache",
        "grocery-shell-v2",
        "grocery-shell-test-new",
      ]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const self = {
    location: { origin: "https://grocery.test" },
    registration: { navigationPreload: { disable: vi.fn().mockResolvedValue(undefined) } },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (name: string, handler: (event: WorkerEvent) => void) =>
      listeners.set(name, handler),
  };
  const source = readFileSync(new URL("../../src/service-worker.js", import.meta.url), "utf8")
    .replace('"__GROCERY_BUILD__"', '"test-new"')
    .replace(
      '"__GROCERY_ASSETS__"',
      JSON.stringify(JSON.stringify(["/offline", "/_next/static/chunks/core.js"])),
    );
  runInNewContext(source, {
    self,
    caches: storage,
    fetch,
    URL,
    Response,
    Headers,
    Promise,
    setTimeout,
    clearTimeout,
  });
  async function navigation(path = "/") {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url: `https://grocery.test${path}`, method: "GET", mode: "navigate" },
      respondWith: (value) => {
        response = value;
      },
    });
    return response!;
  }
  return { listeners, current, previous, fetch, storage, self, navigation };
}

describe("offline service worker", () => {
  it("uses the clean offline shell on network failure or a server outage", async () => {
    for (const unavailable of ["offline", "server"]) {
      const app = worker();
      app.current.match.mockResolvedValue(new Response("clean offline shell"));
      if (unavailable === "offline") app.fetch.mockRejectedValue(new TypeError("Offline"));
      else app.fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
      const response = await app.navigation("/?filter=free_delivery");
      expect(await response.text()).toBe("clean offline shell");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(app.current.match).toHaveBeenCalledWith("/offline");
    }
  });

  it("preserves real HTTP errors instead of replacing them with stale documents", async () => {
    const app = worker();
    app.fetch.mockResolvedValue(new Response("not found", { status: 404 }));
    const response = await app.navigation();
    expect(response.status).toBe(404);
    expect(app.current.match).not.toHaveBeenCalled();
  });

  it("never intercepts discovery, reports, RSC payloads or external sites", () => {
    const app = worker();
    for (const request of [
      { url: "https://grocery.test/api/refresh", method: "POST", mode: "cors" },
      { url: "https://grocery.test/api/report", method: "POST", mode: "cors" },
      { url: "https://grocery.test/api/offers", method: "GET", mode: "cors" },
      { url: "https://grocery.test/?_rsc=123", method: "GET", mode: "cors" },
      { url: "https://retailer.test/", method: "GET", mode: "navigate" },
    ]) {
      const respondWith = vi.fn();
      app.listeners.get("fetch")!({ request, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it("keeps the previous build and leaves unrelated caches alone", async () => {
    const app = worker();
    let activation: Promise<unknown> | undefined;
    app.listeners.get("activate")!({
      waitUntil: (value) => {
        activation = value;
      },
    });
    await activation;
    expect(app.storage.delete.mock.calls).toEqual([["grocery-shell-v1"]]);
    expect(app.self.clients.claim).toHaveBeenCalledOnce();
  });

  it("serves an older hashed chunk to an open tab after activation", async () => {
    const app = worker();
    app.previous.match.mockResolvedValue(new Response("previous chunk"));
    let response: Promise<Response> | undefined;
    app.listeners.get("fetch")!({
      request: {
        url: "https://grocery.test/_next/static/chunks/old.js",
        method: "GET",
        mode: "cors",
      },
      respondWith: (value) => {
        response = value;
      },
    });
    expect(await (await response!).text()).toBe("previous chunk");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("does not activate an incomplete download", async () => {
    const app = worker();
    app.storage.keys.mockResolvedValue(["grocery-shell-v1"]);
    app.current.addAll.mockRejectedValue(new Error("Missing asset"));
    let installation: Promise<unknown> | undefined;
    app.listeners.get("install")!({
      waitUntil: (value) => {
        installation = value;
      },
    });
    await expect(installation).rejects.toThrow("Missing asset");
    expect(app.self.skipWaiting).not.toHaveBeenCalled();
    expect(app.storage.delete.mock.calls).toEqual([["grocery-shell-test-new"]]);
  });
});
