import { readCache } from "@/lib/server/storage";
import { stores } from "@/lib/stores";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SourceHealth = {
  merchant: string;
  status: "checked" | "empty" | "failed";
  checked_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  cooldown_until: string | null;
  extracted_count: number;
};

async function readWorkerHealth(): Promise<SourceHealth[] | null> {
  const configured = process.env.CLOUDFLARE_VERIFIED_FEED_URL;
  if (!configured) return null;
  try {
    const origin = new URL(configured);
    if (origin.protocol !== "https:" || origin.pathname !== "/" ||
        origin.username || origin.password || origin.search || origin.hash) return null;
    const response = await fetch(new URL("/api/source-health", origin), {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("sources" in data) ||
        !Array.isArray(data.sources)) return null;
    return data.sources.filter((row): row is SourceHealth =>
      !!row && typeof row === "object" && typeof row.merchant === "string" &&
      ["checked", "empty", "failed"].includes(row.status) &&
      typeof row.consecutive_failures === "number" &&
      typeof row.extracted_count === "number").slice(0, 100);
  } catch {
    return null;
  }
}

function stamp(value: string | null | undefined) {
  if (!value) return "Never";
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" })
    : "Unavailable";
}

export default async function SourceStatus() {
  const [cacheResult, workerResult] = await Promise.allSettled([readCache(), readWorkerHealth()]);
  const cache = cacheResult.status === "fulfilled" ? cacheResult.value : null;
  const worker = workerResult.status === "fulfilled" ? workerResult.value : null;
  const liveOffers = cache?.offers.filter((offer) =>
    Date.parse(offer.validUntil) > Date.now() &&
    (offer.ongoing || (offer.expiresAt && Date.parse(offer.expiresAt) > Date.now()))) ?? [];
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-12 text-inherit">
      <Link href="/" className="underline underline-offset-4">← ProcodiApp</Link>
      <h1 className="mt-8 text-3xl font-bold">Promotion source status</h1>
      <p className="mt-3 max-w-2xl opacity-75">
        Source checks are not checkout verification. A successful scrape can return zero
        valid offers, and promotions expire unless renewed against reliable evidence.
      </p>
      <section className="my-8 grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Discovery summary">
        <div className="rounded-2xl border p-5">
          <p className="text-sm opacity-70">Currently eligible offers</p>
          <strong className="text-3xl">{liveOffers.length}</strong>
        </div>
        <div className="rounded-2xl border p-5">
          <p className="text-sm opacity-70">Published feed</p>
          <strong className="text-xl">{cache ? "Available" : "Unavailable"}</strong>
          <p className="text-xs opacity-70">Last update: {stamp(cache?.updatedAt)}</p>
        </div>
        <div className="rounded-2xl border p-5">
          <p className="text-sm opacity-70">Worker monitoring</p>
          <strong className="text-xl">{worker ? "Available" : "Not configured / unavailable"}</strong>
        </div>
      </section>
      <h2 className="text-xl font-semibold">Official-source checks</h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="border-b">
            <th className="p-3">Retailer</th><th className="p-3">Check</th>
            <th className="p-3">Pages</th><th className="p-3">Offers</th>
          </tr></thead>
          <tbody>
            {stores.map((store) => {
              const check = cache?.checks.find((entry) => entry.storeId === store.id);
              const count = liveOffers.filter((offer) => offer.storeId === store.id).length;
              return <tr key={store.id} className="border-b">
                <td className="p-3">{store.name}</td>
                <td className="p-3">{check?.status ?? "Not checked"}</td>
                <td className="p-3">{check?.parsedPages ?? 0}</td>
                <td className="p-3">{count}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 text-xl font-semibold">Cloudflare collection health</h2>
      {worker ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b"><th className="p-3">Retailer</th>
              <th className="p-3">Extraction</th><th className="p-3">Failures</th>
              <th className="p-3">Last checked (SAST)</th></tr></thead>
            <tbody>{worker.map((row) => <tr key={row.merchant} className="border-b">
              <td className="p-3">{row.merchant}</td><td className="p-3">{row.status}</td>
              <td className="p-3">{row.consecutive_failures}</td>
              <td className="p-3">{stamp(row.checked_at)}</td>
            </tr>)}</tbody>
          </table>
          {worker.length === 0 && <p className="p-4">No source scans recorded yet.</p>}
        </div>
      ) : <p className="mt-3 opacity-75">Worker monitoring is not configured or is temporarily unavailable.</p>}
      <p className="mt-6 text-sm opacity-70">
        Extracted results are unverified leads until reviewed against published retailer terms.
        No data from this page is evidence of checkout success.
      </p>
    </main>
  );
}
