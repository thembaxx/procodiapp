// The production build replaces these placeholders with immutable build assets.
const VERSION = "__GROCERY_BUILD__";
const PRECACHE = JSON.parse("__GROCERY_ASSETS__");
const PREFIX = "grocery-shell-";
const CACHE = PREFIX + VERSION;

self.addEventListener("install", (event) => {
  // A partial download never replaces a working offline version.
  event.waitUntil(
    (async () => {
      const existed = (await caches.keys()).includes(CACHE);
      try {
        await (await caches.open(CACHE)).addAll(PRECACHE);
      } catch (error) {
        // Failed builds must not displace a valid previous build during cleanup.
        if (!existed) await caches.delete(CACHE);
        throw error;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const previous = (await caches.keys()).filter(
        (key) => key.startsWith(PREFIX) && key !== CACHE,
      );
      // Keep one previous build for tabs that have not opted into the update yet.
      await Promise.all(previous.slice(0, -1).map((key) => caches.delete(key)));
      // Preload can surface network failures before the offline response in
      // Firefox and WebKit. A worker-owned request works across engines.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.disable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

async function cachedAsset(request) {
  const current = await caches.open(CACHE);
  const hit = await current.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const previous = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE);
  for (const key of previous.reverse()) {
    const response = await (await caches.open(key)).match(request, { ignoreSearch: true });
    if (response) return response;
  }
  return fetch(request);
}

async function navigation(event) {
  let timer;
  try {
    const network = fetch(event.request, { cache: "no-store" });
    const response = await Promise.race([
      network,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Connection timed out.")), 4000);
      }),
    ]);
    if (response.ok || response.status < 500) return response;
  } catch {
    // Serve a clean shell, never an old server-rendered promotion document.
  } finally {
    clearTimeout(timer);
  }
  const fallback = await (await caches.open(CACHE)).match("/offline");
  if (!fallback) return Response.error();
  const headers = new Headers(fallback.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  // The worker owns this cache. Avoid caching this document under the live URL.
  headers.set("Cache-Control", "no-store");
  headers.set("X-Grocery-Offline", "1");
  return new Response(fallback.body, { status: 200, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Discovery, reports, RSC payloads and retailer pages always use the network.
  if (request.mode === "navigate" && ["/", "/offline"].includes(url.pathname)) {
    event.respondWith(navigation(event));
  } else if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await (await caches.open(CACHE)).match(request)) || Response.error();
        }
      })(),
    );
  } else if (PRECACHE.includes(url.pathname) && url.pathname !== "/offline") {
    event.respondWith(cachedAsset(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    // Old hashed chunks remain available to an open tab after an update.
    event.respondWith(cachedAsset(request));
  }
});
