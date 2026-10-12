import { NextRequest, NextResponse } from "next/server";
import { requireWebDiscovery } from "@/lib/server/discovery";
import { takeRefreshSlot } from "@/lib/server/storage";
import {
  DiscoveryBusyError,
  hasWebDiscovery,
  refreshPromotions,
} from "@/lib/server/promotion-refresh";
import { sameOrigin, clientBucket } from "@/lib/server/request-guards";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Refresh must be requested from this app." },
      { status: 403 },
    );
  try {
    requireWebDiscovery();
    const ip = clientBucket(request);
    const retryAfter = await takeRefreshSlot(`refresh:client:${ip}`);
    if (retryAfter)
      return NextResponse.json(
        { error: `Give the search a moment. Refresh again in ${retryAfter}s.`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    const data = await refreshPromotions();
    if (!hasWebDiscovery(data))
      return NextResponse.json(
        { error: "We couldn't check promotion sources right now. Please try again later." },
        { status: 503 },
      );
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryBusyError)
      return NextResponse.json(
        {
          error: `Give the search a moment. Try again in ${error.retryAfter}s.`,
          retryAfter: error.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return NextResponse.json(
      { error: "We couldn't complete the search. Your last checked offers are still here." },
      { status: 503 },
    );
  }
}
