import { z } from "zod";
import { boundedJson } from "./bounded-input";

// Only the GitHub Actions collector calls treg; never expose the token to the browser.
// Reserve the maximum route cost before each request, because six retailer tasks run concurrently.
const ENDPOINT = "https://treg.to/call/";
const resultSchema = z
  .object({
    output: z.unknown().optional(),
  })
  .passthrough();

let calls = 0;
let committedMicro = 0;
let reservedMicro = 0;

function positiveNumber(value: string | undefined, fallback: number, upper: number) {
  const parsed = Number(value);
  return value?.trim() && Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, upper)
    : fallback;
}

export function tregConfigured() {
  return Boolean(process.env.TREG_TOKEN?.trim());
}

export function tregUsage() {
  return { calls, chargedMicro: committedMicro, reservedMicro };
}

/** The cap is per *collector run*, not a durable cross-run daily budget. */
export async function callTreg(
  capability: "treg.web.search" | "treg.web.extract",
  body: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const token = process.env.TREG_TOKEN?.trim();
  if (!token) throw new Error("Treg is not configured.");
  const perCall = positiveNumber(process.env.TREG_MAX_COST_USD, 0.01, 0.05);
  const scanBudget = positiveNumber(process.env.TREG_SCAN_BUDGET_USD, 0.12, 1);
  const scanCalls = Math.floor(positiveNumber(process.env.TREG_MAX_CALLS_PER_SCAN, 12, 24));
  const reserve = Math.ceil(perCall * 1_000_000);
  if (calls >= scanCalls || committedMicro + reservedMicro + reserve > scanBudget * 1_000_000)
    throw new Error("Treg scan budget exhausted.");

  // The reservation is made before yielding so parallel stores share the same budget.
  calls++;
  reservedMicro += reserve;
  let settled = false;
  try {
    const response = await fetch(`${ENDPOINT}${capability}`, {
      method: "POST",
      headers: {
        "X-Treg-Token": token,
        "X-Treg-Route-Max-Cost": perCall.toString(),
        "X-Treg-Route-Waterfall": "1",
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.TREG_ORG?.trim() ? { "X-Treg-Org": process.env.TREG_ORG.trim() } : {}),
      },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    // A 202 is still processing and may incur a charge. Do not try another provider.
    if (response.status === 202) throw new Error("Treg job is pending; no retry.");
    if (!response.ok) throw new Error("Treg provider unavailable.");
    const raw = resultSchema.parse(await boundedJson(response, 200_000));
    if (object(raw["_treg"])?.outcome === "pending")
      throw new Error("Treg job is pending; no retry.");
    // The billed amount comes from the response HEADER, never from a provider's body.
    const headerCost = response.headers.get("X-Treg-Cost-Micro");
    const billed = headerCost === null ? NaN : Number(headerCost);
    const actual = Number.isSafeInteger(billed) && billed >= 0 ? billed : reserve;
    committedMicro += actual;
    settled = true;
    return raw.output;
  } finally {
    reservedMicro -= reserve;
    // When a response was lost the server may still have charged. Do not silently
    // re-submit the same request: the caller falls back to existing public sources.
    if (!settled) committedMicro += reserve;
  }
}

const rowSchema = z
  .object({
    title: z.string().max(300),
    url: z.string().max(2000),
    description: z.string().max(1200).optional(),
  })
  .passthrough();

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function tregSearchRows(output: unknown) {
  const root = object(output);
  const web = object(root?.web);
  const data = object(root?.data);
  const items = Array.isArray(output)
    ? output
    : ([root?.results, root?.organic, root?.organic_results, web?.results, data?.results].find(
        Array.isArray,
      ) ?? []);
  const rows: z.infer<typeof rowSchema>[] = [];
  for (const item of items.slice(0, 20)) {
    const candidate = object(item);
    if (!candidate) continue;
    const parsed = rowSchema.safeParse({
      title: candidate.title ?? candidate.name,
      url: candidate.url ?? candidate.link,
      description: candidate.description ?? candidate.snippet ?? undefined,
    });
    if (parsed.success) rows.push(parsed.data);
  }
  return rows.slice(0, 8);
}

/** Third-party extraction is for REVIEW LEADS only, not direct publication. */
export function tregExtractedText(output: unknown): string | null {
  const root = object(output);
  const data = object(root?.data);
  const candidate = [root?.markdown, root?.text, root?.content, data?.markdown, data?.text].find(
    (value) => typeof value === "string",
  );
  if (typeof candidate !== "string") return null;
  const clean = candidate.replace(/\s+/g, " ").trim();
  return clean.length >= 100 && clean.length <= 50_000 ? clean : null;
}

// Test-only reset; never called by production discovery.
export function resetTregUsage() {
  calls = 0;
  committedMicro = 0;
  reservedMicro = 0;
}
