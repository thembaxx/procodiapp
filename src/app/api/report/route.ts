import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readCache, saveReport, takeRefreshSlot } from "@/lib/server/storage";
import { sameOrigin, clientBucket, reportBody, InvalidBody } from "@/lib/server/request-guards";

const schema = z.strictObject({
  offerId: z.string().min(1).max(180),
  reason: z.enum(["The code didn't work", "The offer has ended", "The terms are different"]),
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const parsed = schema.safeParse(await reportBody(request));
    if (!parsed.success) return NextResponse.json({ error: "Invalid report." }, { status: 400 });
    const cache = await readCache();
    if (!cache.offers.some((offer) => offer.id === parsed.data.offerId))
      return NextResponse.json({ error: "Offer not found." }, { status: 404 });
    const ip = clientBucket(request);
    const retryAfter = await takeRefreshSlot(`report:${ip}`);
    if (retryAfter)
      return NextResponse.json(
        { error: "Please wait before reporting again." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    await saveReport(parsed.data.offerId, parsed.data.reason);
    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidBody)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Report could not be saved." }, { status: 503 });
  }
}
