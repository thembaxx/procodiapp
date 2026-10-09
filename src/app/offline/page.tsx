import type { Metadata } from "next";
import { OfflineApp } from "@/components/offline-app";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OfflinePage() {
  return <OfflineApp />;
}
