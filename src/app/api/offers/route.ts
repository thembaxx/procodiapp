import { NextRequest, NextResponse } from "next/server";
import { filterOffers, type Filter } from "@/lib/offers";
import { readCache } from "@/lib/server/storage";

export async function GET(request: NextRequest) {
  const filter = request.nextUrl.searchParams.get("filter") ?? "all";
  if (!["all", "free_delivery", "discount"].includes(filter))
    return NextResponse.json({ error: "Unknown promotion filter." }, { status: 400 });
  try {
    const cache = await readCache();
    return NextResponse.json(
      {
        ...cache,
        offers: filterOffers(
          cache.offers,
          filter as Filter,
          (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100),
        ),
        newOfferIds: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Promotions are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
