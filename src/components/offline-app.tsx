"use client";

import { useEffect, useState } from "react";
import { GroceryApp } from "@/components/grocery-app";
import { readOfflineOffers, emptyOffers } from "@/lib/offline-store";
import type { OffersResponse } from "@/lib/offers";
import Loading from "@/app/loading";
import { usePwa } from "@/components/pwa-provider";

export function OfflineApp() {
  const { markSnapshotReady } = usePwa();
  const [snapshot, setSnapshot] = useState<{
    data: OffersResponse;
    savedAt: number;
    now: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    readOfflineOffers().then((saved) => {
      if (!cancelled) {
        markSnapshotReady(!!saved);
        setSnapshot({
          data: saved?.data ?? emptyOffers,
          savedAt: saved?.savedAt ?? 0,
          now: Date.now(),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [markSnapshotReady]);
  return snapshot ? (
    <GroceryApp
      initialData={snapshot.data}
      initialNow={snapshot.now}
      offlineLaunch
      cachedAt={snapshot.savedAt}
    />
  ) : (
    <Loading />
  );
}
