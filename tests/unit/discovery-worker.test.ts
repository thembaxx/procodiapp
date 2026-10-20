import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cacheSchema } from "../../src/lib/offers";

it("executes the real scheduled worker and writes all six store results to shared storage", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "littleless-worker-"));
  const output = path.join(directory, "result.json");
  try {
    const result = await new Promise<{ code: number | null; logs: string }>((resolve, reject) => {
      const worker = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "--import",
          "./tests/fixtures/discovery-provider-hook.mjs",
          "scripts/discover-promotions.ts",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "test",
            PROMOTION_FEED: "local",
            CJ_API_TOKEN: "",
            CJ_WEBSITE_ID: "",
            CJ_ADVERTISERS: "",
            SUPABASE_URL: "https://storage.example.invalid",
            SUPABASE_SERVICE_ROLE_KEY: "worker-test-only-storage",
            RATE_LIMIT_SECRET: "worker-test-only-ratelimit-secret-value",
            DISCOVERY_TEST_OUTPUT: output,
          },
          timeout: 15000,
        },
      );
      let logs = "";
      worker.stdout.on("data", (data) => {
        logs += String(data);
      });
      worker.stderr.on("data", (data) => {
        logs += String(data);
      });
      worker.on("error", reject);
      worker.on("close", (code) => resolve({ code, logs }));
    });
    expect(result.code, result.logs).toBe(0);
    const saved = JSON.parse(await readFile(output, "utf8"));
    expect(saved.record.id).toBe("current");
    const cache = cacheSchema.parse(saved.record.data);
    expect(cache.mode).toBe("free_sources");
    expect(cache.offers).toHaveLength(6);
    expect(cache.offers.every((offer) => offer.code === "WORKER40" && !offer.verified)).toBe(true);
    expect(result.logs).toContain("6 active offers, 6 new, 6/6 stores checked");
    expect(result.logs).not.toMatch(/worker-test-only|WORKER40|storage\.example/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);

it("runs the filesystem collector and real GitHub publisher without model or database keys", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "littleless-publisher-"));
  const output = path.join(directory, "github-requests.json");
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    PROMOTION_FEED: "local",
    DATA_DIR: directory,
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    RATE_LIMIT_SECRET: "",
    CJ_API_TOKEN: "",
    CJ_WEBSITE_ID: "",
    CJ_ADVERTISERS: "",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "test/publisher",
    GITHUB_TOKEN: "publisher-test-only-token",
    DISCOVERY_GITHUB_OUTPUT: output,
  };
  async function run(script: string, args: string[] = []) {
    return await new Promise<{ code: number | null; logs: string }>((resolve, reject) => {
      const worker = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "--import",
          "./tests/fixtures/discovery-provider-hook.mjs",
          script,
          ...args,
        ],
        { cwd: process.cwd(), env: environment, timeout: 15000 },
      );
      let logs = "";
      worker.stdout.on("data", (chunk) => {
        logs += String(chunk);
      });
      worker.stderr.on("data", (chunk) => {
        logs += String(chunk);
      });
      worker.on("error", reject);
      worker.on("close", (code) => resolve({ code, logs }));
    });
  }
  try {
    const collection = await run("scripts/discover-promotions.ts", ["--publish"]);
    expect(collection.code, collection.logs).toBe(0);
    const published = await run("scripts/publish-promotion-feed.ts");
    expect(published.code, published.logs).toBe(0);
    const requests = JSON.parse(await readFile(output, "utf8"));
    const blobs = requests.filter((request: { url: string }) => request.url.endsWith("git/blobs"));
    const cache = cacheSchema.parse(JSON.parse(blobs[0].body.content));
    expect(cache.offers).toHaveLength(6);
    expect(cache.mode).toBe("free_sources");
    expect(JSON.parse(blobs[1].body.content)).toEqual([]);
    expect(requests.at(-1)).toMatchObject({
      method: "POST",
      body: { ref: "refs/heads/promotion-data" },
    });
    expect(JSON.stringify(requests)).not.toContain("publisher-test-only-token");
    expect(published.logs).toContain("Published validated promotion feed");
    expect(collection.logs + published.logs).not.toMatch(/publisher-test-only-token|WORKER40/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
