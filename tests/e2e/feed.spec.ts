import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const directory = path.join(process.cwd(), ".data/feed-e2e");
const origin = "http://localhost:3181";
let server: ChildProcess | undefined;

test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
  const result = await new Promise<{ code: number | null; logs: string }>((resolve, reject) => {
    const collector = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./tests/fixtures/discovery-provider-hook.mjs",
        "scripts/discover-promotions.ts",
        "--publish",
      ],
      {
        cwd: process.cwd(),
        timeout: 15000,
        env: {
          ...process.env,
          NODE_ENV: "test",
          PROMOTION_FEED: "local",
          DATA_DIR: directory,
          SUPABASE_URL: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
          CJ_API_TOKEN: "",
          CJ_WEBSITE_ID: "",
          CJ_ADVERTISERS: "",
        },
      },
    );
    let logs = "";
    collector.stdout.on("data", (chunk) => {
      logs += String(chunk);
    });
    collector.stderr.on("data", (chunk) => {
      logs += String(chunk);
    });
    collector.on("error", reject);
    collector.on("close", (code) => resolve({ code, logs }));
  });
  expect(result.code, result.logs).toBe(0);
  server = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: process.cwd(),
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "3181",
      HOSTNAME: "127.0.0.1",
      SITE_URL: "",
      VERCEL_PROJECT_PRODUCTION_URL: "",
      INDEXING_ENABLED: "false",
      // Exercise the deployed production default without manual feed configuration.
      PROMOTION_FEED: undefined,
      VERCEL_ENV: "production",
      PROMOTION_FEED_REPOSITORY: "test/browser-feed",
      DATA_DIR: directory,
      DISCOVERY_FEED_FILE: path.join(directory, "offers.json"),
      NODE_OPTIONS: `--import ${path.join(process.cwd(), "tests/fixtures/github-feed-hook.mjs")}`,
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      RATE_LIMIT_SECRET: "browser-feed-test-only-rate-limit-secret",
      CJ_API_TOKEN: "must-not-be-forwarded",
      GEMINI_API_KEY: "must-not-be-forwarded",
      CJ_WEBSITE_ID: "",
      CJ_ADVERTISERS: "",
    },
  });
  let logs = "";
  server.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });
  server.on("error", (error) => {
    logs += error.message;
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return;
    } catch {
      /* Server startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Feed test server did not become ready: ${logs}`);
});
test.afterAll(async () => {
  if (server && server.exitCode === null) {
    await new Promise<void>((resolve) => {
      server!.once("close", () => resolve());
      server!.kill("SIGTERM");
    });
  }
  await rm(directory, { recursive: true, force: true });
});

test("renders collector output through the real feed API and refreshes without provider keys", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const offers = await request.get(`${origin}/api/offers`);
  expect(offers.ok()).toBe(true);
  const body = await offers.json();
  expect(body.mode).toBe("free_sources");
  expect(body.offers).toHaveLength(6);
  expect(JSON.stringify(body)).not.toContain("must-not-be-forwarded");
  await page.goto(`${origin}/?design=wallet`);
  await expect(page.getByRole("button", { name: "Copy code WORKER40" }).first()).toBeVisible();
  const refreshed = page.waitForResponse((response) => response.url() === `${origin}/api/refresh`);
  await page
    .getByRole("button", { name: /Refresh promotions|Find fresh offers/ })
    .filter({ visible: true })
    .first()
    .click();
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  expect((await response.json()).reused).toBe(true);
  await expect(page.locator(".status-text")).toContainText("Latest promotions loaded");
  const report = await request.post(`${origin}/api/report`, {
    data: { offerId: body.offers[0].id, reason: "The offer has ended" },
  });
  expect(report.status()).toBe(201);
  expect(await readFile(path.join(directory, "reports.jsonl"), "utf8")).toContain(
    body.offers[0].id,
  );
  expect(errors).toEqual([]);
});
