import { expect, type Page } from "@playwright/test";

export async function waitForApp(page: Page) {
  // Next can stage another server-rendered tree while replacing streamed content.
  await expect(page.locator(".app:visible")).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(page.locator(".app")).toHaveCount(1);
}

export async function openSettings(page: Page) {
  await waitForApp(page);
  const dialog = page.getByRole("dialog", { name: "Your kind of saving." });
  if (!(await dialog.isVisible()))
    await page.getByRole("button", { name: "Open view settings" }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function closeSettings(page: Page) {
  await page.getByRole("button", { name: "Back to offers" }).click();
  await expect(page.getByRole("dialog", { name: "Your kind of saving." })).not.toBeVisible();
}

export async function chooseView(page: Page, name: string, close = true) {
  const dialog = await openSettings(page);
  const choice = dialog.getByRole("button", { name: new RegExp(`^${name}\\b`) });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".app")).toHaveClass(new RegExp(`design-${name.toLowerCase()}`));
  if (close) await closeSettings(page);
}

export async function reconnectOffers(page: Page) {
  await waitForApp(page);
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/offers" && response.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  return pending;
}

export async function chooseTheme(page: Page, theme: string, close = true) {
  const dialog = await openSettings(page);
  const label = theme.charAt(0).toUpperCase() + theme.slice(1);
  await dialog.getByRole("button", { name: `${label} theme`, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  if (close) await closeSettings(page);
}
