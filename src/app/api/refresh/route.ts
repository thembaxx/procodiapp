import { NextRequest, NextResponse } from "next/server";
import { discoverOffers } from "@/lib/server/discovery";
import { takeRefreshSlot, PUBLIC_DISCOVERY_COOLDOWN_SECONDS } from "@/lib/server/storage";
import { filterOffers } from "@/lib/offers";
import { sameOrigin, clientBucket } from "@/lib/server/request-guards";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Refresh must be requested from this app." },
      { status: 403 },
    );
  try {
    const ip = clientBucket(request);
    const retryAfter = await takeRefreshSlot(`refresh:client:${ip}`);
    if (retryAfter)
      return NextResponse.json(
        { error: `Give the search a moment. Refresh again in ${retryAfter}s.`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    // At most six public discovery attempts per hour across clients/instances.
    const globalWait = await takeRefreshSlot("discovery:global", PUBLIC_DISCOVERY_COOLDOWN_SECONDS);
    if (globalWait)
      return NextResponse.json(
        {
          error: `Sources were just checked. Try again in ${globalWait}s.`,
          retryAfter: globalWait,
        },
        { status: 429, headers: { "Retry-After": String(globalWait) } },
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
