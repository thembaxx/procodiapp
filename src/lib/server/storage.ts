import { createHmac, randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { cacheSchema, type OffersResponse } from "../offers";
import { sourceSnapshot } from "../snapshot";
import { z } from "zod";
import { boundedJson } from "./bounded-input";

export const PUBLIC_DISCOVERY_COOLDOWN_SECONDS = 600;
export const REPORT_RETENTION_DAYS = 30;
const MAX_STORAGE_BYTES = 8_000_000;
const ephemeralLimitSecret = randomBytes(32).toString("hex");

export type Cache = Omit<OffersResponse, "newOfferIds">;
const dataDir = () => process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const initial: Cache = {
  offers: sourceSnapshot,
  updatedAt: null,
  checks: [],
  mode: "public_pages",
};
function hasSupabase() {
  const url = !!process.env.SUPABASE_URL,
    key = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== key) throw new Error("Promotion storage configuration is incomplete.");
  return url && key;
}

async function database(endpoint: string, init: RequestInit = {}) {
  const url = new URL(process.env.SUPABASE_URL!);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Storage requires a credential-free HTTPS origin.");
  const response = await fetch(`${url.origin}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Promotion storage is temporarily unavailable.");
  return response;
}

export async function readCache(): Promise<Cache> {
  try {
    const raw = hasSupabase()
      ? (
          (await boundedJson(
            await database("promotion_cache?id=eq.current&select=data"),
            MAX_STORAGE_BYTES,
          )) as {
            data: Cache;
          }[]
        )[0]?.data
      : JSON.parse(await localText("offers.json"));
    if (raw == null) return initial;
    // Project only validated public fields; never echo arbitrary stored metadata.
    return cacheSchema.parse(raw);
  } catch (error) {
    if (!hasSupabase() && (error as NodeJS.ErrnoException).code === "ENOENT") return initial;
    throw error;
  }
}

export async function writeCache(data: Cache): Promise<void> {
  data = cacheSchema.parse(data);
  if (hasSupabase()) {
    await database("promotion_cache?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: "current", data }),
    });
    return;
  }
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const temporary = path.join(dataDir(), `offers-${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, path.join(dataDir(), "offers.json"));
}

const buckets = new Map<string, number>();
export function rateLimitKey(bucket: string, now = Date.now()): string {
  const configured = process.env.RATE_LIMIT_SECRET;
  if (
    (configured && configured.length < 32) ||
    (!configured && (hasSupabase() || process.env.NODE_ENV === "production"))
  )
    throw new Error("A strong rate-limit secret is required.");
  return (
    createHmac("sha256", configured || ephemeralLimitSecret)
      // The non-personal shared budget must not reset at midnight.
      .update(
        `${bucket === "discovery:global" ? "shared" : new Date(now).toISOString().slice(0, 10)}:${bucket}`,
      )
      .digest("hex")
  );
}
export async function takeRefreshSlot(bucket: string, windowSeconds = 60): Promise<number> {
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 600)
    throw new Error("Invalid rate-limit window.");
  const key = rateLimitKey(bucket);
  if (hasSupabase()) {
    const result = await database("rpc/take_refresh_slot", {
      method: "POST",
      body: JSON.stringify({ client_key: key, window_seconds: windowSeconds }),
    });
    const value = await boundedJson(result, 1024);
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > windowSeconds)
      throw new Error("Rate-limit storage returned an invalid response.");
    return value;
  }
  const now = Date.now();
  for (const [hash, expires] of buckets) if (expires <= now) buckets.delete(hash);
  const expires = buckets.get(key) ?? 0;
  if (expires > now) return Math.ceil((expires - now) / 1000);
  buckets.set(key, now + windowSeconds * 1000);
  return 0;
}

const reportSchema = z.object({
  offer_id: z.string().min(1).max(180),
  reason: z.enum(["The code didn't work", "The offer has ended", "The terms are different"]),
  created_at: z.iso.datetime({ offset: true }),
});
let reportQueue: Promise<unknown> = Promise.resolve();
function serialReports<T>(task: () => Promise<T>): Promise<T> {
  const next = reportQueue.then(task);
  reportQueue = next.catch(() => {});
  return next;
}
async function localText(filename: "offers.json" | "reports.jsonl") {
  // Runtime data comes from the mounted volume, never from deployment assets.
  const file = path.join(/* turbopackIgnore: true */ dataDir(), filename);
  if ((await stat(/* turbopackIgnore: true */ file)).size > MAX_STORAGE_BYTES)
    throw new Error("Storage file exceeds its safe size limit.");
  return readFile(/* turbopackIgnore: true */ file, "utf8");
}
async function retainedReports() {
  let text: string;
  try {
    text = await localText("reports.jsonl");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const cutoff = Date.now() - REPORT_RETENTION_DAYS * 86400000;
  return text.split("\n").flatMap((line) => {
    try {
      const record = reportSchema.safeParse(JSON.parse(line));
      return record.success && Date.parse(record.data.created_at) > cutoff ? [record.data] : [];
    } catch {
      return [];
    }
  });
}
async function replaceReports(reports: z.infer<typeof reportSchema>[]) {
  const text =
    reports.map((report) => JSON.stringify(report)).join("\n") + (reports.length ? "\n" : "");
  if (Buffer.byteLength(text) > MAX_STORAGE_BYTES) throw new Error("Report storage is full.");
  await mkdir(dataDir(), { recursive: true, mode: 0o700 });
  const temporary = path.join(dataDir(), `reports-${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
    await rename(temporary, path.join(dataDir(), "reports.jsonl"));
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
async function cleanupReportTemporaries() {
  let names: string[];
  try {
    names = await readdir(/* turbopackIgnore: true */ dataDir());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const name of names.filter((item) => /^reports-[a-f0-9-]{36}\.tmp$/.test(item))) {
    const file = path.join(/* turbopackIgnore: true */ dataDir(), name);
    if ((await stat(/* turbopackIgnore: true */ file)).mtimeMs < Date.now() - 3600000)
      await unlink(file);
  }
}
export async function cleanupExpiredData() {
  if (hasSupabase()) {
    await database("rpc/cleanup_expired_data", { method: "POST", body: "{}" });
    return;
  }
  await serialReports(async () => {
    await cleanupReportTemporaries();
    await replaceReports(await retainedReports());
  });
}
export async function saveReport(offerId: string, reason: string) {
  const report = { offer_id: offerId, reason, created_at: new Date().toISOString() };
  reportSchema.parse(report);
  if (hasSupabase()) {
    await database("rpc/save_promotion_report", {
      method: "POST",
      body: JSON.stringify({ reported_offer_id: offerId, reported_reason: reason }),
    });
    return;
  }
  await serialReports(async () => {
    await cleanupReportTemporaries();
    await replaceReports([...(await retainedReports()), reportSchema.parse(report)]);
  });
}

export async function checkStorage(): Promise<boolean> {
  try {
    if (hasSupabase()) await database("promotion_cache?select=id&limit=1");
    else {
      if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
      await mkdir(dataDir(), { recursive: true, mode: 0o700 });
      await access(dataDir(), constants.R_OK | constants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}
