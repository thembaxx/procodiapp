import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  DiscoveryBusyError,
  hasCompletedDiscovery,
  refreshPromotions,
} from "@/lib/server/promotion-refresh";
import { cleanupExpiredData } from "@/lib/server/storage";

export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  const target = `Bearer ${expected}`;
  if (
    !expected ||
    expected.length < 32 ||
    Buffer.byteLength(actual) !== Buffer.byteLength(target) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(target))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await cleanupExpiredData();
    const data = await refreshPromotions();
    const unavailable = !hasCompletedDiscovery(data);
    return NextResponse.json(
      { ...data, ...(unavailable ? { error: "No promotion source could be checked." } : {}) },
      { status: unavailable ? 503 : 200 },
    );
  } catch (error) {
    if (error instanceof DiscoveryBusyError)
      return NextResponse.json(
        { error: "Discovery is busy or cooling down.", retryAfter: error.retryAfter },
        { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
      );
    return NextResponse.json({ error: "Scheduled discovery failed." }, { status: 503 });
  }
}
