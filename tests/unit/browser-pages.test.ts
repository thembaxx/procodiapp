import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBrowserDocument } from "../../src/lib/server/browser-pages";
import { ensureRobotsAllowed } from "../../src/lib/server/public-pages";

const { page, close, launch } = vi.hoisted(() => {
  const mockPage = {
    route: vi.fn(),
    goto: vi.fn(),
    url: vi.fn(),
    content: vi.fn(),
    waitForLoadState: vi.fn(),
    waitForTimeout: vi.fn(),
  };
  return { page: mockPage, close: vi.fn(), launch: vi.fn() };
});
vi.mock("@playwright/test", () => ({ chromium: { launch } }));
vi.mock("../../src/lib/server/public-pages", async (original) => ({
  ...(await original<typeof import("../../src/lib/server/public-pages")>()),
  ensureRobotsAllowed: vi.fn(),
}));

const url = "https://www.pnp.co.za/asap-same-day-delivery";
const shell = `<title>Pick n Pay Online Shopping</title><header>${"Delivery address, sign in and navigation. ".repeat(10)}</header><main></main>`;
const content =
  "<main><h1>Pick n Pay ASAP! Same Day Grocery Delivery</h1><p>Get groceries delivered within 60 minutes. Link your Smart Shopper card for deals. Delivery areas and conditions apply.</p></main>";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T04:17:00Z"));
  launch.mockResolvedValue({ newPage: async () => page, close });
  page.goto.mockResolvedValue({ ok: () => true, url: () => url });
  page.url.mockReturnValue(url);
  page.content.mockResolvedValue(content);
  page.waitForLoadState.mockResolvedValue(undefined);
  page.waitForTimeout.mockImplementation(async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
  });
});
afterEach(() => vi.useRealTimers());
const signal = () => new AbortController().signal;

it("waits for delayed hydration beyond the old 700ms window", async () => {
  const started = Date.now();
  page.waitForLoadState.mockImplementationOnce(async () => vi.setSystemTime(started + 1400));
  page.content.mockImplementation(async () => (Date.now() - started < 1400 ? shell : content));
  const document = await readBrowserDocument(url, signal());
  expect(document.text).toContain("Link your Smart Shopper card for deals");
  expect(document.html).toBe(content);
  expect(Date.now() - started).toBe(1400);
  expect(ensureRobotsAllowed).toHaveBeenCalledWith(url, expect.any(AbortSignal));
  expect(close).toHaveBeenCalledOnce();
});
it("rejects a header-only snapshot after the network-idle deadline", async () => {
  page.content.mockResolvedValue(shell);
  const started = Date.now();
  page.waitForLoadState.mockImplementationOnce(async () => {
    vi.setSystemTime(started + 8000);
    throw new Error("Network-idle timeout");
  });
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("readable public page");
  expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", { timeout: 8000 });
  expect(Date.now() - started).toBe(8000);
  expect(close).toHaveBeenCalledOnce();
});
it("keeps waiting when hydration starts after network idle", async () => {
  const started = Date.now();
  page.waitForLoadState.mockImplementationOnce(async () => vi.setSystemTime(started + 500));
  page.content.mockImplementation(async () => (Date.now() - started < 1400 ? shell : content));
  expect((await readBrowserDocument(url, signal())).text).toContain("Smart Shopper");
  expect(page.content.mock.calls.length).toBeGreaterThan(1);
  expect(Date.now() - started).toBe(1500);
  expect(close).toHaveBeenCalledOnce();
});
it("does not extend the eight-second limit when network idle resolves early", async () => {
  const started = Date.now();
  page.waitForLoadState.mockImplementationOnce(async () => vi.setSystemTime(started + 500));
  page.content.mockResolvedValue(shell);
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("readable public page");
  expect(Date.now() - started).toBe(8000);
  expect(close).toHaveBeenCalledOnce();
});
it("reads hydrated content after the deadline even when background requests prevent idle", async () => {
  page.waitForLoadState.mockRejectedValueOnce(new Error("Network-idle timeout"));
  expect((await readBrowserDocument(url, signal())).text).toContain("Smart Shopper");
  expect(close).toHaveBeenCalledOnce();
});
it.each([
  "<main>Verify you are human</main>",
  "<main>Access denied</main>",
  "<main>Complete the CAPTCHA to continue</main>",
  `<title>Not Found | PnP</title><main><h1>Page not found</h1>${"Missing page. ".repeat(20)}</main>`,
])("rejects missing pages and challenges without retrying: %s", async (html) => {
  page.content.mockResolvedValue(html);
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("readable public page");
  expect(page.content).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it("rejects a client-side redirect during hydration", async () => {
  page.url.mockReturnValueOnce(url).mockReturnValue("https://www.pnp.co.za/login");
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("redirected");
  expect(close).toHaveBeenCalledOnce();
});
it("honours cancellation while waiting for page content", async () => {
  const controller = new AbortController();
  page.content.mockResolvedValue(shell);
  page.waitForLoadState.mockImplementationOnce(async () => controller.abort());
  await expect(readBrowserDocument(url, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(close).toHaveBeenCalledOnce();
});
it("does not launch a browser when the robots policy check fails", async () => {
  vi.mocked(ensureRobotsAllowed).mockRejectedValueOnce(new Error("Source policy unavailable."));
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("Source policy unavailable");
  expect(launch).not.toHaveBeenCalled();
});
it("retains the rendered page size limit", async () => {
  page.content.mockResolvedValue("x".repeat(2_500_001));
  await expect(readBrowserDocument(url, signal())).rejects.toThrow("size limit");
  expect(close).toHaveBeenCalledOnce();
});
