import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheSchema } from "../src/lib/offers";
import { boundedJson } from "../src/lib/server/bounded-input";

try {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !process.env.DATA_DIR)
    throw new Error("Invalid feed input.");
  const response = await fetch(
    `https://raw.githubusercontent.com/${repository}/promotion-data/offers.json`,
    { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (response.status !== 404) {
    if (!response.ok) throw new Error("Previous feed unavailable.");
    const cache = cacheSchema.parse(await boundedJson(response, 2_000_000));
    await mkdir(process.env.DATA_DIR, { recursive: true });
    await writeFile(path.join(process.env.DATA_DIR, "offers.json"), JSON.stringify(cache));
  }
} catch {
  console.error("Previous promotion feed could not be loaded safely; publication stopped.");
  process.exitCode = 1;
}
