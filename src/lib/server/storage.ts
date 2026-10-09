import { createHash } from "node:crypto";
import { access, appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { offerSchema, type OffersResponse } from "../offers";
import { sourceSnapshot } from "../snapshot";

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
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${endpoint}`, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Promotion storage is temporarily unavailable.");
  return response;
}

export async function readCache(): Promise<Cache> {
  try {
    const raw = hasSupabase()
      ? (
          (await (await database("promotion_cache?id=eq.current&select=data")).json()) as {
            data: Cache;
          }[]
        )[0]?.data
      : JSON.parse(await readFile(path.join(dataDir(), "offers.json"), "utf8"));
    if (!raw || !Array.isArray(raw.offers)) return initial;
    return {
      ...raw,
      offers: raw.offers.flatMap((item: unknown) => {
        const parsed = offerSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
      checks: raw.checks ?? [],
      mode: raw.mode ?? "public_pages",
      updatedAt: raw.updatedAt ?? null,
    };
  } catch (error) {
    if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) throw error;
    return initial;
  }
}

export async function writeCache(data: Cache): Promise<void> {
  if (hasSupabase()) {
    await database("promotion_cache?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: "current", data }),
    });
    return;
  }
  await mkdir(dataDir(), { recursive: true });
  const temporary = path.join(dataDir(), `offers-${crypto.randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
  await rename(temporary, path.join(dataDir(), "offers.json"));
}

const buckets = new Map<string, number>();
export async function takeRefreshSlot(ip: string): Promise<number> {
  const key = createHash("sha256").update(ip).digest("hex");
  if (hasSupabase()) {
    const result = await (
      await database("rpc/take_refresh_slot", {
        method: "POST",
        body: JSON.stringify({ client_key: key }),
      })
    ).json();
    if (!Number.isInteger(result) || result < 0 || result > 60)
      throw new Error("Rate-limit storage returned an invalid response.");
    return result;
  }
  const now = Date.now();
  for (const [hash, expires] of buckets) if (expires <= now) buckets.delete(hash);
  const expires = buckets.get(key) ?? 0;
  if (expires > now) return Math.ceil((expires - now) / 1000);
  buckets.set(key, now + 60_000);
  return 0;
}

export async function saveReport(offerId: string, reason: string) {
  const report = { offer_id: offerId, reason, created_at: new Date().toISOString() };
  if (hasSupabase()) {
    await database("promotion_reports", { method: "POST", body: JSON.stringify(report) });
    return;
  }
  await mkdir(dataDir(), { recursive: true });
  await appendFile(path.join(dataDir(), "reports.jsonl"), `${JSON.stringify(report)}\n`, {
    mode: 0o600,
  });
}

export async function checkStorage(): Promise<boolean> {
  try {
    if (hasSupabase()) await database("promotion_cache?select=id&limit=1");
    else {
      if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
      await mkdir(dataDir(), { recursive: true });
      await access(dataDir(), constants.R_OK | constants.W_OK);
    }
    return true;
  } catch {
    return false;
  }
}
