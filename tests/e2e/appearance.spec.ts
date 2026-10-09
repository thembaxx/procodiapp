import { expect, test, type Page } from "@playwright/test";
import { chooseView, chooseTheme, waitForApp } from "./helpers";

const colors = {
  dark: { hex: "#0b0e11", rgb: "rgb(11, 14, 17)" },
  light: { hex: "#f5f7f3", rgb: "rgb(245, 247, 243)" },
  orbitLight: { hex: "#f4f0fa", rgb: "rgb(244, 240, 250)" },
};

async function expectCanvas(page: Page, color: (typeof colors)[keyof typeof colors]) {
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", color.hex);
  for (const selector of ["html", "body", ".app:visible, .loading-page:visible"]) {
    await expect(page.locator(selector)).toHaveCSS("background-color", color.rgb);
  }
}

test("applies a saved canvas before stylesheets and hydration load", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("grocery-design", "orbit");
  });
  await page.route("**/_next/static/**", (route) => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-design", "orbit");
  await expect(page.locator("html")).toHaveCSS("background-color", colors.orbitLight.rgb);
  await expect(page.locator("body")).toHaveCSS("background-color", colors.orbitLight.rgb);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    colors.orbitLight.hex,
  );
  await expect(page.locator(".app[data-ready]:visible")).toHaveAttribute("data-ready", "false");
});

test("keeps the server loading shell on the same canvas in portrait and landscape", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("grocery-design", "orbit");
  });
  await page.route(/\/_next\/static\/.*\.js$/, (route) => route.abort());
  await page.route(/\/$/, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    // Keep the actual server fallback and withhold the streamed page/hydration modules.
    const loading = html.indexOf('class="loading-page"');
    expect(loading).toBeGreaterThan(0);
    const end = html.indexOf("</main>", loading) + "</main>".length;
    await route.fulfill({ response, body: html.slice(0, end) + "</body></html>" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main", { name: "Loading grocery promotions" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Finding a little less at checkout");
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expectCanvas(page, colors.orbitLight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page.locator(".loading-page").evaluate((node) => node.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(viewport.height);
  }
  await expect(page.locator(".skeleton").first()).toHaveCSS("animation-name", "none");
});

test("matches page, browser and manifest colours across designs, themes and refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?design=wallet");
  await waitForApp(page);
  for (const design of ["Wallet", "Rewards", "Orbit"]) {
    await chooseView(page, design);
    await expect(page.locator("html")).toHaveAttribute("data-design", design.toLowerCase());
    for (const theme of ["dark", "light"]) {
      await chooseTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const color =
        theme === "dark" ? colors.dark : design === "Orbit" ? colors.orbitLight : colors.light;
      await expectCanvas(page, color);
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", theme);
      await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
      const href = await page.locator('link[rel="manifest"]').getAttribute("href");
      const response = await page.request.get(href!);
      expect(response.headers()["content-type"]).toContain("application/manifest+json");
      expect(await response.json()).toMatchObject({
        id: "/",
        start_url: "/",
        background_color: color.hex,
        theme_color: color.hex,
      });
    }
  }
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".app")).toHaveClass(/design-orbit/);
  await expectCanvas(page, colors.orbitLight);

  let finishRefresh!: () => void;
  const refreshed = new Promise<void>((resolve) => {
    finishRefresh = resolve;
  });
  await page.route("**/api/refresh", async (route) => {
    await refreshed;
    await route.fulfill({ status: 429, json: { error: "Refresh again in 30s.", retryAfter: 30 } });
  });
  await page
    .getByRole("button", { name: /Refresh promotions|Find fresh offers/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator(".status-text")).toContainText("Checking public promotion pages");
  await expectCanvas(page, colors.orbitLight);
  finishRefresh();
  await expect(page.locator(".status-text")).toContainText("Refresh again in 30s.");
  await expectCanvas(page, colors.orbitLight);
  expect(errors).toEqual([]);
});

test("follows system theme changes without leaving browser colours behind", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
  });
  await page.goto("/?design=wallet");
  await waitForApp(page);
  await expectCanvas(page, colors.light);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectCanvas(page, colors.dark);
});

test("keeps missing-page backgrounds on the saved theme rather than the OS theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("grocery-design", "orbit");
  });
  const response = await page.goto("/missing-grocery-aisle");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  await expect(page.locator("html")).toHaveCSS("background-color", colors.orbitLight.rgb);
  await expect(page.locator("body")).toHaveCSS("background-color", colors.orbitLight.rgb);
  await expect(page.locator("body")).toHaveCSS("color", "rgb(23, 36, 32)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    colors.orbitLight.hex,
  );
});
