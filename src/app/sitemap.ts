import type { MetadataRoute } from "next";
import { publicPaths, siteConfig } from "@/lib/site";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const { origin, indexable } = siteConfig();
  // Do not invent last-modified dates or include view/filter query variants.
  return origin && indexable
    ? publicPaths.map((path) => ({ url: new URL(path, origin).href }))
    : [];
}
