import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { discoverOffers } from "@/lib/server/discovery";

export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") ?? "";
  const target = `Bearer ${expected}`;
  if (
    !expected ||
    Buffer.byteLength(actual) !== Buffer.byteLength(target) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(target))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await discoverOffers());
  } catch {
    return NextResponse.json({ error: "Scheduled discovery failed." }, { status: 503 });
  }
}
