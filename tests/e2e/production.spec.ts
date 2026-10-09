import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sourceSnapshot } from "../../src/lib/snapshot";

const origin = "https://grocery.example";

test("serves canonical metadata, social cards and honest structured data", async ({ page }) => {
  await page.goto("/?design=orbit&filter=discount");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", origin);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    `${origin}/share-image`,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
  const data = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  );
  expect(data["@graph"].map((item: { "@type": string }) => item["@type"])).toEqual([
    "WebSite",
    "WebApplication",
  ]);
  expect(JSON.stringify(data)).not.toMatch(/aggregateRating|priceValidUntil|SearchAction/);
});

test("provides an accurate sitemap, crawler rules and AI discovery text", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(await robots.text()).toContain("Disallow: /api/");
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml.match(/<loc>/g)).toHaveLength(10);
  expect(xml).toContain(`${origin}/stores/checkers`);
  expect(xml).not.toMatch(/design=|filter=|\/offline|\/api\/|lastmod/);
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toContain(`${origin}/promotions.md`);
  const feed = await request.get("/promotions.md");
  expect(feed.headers()["cache-control"]).toContain("no-store");
  const text = await feed.text();
  for (const offer of sourceSnapshot) {
    expect(text).toContain(offer.criteria);
    expect(text).toContain(offer.sourceUrl);
  }
  expect(text).toContain("Review valid until:");
  expect(text).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});

test("exposes store criteria and source links without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/stores/checkers`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Checkers Sixty60");
    await expect(page.getByText(sourceSnapshot[0].criteria, { exact: true })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/stores/checkers`,
    );
    await expect(page.locator(".public-offer time")).toHaveCount(2);
    await expect(page.locator(".public-offer .content-link")).toHaveAttribute(
      "href",
      sourceSnapshot[0].sourceUrl,
    );
    await page.goto(`${baseURL}/stores/pnp`);
    await expect(page.getByText("Nothing confirmed just yet.")).toBeVisible();
    await expect(page.locator(".public-offer")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("information pages work on small screens and pass accessibility checks", async ({ page }) => {
  for (const path of ["/stores", "/stores/checkers", "/about", "/privacy"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations, path).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const response = await page.goto("/page-that-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("isn't on the shelf");
});

test("checks readiness, security headers and safe API failures", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ready" });
  expect(health.headers()["x-robots-tag"]).toContain("noindex");
  const home = await request.get("/");
  expect(home.headers()["content-security-policy"]).toContain("object-src 'none'");
  expect(home.headers()["content-security-policy"]).not.toContain("unsafe-eval");
  const crossOrigin = await request.post("/api/refresh", {
    headers: { Origin: "https://attacker.example" },
  });
  expect(crossOrigin.status()).toBe(403);
  const malformed = await request.post("/api/report", {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: "{",
  });
  expect(malformed.status()).toBe(400);
  const oversized = await request.post("/api/report", {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: "x".repeat(2501),
  });
  expect(oversized.status()).toBe(413);
  expect((await request.get("/api/cron")).status()).toBe(401);
  const image = await request.get("/share-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const png = await image.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
