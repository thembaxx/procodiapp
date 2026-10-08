import { NextRequest, NextResponse } from "next/server";
import { discoverOffers } from "@/lib/server/discovery";
import { takeRefreshSlot } from "@/lib/server/storage";
import { filterOffers } from "@/lib/offers";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Refresh must be requested from this app." },
      { status: 403 },
    );
  try {
    // Only trust forwarding headers when a deployment's ingress overwrites them.
    const ip =
      process.env.TRUST_PROXY === "true"
        ? (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown")
        : "local";
    const retryAfter = await takeRefreshSlot(ip);
    if (retryAfter)
      return NextResponse.json(
        { error: `Give the search a moment. Refresh again in ${retryAfter}s.`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    const data = await discoverOffers();
    return NextResponse.json(
      { ...data, offers: filterOffers(data.offers) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "We couldn't complete the search. Your last checked offers are still here." },
      { status: 503 },
    );
  }
}
