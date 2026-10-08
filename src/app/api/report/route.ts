import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readCache, saveReport, takeRefreshSlot } from "@/lib/server/storage";

const schema = z.object({
  offerId: z.string().max(180),
  reason: z.enum(["The code didn't work", "The offer has ended", "The terms are different"]),
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2000)
    return NextResponse.json({ error: "Report is too large." }, { status: 413 });
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    const cache = await readCache();
    if (!cache.offers.some((offer) => offer.id === parsed.data.offerId))
      return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    const ip =
      process.env.TRUST_PROXY === "true"
        ? (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
        : "local";
    const retryAfter = await takeRefreshSlot(`report:${ip}`);
    if (retryAfter)
      return NextResponse.json(
        { error: "Please wait before reporting again." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    await saveReport(parsed.data.offerId, parsed.data.reason);
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Report could not be saved." }, { status: 503 });
  }
}
