import puppeteer from "@cloudflare/puppeteer";
import type { Coupon, ScrapeTarget } from "./types";

type Parse = (text: string, merchant: string, url: string, now: string) => Promise<Coupon[]>;

/** Self-contained browser callback: block boundaries must separate prices and discounts. */
export function collectRetailerTexts(elements: Element[]): string[] {
  return elements
    .slice(0, 100)
    .map((element) =>
      (element instanceof HTMLElement
        ? element.getClientRects().length
          ? element.innerText
          : ""
        : element.textContent || ""
      )
        .replace(/\u00a0/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** A selector can exist while a client-rendered card is still empty or hidden. */
export function retailerContentReady(selectors: string[]): boolean {
  return (
    /^not found(?:\s*[|—-]|$)/i.test(document.title.trim()) ||
    selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some((element) =>
        (element instanceof HTMLElement
          ? element.getClientRects().length
            ? element.innerText
            : ""
          : element.textContent || ""
        ).trim(),
      ),
    )
  );
}

export async function scrapeTargetPuppeteer(
  env: { BROWSER: Fetcher },
  target: ScrapeTarget,
  parse: Parse,
  now: string,
): Promise<Coupon[]> {
  const browser = await puppeteer.launch(env.BROWSER);
  const coupons = new Map<string, Coupon>();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) void req.abort();
      else void req.continue();
    });
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (response && !response.ok()) {
      throw new Error("retailer navigation returned " + response.status());
    }
    try {
      await page.waitForFunction(retailerContentReady, { timeout: 15000 }, target.selectors);
    } catch (error) {
      // Distinguish stale retailer selectors from failed page navigation.
      // Avoid logging page contents or raw provider error text.
      if (/waiting for selector|timeout|timed out/i.test(String(error))) {
        throw new Error("retailer selector timeout", { cause: error });
      }
      throw error;
    }
    // SPAs can return HTTP 200 for a removed route. Do not call this an empty
    // scrape or keep retrying the nonexistent page through another provider.
    if (/^not found(?:\s*[|—-]|$)/i.test((await page.title()).trim())) {
      throw new Error("retailer page not found");
    }
    for (let n = 0; n < 3; n++) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a[role='button']"));
        const match = buttons.find((b) =>
          /^(load|show|view|see) more$/i.test((b.textContent || "").trim()),
        );
        if (match instanceof HTMLElement) {
          match.click();
          return true;
        }
        return false;
      });
      if (!clicked) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 500));
    let matchedContent = 0;
    for (const selector of target.selectors) {
      const texts = await page.$$eval(selector, collectRetailerTexts);
      matchedContent += texts.length;
      for (const text of texts) {
        for (const coupon of await parse(text, target.merchant, target.url, now)) {
          coupons.set(coupon.id, coupon);
        }
      }
    }
    if (!matchedContent) throw new Error("retailer selectors matched no readable content");
  } finally {
    await browser.close();
  }
  return [...coupons.values()];
}
