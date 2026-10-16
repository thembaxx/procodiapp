import { NextRequest, NextResponse } from "next/server";
import { requireDiscovery } from "@/lib/server/discovery";
import { usesGithubFeed } from "@/lib/server/github-feed";
import { queuePromotionDiscovery } from "@/lib/server/github-dispatch";
import { takeRefreshSlot } from "@/lib/server/storage";
import {
  DiscoveryBusyError,
  hasCompletedDiscovery,
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
    if (!usesGithubFeed()) requireDiscovery();
    const ip = clientBucket(request);
    const retryAfter = await takeRefreshSlot(`refresh:client:${ip}`);
    if (retryAfter)
      return NextResponse.json(
        { error: `Give the source check a moment. Refresh again in ${retryAfter}s.`, retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    const data = await refreshPromotions();
    if (!hasCompletedDiscovery(data))
      return NextResponse.json(
        { error: "We couldn't check promotion sources right now. Please try again later." },
        { status: 503 },
      );
    // With the published feed, refresh returns current offers immediately while
    // optionally queuing a new scan on the Actions runner. Do not block the UI.
    const scan = usesGithubFeed()
      ? await queuePromotionDiscovery(data.updatedAt).catch(() => ({ status: "failed" as const }))
      : undefined;
    return NextResponse.json({ ...data, ...(scan ? { scan } : {}) },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryBusyError)
      return NextResponse.json(
        {
          error: `Give the source check a moment. Try again in ${error.retryAfter}s.`,
          retryAfter: error.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return NextResponse.json(
      { error: "We couldn't complete the source check. Your last checked offers are still here." },
      { status: 503 },
    );
  }
}
