import { expect, test } from "@playwright/test";
import { openSettings, closeSettings, chooseView, waitForApp } from "./helpers";

test("replaces bottom tabs with settings, preserves choices and returns keyboard focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForApp(page);
  await expect(page.locator(".design-switcher")).toHaveCount(0);
  const settings = await openSettings(page);
  await chooseView(page, "Orbit", false);
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open view settings" })).toBeFocused();
  await page.reload();
  await waitForApp(page);
  await expect(page.locator(".app")).toHaveClass(/design-orbit/);
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Orbit", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await closeSettings(page);
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await openSettings(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await closeSettings(page);
  }
});

test("turns decorative motion off for reduced-motion and restores the preference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByRole("switch", { name: "Animated backgrounds" })).toBeDisabled();
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "reduced");
  await expect(page.locator(".view-background canvas")).toHaveCount(0);
  await closeSettings(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSettings(page);
  const toggle = page.getByRole("switch", { name: "Animated backgrounds" });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await closeSettings(page);
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "disabled");
  await expect(page.locator(".view-background canvas")).toHaveCount(0);
  await page.reload();
  await openSettings(page);
  await expect(page.getByRole("switch", { name: "Animated backgrounds" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await closeSettings(page);
});

test("renders each Three.js scene, recovers from context loss and keeps one canvas", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "GPU rendering is verified with software WebGL in Chromium; other engines cover fallback and settings.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "running");
  for (const name of ["Rewards", "Orbit", "Wallet"]) {
    await chooseView(page, name);
    await expect(page.locator(".view-background")).toHaveAttribute(
      "data-scene",
      name.toLowerCase(),
    );
    await expect(page.locator(".view-background canvas")).toHaveCount(1);
  }
  const recovery = await page
    .locator(".view-background canvas")
    .evaluateHandle((canvas) =>
      (canvas as HTMLCanvasElement).getContext("webgl2")?.getExtension("WEBGL_lose_context"),
    );
  await recovery.evaluate((extension) => extension?.loseContext());
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "fallback");
  await recovery.evaluate((extension) => extension?.restoreContext());
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "running");
  await recovery.dispose();
  await page.getByRole("button", { name: "Make a little magic" }).click();
  await page.getByRole("searchbox", { name: "Search stores" }).fill("Checkers");
  await expect(page.locator(".store-card")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("keeps shopping usable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl2") return null;
      return original.apply(this, [type, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".view-background")).toHaveAttribute("data-state", "fallback");
  await page.getByRole("searchbox", { name: "Search stores" }).fill("Woolworths");
  await expect(page.locator(".store-card")).toHaveCount(1);
  await chooseView(page, "Rewards");
  await expect(page.locator(".store-card")).toHaveCount(1);
});

test("dismisses the mobile settings sheet with a downward drag", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The drag handle is a mobile-sheet gesture.");
  await page.goto("/");
  const settings = await openSettings(page);
  const handle = page.getByRole("button", { name: "Dismiss settings" });
  // Measure after the sheet's entrance transition, as a real drag starts on it.
  await handle.click({ trial: true });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  await expect(settings).not.toBeVisible();
});
