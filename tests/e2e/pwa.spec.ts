import { expect, type Page } from "@playwright/test";
import { test } from "./network";
import AxeBuilder from "@axe-core/playwright";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { chooseTheme, chooseView, closeSettings, openSettings, waitForApp } from "./helpers";

test.use({ serviceWorkers: "allow" });

async function offlineReady(page: Page) {
  await waitForApp(page);
  await openSettings(page);
  await expect(page.locator(".offline-readiness")).toContainText("Ready offline", {
    timeout: 20000,
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await closeSettings(page);
}

async function readSnapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ data: { offers: { code: string | null }[] } }>((resolve, reject) => {
        const request = indexedDB.open("grocery-device", 1);
        request.onsuccess = () => {
          const database = request.result;
          const value = database.transaction("snapshots").objectStore("snapshots").get("latest");
          value.onsuccess = () => {
            resolve(value.result);
            database.close();
          };
          value.onerror = () => {
            reject(value.error);
            database.close();
          };
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test("has installable icons, launch shortcuts and an uncached worker", async ({
  page,
  context,
  browserName,
  connection,
}) => {
  await page.goto(connection.url);
  await offlineReady(page);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "Little Less",
    short_name: "Little Less",
    start_url: "/",
    display: "standalone",
    scope: "/",
    lang: "en-ZA",
  });
  expect(manifest.shortcuts.map((item: { url: string }) => item.url)).toEqual([
    "/?filter=free_delivery",
    "/?filter=discount",
    "/?saved=1",
  ]);
  for (const [filename, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const) {
    const response = await page.request.get(`/icons/${filename}`);
    const png = await response.body();
    expect(response.headers()["content-type"]).toContain("image/png");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  }
  const response = await page.request.get("/sw.js");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["service-worker-allowed"]).toBe("/");
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    const result = await cdp.send("Page.getInstallabilityErrors");
    // Playwright's isolated contexts are private profiles, where Chrome disables
    // installation. All actual manifest/icon/worker errors must still be absent.
    expect(result.installabilityErrors.filter((error) => error.errorId !== "in-incognito")).toEqual(
      [],
    );
  }
});

test("cold launches offline with copying, saved offers, search and all three views", async ({
  page,
  connection,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const offer = {
    ...sourceSnapshot[0],
    id: "pwa-test-code",
    title: "Test-only offline grocery saving",
    code: "PWA30",
    type: "discount",
    ongoing: false,
    checkedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  connection.mockRefresh({
    offers: [offer],
    updatedAt: new Date().toISOString(),
    checks: [],
    newOfferIds: [],
    mode: "public_pages",
  });
  await page.goto(connection.url);
  await offlineReady(page);
  await page
    .getByRole("button", { name: /Refresh promotions|Find fresh offers/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByText(offer.title, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Save promotion: ${offer.title}` }).click();
  await expect.poll(async () => (await readSnapshot(page))?.data.offers[0]?.code).toBe("PWA30");
  await chooseView(page, "Orbit");
  await chooseTheme(page, "light");
  await connection.setOnline(false);
  const offlineResponse = await page.reload();
  expect(offlineResponse?.headers()["x-grocery-offline"]).toBe("1");
  await waitForApp(page);
  await expect(page.locator(".app")).toHaveClass(/design-orbit/);
  await expect(page.getByRole("complementary", { name: "Offline status" })).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(244, 240, 250)");
  await page.getByRole("searchbox", { name: "Search stores" }).fill("Checkers");
  await expect(page.locator(".store-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: `Unsave promotion: ${offer.title}` }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Copy code PWA30" }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: /Refresh promotions|Find fresh offers/ })
      .filter({ visible: true })
      .first(),
  ).toBeDisabled();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await openSettings(page);
  await expect(page.locator(".offline-readiness")).toContainText("Ready offline");
  await closeSettings(page);
  for (const view of ["Wallet", "Rewards", "Orbit"]) {
    await chooseView(page, view);
    await expect(page.getByText(offer.title, { exact: true })).toBeVisible();
  }
  const storeFallback = await page.goto(`${connection.url}/stores/checkers`);
  expect(storeFallback?.headers()["x-grocery-offline"]).toBe("1");
  await waitForApp(page);
  await expect(page.getByText(offer.title, { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search stores" }).fill("");
  await connection.setOnline(true);
  await expect(page.getByRole("complementary", { name: "Offline status" })).not.toBeVisible();
  await expect(page.getByText(offer.title, { exact: true })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("excludes expired, stale and corrupted offline listings", async ({ page, connection }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(connection.url);
  await offlineReady(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("grocery-device", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("snapshots", "readwrite");
          const store = transaction.objectStore("snapshots");
          const value = store.get("latest");
          value.onsuccess = () => {
            const record = value.result;
            record.data.offers.forEach(
              (offer: { validUntil: string; expiresAt: string | null }, index: number) => {
                if (index % 2) offer.validUntil = new Date(Date.now() - 1000).toISOString();
                else offer.expiresAt = new Date(Date.now() - 1000).toISOString();
              },
            );
            store.put(record, "latest");
          };
          transaction.oncomplete = () => {
            resolve();
            database.close();
          };
          transaction.onerror = () => {
            reject(transaction.error);
            database.close();
          };
        };
      }),
  );
  await connection.setOnline(false);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".store-card.has-offers")).toHaveCount(0);
  await expect(page.locator(".live-number > span")).toHaveText("00");
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("/api/offers");
        return true;
      } catch {
        return false;
      }
    }),
  ).toBe(false);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.open("grocery-device", 1);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("snapshots", "readwrite");
          transaction
            .objectStore("snapshots")
            .put({ data: { offers: ["invalid"] }, savedAt: 1 }, "latest");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".store-card.has-offers")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toBeEnabled();
});

test("lets users defer a real worker update, then reload without losing preferences", async ({
  page,
  connection,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(connection.url);
  await offlineReady(page);
  await chooseView(page, "Orbit");
  await chooseTheme(page, "light");
  await page
    .getByRole("button", { name: /^Save promotion:/ })
    .first()
    .click();
  await page.evaluate(() =>
    navigator.serviceWorker.register("/sw.js?revision=update-test", {
      scope: "/",
      updateViaCache: "none",
    }),
  );
  const notice = page.getByRole("complementary", { name: "App update" });
  await expect(notice).toBeVisible({ timeout: 20000 });
  await notice.getByRole("button", { name: "Later", exact: true }).click();
  await expect(notice).not.toBeVisible();
  await openSettings(page);
  const navigated = page.waitForEvent("framenavigated", {
    predicate: (frame) => frame === page.mainFrame(),
  });
  await page.getByRole("button", { name: "Update available · reload app" }).click();
  await navigated;
  await waitForApp(page);
  await expect(page.locator(".app")).toHaveClass(/design-orbit/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: /^Unsave promotion:/ })).toHaveCount(1);
});

test("offers an install prompt and iOS instructions without claiming a dismissed install", async ({
  page,
  isMobile,
  connection,
}) => {
  await page.goto(connection.url);
  await offlineReady(page);
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await openSettings(page);
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByText("Installed on this device", { exact: true })).not.toBeVisible();
  await page
    .getByRole("button", { name: isMobile ? "Add to Home Screen" : "How to install", exact: true })
    .click();
  await expect(page.locator("#install-help")).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(page.getByText("Installed on this device", { exact: true })).toBeVisible();
});

test("supports standalone presentation, shortcut launches, sharing and native Back", async ({
  page,
  isMobile,
  connection,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        sessionStorage.setItem("shared-offer", JSON.stringify(data));
      },
      configurable: true,
    });
  });
  await page.goto(`${connection.url}/?filter=free_delivery`);
  await offlineReady(page);
  await expect(page.locator("html")).toHaveAttribute("data-display", "standalone");
  await expect(page.getByRole("button", { name: /^Free delivery(?:\s*\d+)?$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (isMobile) await expect(page.getByRole("searchbox")).toHaveCSS("font-size", "16px");
  await page
    .getByRole("button", { name: /^Share promotion:/ })
    .first()
    .click();
  const share = await page.evaluate(() => JSON.parse(sessionStorage.getItem("shared-offer")!));
  expect(share.text).toContain(sourceSnapshot[0].criteria);
  expect(share.text).toContain(sourceSnapshot[0].sourceUrl);
  expect(share.url).toContain("?store=checkers");
  await openSettings(page);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("dialog", { name: "Your kind of saving." })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open view settings" })).toBeFocused();
  await page.goto(`${connection.url}/?store=makro`);
  await waitForApp(page);
  await expect(page.locator(".store-card")).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveValue("Makro");
});

test("keeps offline shopping usable when device storage stops responding", async ({
  page,
  connection,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Install the fault on the factory prototype in every document and verify
  // actual blocked calls; an instance-only override was unreliable in WebKit.
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    Object.defineProperty(IDBFactory.prototype, "open", {
      configurable: true,
      value: function (this: IDBFactory, ...args: Parameters<typeof open>) {
        if (sessionStorage.getItem("test-block-storage") === "true") {
          sessionStorage.setItem("test-blocked-storage-attempt", "true");
          return {};
        }
        return Reflect.apply(open, this, args);
      },
    });
  });
  await page.goto(connection.url);
  await offlineReady(page);
  await page.evaluate(() => {
    sessionStorage.setItem("test-block-storage", "true");
  });
  await connection.setOnline(false);
  await page.reload();
  await waitForApp(page);
  expect(await page.evaluate(() => sessionStorage.getItem("test-blocked-storage-attempt"))).toBe(
    "true",
  );
  await expect(page.getByRole("searchbox")).toBeEnabled();
  await expect(page.locator(".store-card.has-offers")).toHaveCount(0);
  await expect(page.locator(".live-number > span")).toHaveText("00");
  await expect(
    page.getByText("Offline. Still a little less searching.", { exact: true }),
  ).toBeVisible();
});
