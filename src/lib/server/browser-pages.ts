import { chromium } from "@playwright/test";
import { load } from "cheerio";
import { allowedUrl } from "../source-urls";
import { ensureRobotsAllowed, stripHtml, type PublicDocument } from "./public-pages";

/**
 * Deliberately not a stealth browser. Only used on explicitly permitted public
 * retailer pages that need JavaScript to render. Never bypass a challenge.
 */
export async function readBrowserDocument(
  url: string,
  signal: AbortSignal,
): Promise<PublicDocument> {
  if (!allowedUrl(url)) throw new Error("Unsupported browser source.");
  await ensureRobotsAllowed(url, signal);
  signal.throwIfAborted();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: "block" });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const destination = request.url();
      if (
        /^(?:file|ftp|data|javascript):/i.test(destination) ||
        ["image", "font", "media"].includes(request.resourceType())
      ) {
        await route.abort();
      } else {
        await route.continue();
      }
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    if (!response || !response.ok() || response.url() !== url || !allowedUrl(page.url()))
      throw new Error("Browser page was unavailable or redirected.");
    // CMS content arrives after the shell. Background trackers can prevent idle,
    // so take a bounded snapshot after eight seconds if requests never settle.
    const deadline = Date.now() + 8000;
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    for (;;) {
      signal.throwIfAborted();
      if (page.url() !== url) throw new Error("Browser page was redirected.");
      const html = await page.content();
      signal.throwIfAborted();
      if (Buffer.byteLength(html, "utf8") > 2_500_000)
        throw new Error("Browser page exceeded the size limit.");
      const text = stripHtml(html);
      if (/access denied|verify you are human|captcha|page not found/i.test(text))
        throw new Error("Browser did not yield a readable public page.");
      // A hydrated header is not evidence that the retailer's content has loaded.
      const $ = load(html);
      $("header").remove();
      const main = $("main, [role=main]");
      const content = stripHtml(main.length ? main.toString() : $.html());
      if (content.length >= 100 && !/enable javascript to continue/i.test(content))
        return { url, text, html };
      // Network idle can precede a later hydration request; share its deadline.
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Browser did not yield a readable public page.");
      await page.waitForTimeout(Math.min(200, remaining));
    }
  } finally {
    await browser.close();
  }
}
