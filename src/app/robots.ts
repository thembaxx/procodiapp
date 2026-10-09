import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const { origin, indexable } = siteConfig();
  return indexable
    ? {
        rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/offline"] },
        sitemap: `${origin}/sitemap.xml`,
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
