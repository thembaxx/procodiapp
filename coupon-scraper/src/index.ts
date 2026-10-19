import type { Coupon, ScrapeJob, ScrapeTarget } from "./types";
import { scrapeTargetPuppeteer } from "./puppeteer-scraper";

interface Env {
  DB: D1Database;
  BROWSER: Fetcher & { quickAction(action: string, options: unknown): Promise<Response> };
  SCRAPE_QUEUE: Queue<ScrapeJob>;
  API_KEY?: string;
  ENABLED_MERCHANTS?: string;
}

const SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    merchant: "Clicks",
    url: "https://www.clicks.co.za/promotions",
    selectors: [
      ".promotion-card",
      ".product-card",
      ".special-offer",
      "[class*='promo']",
      ".clubcard-deal",
    ],
  },
  {
    merchant: "SPAR",
    url: "https://www.spar.co.za/specials",
    selectors: [
      ".specials-item",
      ".promo-card",
      ".product-tile",
      ".offer-card",
      "[class*='special']",
    ],
  },
  {
    merchant: "Dis-Chem",
    url: "https://www.dischem.com/specials",
    selectors: [
      ".product-item",
      ".promo-card",
      ".special-offer",
      "[class*='product-card']",
      "[class*='promo']",
    ],
  },
];

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function enabledTargetIndices(env: Env): number[] {
  // Server-wide selection. A blank setting enables the full catalogue.
  const configured = env.ENABLED_MERCHANTS?.trim();
  const allowed = configured
    ? new Set(
        configured
          .split(",")
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
  return SCRAPE_TARGETS.flatMap((target, index) =>
    !allowed || allowed.has(target.merchant.toLowerCase()) ? [index] : [],
  );
}
async function enqueueAll(env: Env): Promise<number> {
  const indices = enabledTargetIndices(env);
  if (indices.length)
    await env.SCRAPE_QUEUE.sendBatch(indices.map((index) => ({ body: { index } })));
  return indices.length;
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("scrape scheduled", controller.cron, controller.scheduledTime);
    ctx.waitUntil(enqueueAll(env));
  },
  async queue(batch: MessageBatch<ScrapeJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const index = message.body?.index;
      const target = Number.isInteger(index) ? SCRAPE_TARGETS[index] : undefined;
      if (!target || !enabledTargetIndices(env).includes(index)) {
        console.warn("disabled or invalid scrape job", index);
        message.ack();
        continue;
      }
      try {
        const coupons = await scrapeTarget(env, target);
        const stored = await storeCoupons(env, coupons);
        console.log("scrape result", target.merchant, { extracted: coupons.length, stored });
        message.ack();
      } catch (error) {
        console.error(
          "scrape failed",
          target.merchant,
          error instanceof Error ? error.message : "unknown",
        );
        message.retry();
      }
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ ok: true, time: new Date().toISOString() });
      }
      if (url.pathname === "/api/coupons" && request.method === "GET") {
        const merchant = url.searchParams.get("merchant");
        const active = url.searchParams.get("active");
        const parsedLimit = Number(url.searchParams.get("limit") ?? "100");
        const limit = Number.isFinite(parsedLimit)
          ? Math.max(1, Math.min(500, Math.trunc(parsedLimit)))
          : 100;
        const clauses: string[] = [];
        const args: (string | number)[] = [];
        if (merchant) {
          clauses.push("merchant = ?");
          args.push(merchant);
        }
        if (active === "true")
          clauses.push("active = 1 AND (expires_at IS NULL OR expires_at >= ?)");
        if (active === "true") args.push(new Date().toISOString().slice(0, 10));
        const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
        const result = await env.DB.prepare(
          "SELECT * FROM coupons" + where + " ORDER BY found_at DESC LIMIT ?",
        )
          .bind(...args, limit)
          .all<Coupon>();
        return json({ count: result.results.length, coupons: result.results });
      }
      const match = url.pathname.match(/^\/api\/coupons\/([^/]+)$/);
      if (match && request.method === "GET") {
        const coupon = await env.DB.prepare("SELECT * FROM coupons WHERE id = ?")
          .bind(decodeURIComponent(match[1]))
          .first<Coupon>();
        return coupon ? json({ coupon }) : json({ error: "not found" }, 404);
      }
      if (url.pathname === "/api/scrape" && request.method === "POST") {
        // Fail closed: an unset secret never opens the endpoint to the public.
        if (!env.API_KEY || request.headers.get("Authorization") !== "Bearer " + env.API_KEY) {
          return json({ error: "unauthorized" }, 401);
        }
        return json({ ok: true, enqueued: await enqueueAll(env) }, 202);
      }
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error("api failure", error instanceof Error ? error.message : "unknown");
      return json({ error: "internal server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env, ScrapeJob>;

async function scrapeTarget(env: Env, target: ScrapeTarget): Promise<Coupon[]> {
  const now = new Date().toISOString();
  if (target.usePuppeteer) return scrapeTargetPuppeteer(env, target, parseCouponText, now);
  const response = await env.BROWSER.quickAction("scrape", {
    url: target.url,
    gotoOptions: { waitUntil: "networkidle2" },
    elements: target.selectors.map((selector) => ({ selector })),
  });
  if (!response.ok) throw new Error("browser scrape returned " + response.status);
  const data: unknown = await response.json();
  if (!isRecord(data) || data.success !== true || !Array.isArray(data.result)) {
    throw new Error("unexpected browser scrape response");
  }
  const coupons = new Map<string, Coupon>();
  for (const group of data.result) {
    if (!isRecord(group) || !Array.isArray(group.results)) continue;
    for (const item of group.results) {
      if (!isRecord(item) || typeof item.text !== "string") continue;
      for (const coupon of await parseCouponText(
        item.text.trim(),
        target.merchant,
        target.url,
        now,
      )) {
        coupons.set(coupon.id, coupon);
      }
    }
  }
  return [...coupons.values()];
}

async function parseCouponText(
  text: string,
  merchant: string,
  sourceUrl: string,
  now: string,
): Promise<Coupon[]> {
  if (!text || text.length > 4000) return [];
  const codeMatch = text.match(
    /(?:code|promo(?:\s+code)?|coupon|voucher)[:\s]+([A-Z0-9]{3,20})\b/i,
  );
  const discountMatch = text.match(
    /(?:save\s+R\s?\d+(?:[.,]\d+)?|(?:R\s?\d+(?:[.,]\d+)?|\d+%)\s*(?:off|discount|savings?|special))/i,
  );
  if (!codeMatch && !discountMatch) return [];
  const code = codeMatch ? codeMatch[1].toUpperCase() : null;
  // Relative dates are not persisted as expiry timestamps.
  const isoExpiry =
    text.match(/(?:expires?|valid until|ends?)\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? null;
  const id = await deterministicId(code ?? text, merchant, sourceUrl);
  return [
    {
      id,
      code,
      merchant,
      title: text.slice(0, 200),
      description: text,
      discount: discountMatch?.[0] ?? null,
      source_url: sourceUrl,
      found_at: now,
      expires_at: isoExpiry,
    },
  ];
}
async function deterministicId(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
async function storeCoupons(env: Env, coupons: Coupon[]): Promise<number> {
  if (!coupons.length) return 0;
  const stmt = env.DB.prepare(
    "INSERT OR IGNORE INTO coupons (id, code, merchant, title, description, discount, source_url, found_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
  );
  let stored = 0;
  for (const c of coupons) {
    const result = await stmt
      .bind(
        c.id,
        c.code,
        c.merchant,
        c.title,
        c.description,
        c.discount,
        c.source_url,
        c.found_at,
        c.expires_at,
      )
      .run();
    stored += result.meta.changes ?? 0;
  }
  return stored;
}
