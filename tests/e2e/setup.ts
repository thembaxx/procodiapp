import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceSnapshot } from "../../src/lib/snapshot";

export default async function setup() {
  const directory = path.join(process.cwd(), ".data/e2e");
  await mkdir(directory, { recursive: true });
  // Isolated browser-test fixtures stay outside tracked production sources.
  const offers = sourceSnapshot.map((offer) => ({
    ...offer,
    checkedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 86400000).toISOString(),
  }));
  await writeFile(
    path.join(directory, "offers.json"),
    JSON.stringify({ offers, updatedAt: null, checks: [], mode: "public_pages" }),
  );
}
