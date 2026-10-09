import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoverOffers } from "@/lib/server/discovery";
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
    const data = await discoverOffers();
    const unavailable = !data.checks.some((check) => check.status === "checked");
    return NextResponse.json(
      { ...data, ...(unavailable ? { error: "No promotion source could be checked." } : {}) },
      { status: unavailable ? 503 : 200 },
    );
  } catch {
    return NextResponse.json({ error: "Scheduled discovery failed." }, { status: 503 });
  }
}
