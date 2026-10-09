import { createServer, request } from "node:http";
import { test as base } from "@playwright/test";

type Connection = {
  url: string;
  setOnline: (online: boolean) => Promise<void>;
  mockRefresh: (payload: unknown) => void;
};

// Drop real network connections at an isolated origin. Browser-level offline
// emulation does not consistently cover worker-owned requests in every engine.
export const test = base.extend<{ connection: Connection }>({
  connection: async ({ baseURL, page }, use) => {
    const target = new URL(baseURL!);
    let online = true;
    let refreshResponse: string | null = null;
    const server = createServer((incoming, response) => {
      if (!online) {
        incoming.socket.destroy();
        return;
      }
      if (incoming.method === "POST" && incoming.url === "/api/refresh" && refreshResponse) {
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        response.end(refreshResponse);
        incoming.resume();
        return;
      }
      const upstream = request(
        {
          hostname: target.hostname,
          port: target.port,
          path: incoming.url,
          method: incoming.method,
          headers: { ...incoming.headers, host: target.host },
        },
        (result) => {
          response.writeHead(result.statusCode!, result.headers);
          result.pipe(response);
        },
      );
      upstream.on("error", () => {
        response.destroy();
      });
      incoming.pipe(upstream);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test origin unavailable.");
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "onLine", {
        get: () => sessionStorage.getItem("test-connectivity") !== "offline",
        configurable: true,
      });
    });
    try {
      await use({
        url: `http://127.0.0.1:${address.port}`,
        mockRefresh: (payload) => {
          refreshResponse = JSON.stringify(payload);
        },
        setOnline: async (value) => {
          online = value;
          await page.evaluate((connected) => {
            sessionStorage.setItem("test-connectivity", connected ? "online" : "offline");
            window.dispatchEvent(new Event(connected ? "online" : "offline"));
          }, value);
        },
      });
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  },
});
