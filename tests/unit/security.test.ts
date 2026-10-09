import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { boundedText } from "../../src/lib/server/bounded-input";
import { clientBucket, reportBody } from "../../src/lib/server/request-guards";
import {
  cleanupExpiredData,
  rateLimitKey,
  readCache,
  saveReport,
  takeRefreshSlot,
} from "../../src/lib/server/storage";
import { allowedUrl, readPublicPage } from "../../src/lib/server/public-pages";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { offerSchema } from "../../src/lib/offers";
import { readOfflineOffers } from "../../src/lib/offline-store";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function localStorageTest(task: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "little-less-security-"));
  vi.stubEnv("DATA_DIR", directory);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  try {
    await task(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("privacy and storage boundaries", () => {
  it("fails safely when browser storage never opens, and closes a late connection", async () => {
    vi.useFakeTimers();
    const request = {
      onsuccess: null as (() => void) | null,
      onerror: null,
      onblocked: null,
      onupgradeneeded: null,
      result: { close: vi.fn() },
    };
    vi.stubGlobal("indexedDB", { open: () => request });
    const result = readOfflineOffers();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBeNull();
    request.onsuccess?.();
    expect(request.result.close).toHaveBeenCalledOnce();
  });
  it("projects only public cache fields and rejects malformed persisted records", async () => {
    await localStorageTest(async (directory) => {
      const cache = {
        offers: sourceSnapshot,
        checks: [],
        mode: "public_pages",
        updatedAt: null,
        privateEmail: "private@test.invalid",
        credential: "test-only-sensitive-value",
      };
      await writeFile(path.join(directory, "offers.json"), JSON.stringify(cache));
      const result = await readCache();
      expect(Object.keys(result).sort()).toEqual(["checks", "mode", "offers", "updatedAt"]);
      expect(JSON.stringify(result)).not.toContain("test-only-sensitive-value");
      await writeFile(
        path.join(directory, "offers.json"),
        JSON.stringify({
          ...cache,
          checks: [{ storeId: "checkers", status: "checked", pages: 999 }],
        }),
      );
      await expect(readCache()).rejects.toThrow();
    });
  });
  it("expires reports, serializes concurrent writes, strips accidental extra fields and uses private permissions", async () => {
    await localStorageTest(async (directory) => {
      const reason = "The offer has ended";
      await writeFile(
        path.join(directory, "reports.jsonl"),
        [
          {
            offer_id: "expired",
            reason,
            created_at: new Date(Date.now() - 31 * 86400000).toISOString(),
          },
          {
            offer_id: "current",
            reason,
            created_at: new Date().toISOString(),
            email: "private@test.invalid",
          },
        ]
          .map((record) => JSON.stringify(record))
          .join("\n") + "\ninvalid-json\n",
      );
      const orphan = path.join(directory, "reports-00000000-0000-0000-0000-000000000001.tmp");
      await writeFile(orphan, "expired orphaned report data");
      const old = new Date(Date.now() - 86400000);
      await utimes(orphan, old, old);
      await writeFile(path.join(directory, "unrelated.tmp"), "operator file");
      await Promise.all([saveReport("first", reason), saveReport("second", reason)]);
      await cleanupExpiredData();
      const text = await readFile(path.join(directory, "reports.jsonl"), "utf8");
      expect(text).not.toMatch(/expired|private@test.invalid|invalid-json/);
      expect(
        text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line).offer_id),
      ).toEqual(["current", "first", "second"]);
      expect((await stat(path.join(directory, "reports.jsonl"))).mode & 0o777).toBe(0o600);
      expect(await readdir(directory)).toEqual(
        expect.arrayContaining(["reports.jsonl", "unrelated.tmp"]),
      );
      expect(
        (await readdir(directory)).some(
          (name) => name.startsWith("reports-") && name.endsWith(".tmp"),
        ),
      ).toBe(false);
    });
  });
  it("uses secret-keyed daily address identifiers, with a stable shared cost budget", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "unit-test-only-secret-key-not-a-production-key");
    const first = Date.parse("2026-10-08T12:00:00Z"),
      next = first + 86400000;
    const bucket = "refresh:client:203.0.113.9";
    expect(rateLimitKey(bucket, first)).toMatch(/^[a-f0-9]{64}$/);
    expect(rateLimitKey(bucket, first)).not.toBe(rateLimitKey(bucket, next));
    expect(rateLimitKey("discovery:global", first)).toBe(rateLimitKey("discovery:global", next));
    const before = rateLimitKey(bucket, first);
    vi.stubEnv("RATE_LIMIT_SECRET", "a-different-unit-test-secret-key-value");
    expect(rateLimitKey(bucket, first)).not.toBe(before);
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => rateLimitKey(bucket)).toThrow("strong rate-limit secret");
  });
  it("shares a ten-minute cost budget across attempts and bounds the distributed window", async () => {
    await localStorageTest(async () => {
      vi.stubEnv("RATE_LIMIT_SECRET", "unit-test-only-cost-budget-secret-value");
      expect(await takeRefreshSlot("discovery:global", 600)).toBe(0);
      expect(await takeRefreshSlot("discovery:global", 600)).toBe(600);
      await expect(takeRefreshSlot("unbounded", 601)).rejects.toThrow("Invalid rate-limit window");
    });
  });
});

describe("hostile input and source boundaries", () => {
  it("does not treat arbitrary forwarding text as a trusted address, and canonicalizes IPv6", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    const request = (address: string) =>
      new Request("https://grocery.example", { headers: { "x-forwarded-for": address } });
    expect(clientBucket(request("discovery:global"))).toBe("unknown");
    expect(clientBucket(request("fe80::1%eth0"))).toBe("unknown");
    expect(clientBucket(request("203.0.113.9, 127.0.0.1"))).toBe("203.0.113.9");
    expect(clientBucket(request("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe("2001:db8::1");
  });
  it("stops a never-ending body without waiting for an uncooperative cancellation hook", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const result = boundedText({ body, headers: new Headers() }, 100, 1000);
    const assertion = expect(result).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("returns a request timeout for a slow report body", async () => {
    vi.useFakeTimers();
    const request = new Request("https://grocery.example/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>(),
      duplex: "half",
    } as RequestInit);
    const result = reportBody(request);
    const assertion = expect(result).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
  it("rejects unreviewed subdomains, private hosts, non-HTTPS and cross-store records", () => {
    for (const url of [
      "https://unreviewed.checkers.co.za",
      "https://127.0.0.1",
      "https://[::1]",
      "https://169.254.169.254",
      "https://checkers.co.za.attacker.example",
      "https://checkers.co.za:8443",
      "http://checkers.co.za",
    ])
      expect(allowedUrl(url), url).toBe(false);
    expect(allowedUrl("https://www.checkers.co.za")).toBe(true);
    for (const sourceUrl of [
      "https://attacker.example",
      "https://www.pnp.co.za",
      "javascript:alert(1)",
    ])
      expect(offerSchema.safeParse({ ...sourceSnapshot[0], sourceUrl }).success).toBe(false);
  });
  it("refuses source redirects before requesting a new target", async () => {
    const fetch = vi.fn(async (url: string) =>
      String(url).endsWith("/robots.txt")
        ? new Response("User-agent: *\nAllow: /", { headers: { "Content-Type": "text/plain" } })
        : new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/private" } }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(readPublicPage("https://spar2u.co.za/test-only")).rejects.toThrow("redirected");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("127.0.0.1"))).toBe(false);
  });
  it("validates database origins before forwarding credentials and disables redirects", async () => {
    vi.stubEnv("SUPABASE_URL", "http://storage.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only");
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json([{ data: { offers: [], updatedAt: null, checks: [], mode: "public_pages" } }]),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(readCache()).rejects.toThrow("HTTPS origin");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("SUPABASE_URL", "https://storage.example");
    await readCache();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
});
