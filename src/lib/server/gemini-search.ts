import { z } from "zod";
import { stores } from "../stores";
import { boundedJson } from "./bounded-input";

const searchRows = z.object({
  results: z
    .array(
      z.object({
        storeId: z.enum(["checkers", "pnp", "woolworths", "shoprite", "spar", "makro"]),
        title: z.string().max(200),
        url: z.url().max(2000),
      }),
    )
    .max(30),
});
const geminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z.object({
          parts: z.array(
            z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
          ),
        }),
        groundingMetadata: z
          .object({
            webSearchQueries: z.array(z.string()).optional(),
            groundingChunks: z.array(z.unknown()).optional(),
          })
          .optional(),
      }),
    )
    .max(1),
});

export type GeminiSearch = {
  searched: boolean;
  rows: z.infer<typeof searchRows>["results"];
  warning?: string;
};

/** One free-tier-compatible grounded request per scan, shared by all retailers. */
export async function searchGeminiPromotions(signal: AbortSignal): Promise<GeminiSearch> {
  const empty = { searched: false, rows: [] };
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.DISCOVERY_SEARCH_MODE === "none") return empty;

  const date = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "long",
  }).format(new Date());
  try {
    signal.throwIfAborted();
    // Pin a model whose generation AND Google Search grounding have a free tier.
    // Billing is controlled by the operator's Google project, not by the API call.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    `Use Google Search to find current South African online grocery promotions, coupon terms and free delivery offers as of ${date}.`,
                    "Search each retailer below. Prefer specific official campaign and terms pages over homepages. Return at most three official pages and two South African Wethrift or Picodi retailer pages per store.",
                    ...stores.map(
                      (store) =>
                        `${store.id}: ${store.name}; official domains: ${store.domains.join(", ")}`,
                    ),
                    'Return only JSON: {"results":[{"storeId":"pnp","title":"Page title","url":"https://www.pnp.co.za/exact-source-path"}]}.',
                    "Use original HTTPS source URLs, not Google redirect links. Do not invent links or codes. Omit unavailable results. These URLs will be independently checked; model text is never coupon evidence.",
                  ].join("\n"),
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
      },
    );
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return {
        ...empty,
        warning:
          response.status === 429
            ? "Gemini free-tier quota was reached; using other sources."
            : "Gemini web search was unavailable; using other sources.",
      };
    }
    const parsed = geminiResponse.parse(await boundedJson(response, 150_000));
    const candidate = parsed.candidates[0];
    if (
      !candidate ||
      candidate.finishReason !== "STOP" ||
      !candidate.groundingMetadata?.webSearchQueries?.length ||
      !candidate.groundingMetadata.groundingChunks?.length
    )
      throw new Error("No completed grounded search.");
    const text = candidate.content.parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return { searched: true, rows: searchRows.parse(JSON.parse(text)).results };
  } catch {
    // Provider bodies/errors may contain credentials or generated claims. Never publish them.
    return { ...empty, warning: "Gemini web search was unavailable; using other sources." };
  }
}
