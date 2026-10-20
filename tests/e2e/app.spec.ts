import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { sourceSnapshot } from "../../src/lib/snapshot";
import { chooseView, chooseTheme, closeSettings, reconnectOffers, waitForApp } from "./helpers";

const testOffer = {
  ...sourceSnapshot[0],
  id: "e2e-code",
  title: "Test-only grocery voucher",
  code: "E2E50",
  type: "discount",
  checkedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 86400000).toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  ongoing: false,
};

test("searches stores, changes filters, and handles no results", async ({ page }) => {
  await page.goto("/?design=wallet");
  await page.getByRole("searchbox", { name: "Search stores" }).fill("Pick n Pay");
  await expect(page.locator(".store-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Pick n Pay asap!/ })).toBeVisible();
  await page.getByRole("searchbox").fill("not-a-store");
  await expect(page.getByText("No stores by that name.")).toBeVisible();
  await page.getByRole("button", { name: "Explore all stores" }).click();
  await expect(page.locator(".store-card")).toHaveCount(6);
  await page.getByRole("button", { name: /^Discounts(?:\s*\d+)?$/ }).click();
  await expect(page.getByRole("button", { name: /^Discounts(?:\s*\d+)?$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("opens only one Wallet card and shows terms for no-code benefits", async ({ page }) => {
  await page.goto("/?design=wallet");
  const checkers = page.getByRole("button", { name: /^Checkers Sixty60/ });
  const pnp = page.getByRole("button", { name: /^Pick n Pay asap!/ });
  await expect(checkers).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("No code needed").first()).toBeVisible();
  await page.getByText("Details & terms", { exact: true }).first().click();
  await expect(
    page.getByText("Source listed · not tested at checkout.", { exact: false }),
  ).toBeVisible();
  await pnp.click();
  await expect(pnp).toHaveAttribute("aria-expanded", "true");
  await expect(checkers).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Nothing confirmed just yet.")).toBeVisible();
});

test("recovers a published feed to copy, save, and report a discovered code", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/offers", (route) =>
    route.fulfill({
      json: {
        offers: [testOffer],
        updatedAt: new Date().toISOString(),
        checks: [],
        newOfferIds: [testOffer.id],
        mode: "free_sources",
      },
    }),
  );
  await page.route("**/api/report", (route) =>
    route.fulfill({ status: 201, json: { saved: true } }),
  );
  await page.goto("/?design=wallet");
  await reconnectOffers(page);
  await expect(page.getByText("Test-only grocery voucher", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "E2E50 Copy code" }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("E2E50");
  await page.getByRole("button", { name: "Save promotion: Test-only grocery voucher" }).click();
  await expect(
    page.getByRole("button", { name: "Unsave promotion: Test-only grocery voucher" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Details & terms", { exact: true }).click();
  await page.getByRole("button", { name: "Report not working" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "The code didn't work" }).click();
  await expect(page.getByText("Thanks. Your report was saved for review.")).toBeVisible();
});

test("retains offers when the feed is unavailable and keeps manual refresh hidden", async ({
  page,
}) => {
  await page.route("**/api/offers", (route) =>
    route.fulfill({ status: 503, json: { error: "Feed unavailable." } }),
  );
  await page.goto("/");
  expect((await reconnectOffers(page)).status()).toBe(503);
  await expect(
    page.getByRole("button", { name: /Refresh promotions|Find fresh offers/ }),
  ).toHaveCount(0);
  await expect(page.locator(".store-card")).toHaveCount(6);
});

test("loads the latest scheduled scan on reconnect without starting another scan", async ({
  page,
}) => {
  let scans = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/refresh") scans++;
  });
  await page.route("**/api/offers", (route) =>
    route.fulfill({
      json: {
        offers: [testOffer],
        updatedAt: new Date().toISOString(),
        checks: [],
        newOfferIds: [],
        mode: "free_sources",
        reused: true,
      },
    }),
  );
  await page.goto("/");
  await reconnectOffers(page);
  await expect(page.getByText(testOffer.title, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "E2E50 Copy code" })).toBeVisible();
  expect(scans).toBe(0);
});

test("offers three layouts, persists a choice, and supports light and dark", async ({ page }) => {
  await page.goto("/?design=wallet");
  for (const name of ["Rewards", "Orbit", "Wallet"]) {
    await chooseView(page, name, false);
    await expect(page.locator(".app")).toHaveClass(new RegExp(`design-${name.toLowerCase()}`));
    await expect(page.getByRole("button", { name: new RegExp(`^${name}\\b`) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await closeSettings(page);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".app")).toHaveClass(/design-wallet/);
  const before = await page.locator("html").getAttribute("data-theme");
  await chooseTheme(page, before === "dark" ? "light" : "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    before === "dark" ? "light" : "dark",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("supports keyboard dialog dismissal and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Independent. Made for South Africa." }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.locator(".ambient-glow").evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
});

test("passes automated accessibility checks for all designs and themes", async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const design of ["wallet", "rewards", "orbit"]) {
    await page.goto(`/?design=${design}`);
    await waitForApp(page);
    for (const theme of ["dark", "light"]) {
      await chooseTheme(page, theme, false);
      const settings = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(settings.violations, `settings / ${design} / ${theme}`).toEqual([]);
      await closeSettings(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.evaluate(() => document.fonts.ready);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(result.violations, `${design} / ${theme}`).toEqual([]);
    }
  }
  await page.getByRole("button", { name: "Independent. Made for South Africa." }).click();
  const dialog = await new AxeBuilder({ page }).withRules(["aria-dialog-name"]).analyze();
  expect(dialog.violations).toEqual([]);
});
