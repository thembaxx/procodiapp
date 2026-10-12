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
            SEARCH_PROVIDER: "tavily",
            TAVILY_API_KEY: "worker-test-only-search",
            OPENAI_API_KEY: "worker-test-only-extraction",
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
    expect(saved.searches).toBe(6);
    expect(saved.record.id).toBe("current");
    const cache = cacheSchema.parse(saved.record.data);
    expect(cache.mode).toBe("web_search");
    expect(cache.offers).toHaveLength(6);
    expect(cache.offers.every((offer) => offer.code === "WORKER40" && !offer.verified)).toBe(true);
    expect(result.logs).toContain("6 active offers, 6 new, 6/6 stores checked");
    expect(result.logs).not.toMatch(/worker-test-only|WORKER40|storage\.example/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
