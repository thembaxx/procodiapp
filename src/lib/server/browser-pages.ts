import { chromium } from "@playwright/test";
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
    await page.waitForTimeout(700);
    signal.throwIfAborted();
    const html = await page.content();
    if (Buffer.byteLength(html, "utf8") > 2_500_000)
      throw new Error("Browser page exceeded the size limit.");
    const text = stripHtml(html);
    if (
      text.length < 100 ||
      /access denied|verify you are human|captcha|enable javascript to continue/i.test(text)
    )
      throw new Error("Browser did not yield a readable public page.");
    return { url, text, html };
  } finally {
    await browser.close();
  }
}
