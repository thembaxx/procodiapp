import type { Metadata } from "next";
import { stores } from "./stores";
import { brandName, brandTagline } from "./brand";

export const siteName = brandName;
export const siteDescription =
  "Find South African grocery coupon codes, free delivery and discounts. Read qualifying terms and expiry dates for Checkers, Pick n Pay, Woolworths, Shoprite, SPAR and Makro.";

export function siteConfig(env: Record<string, string | undefined> = process.env) {
  let origin: string | null = null;
  try {
    const url = new URL(
      env.SITE_URL ||
        (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : ""),
    );
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      origin = url.origin;
  } catch {
    /* An unconfigured preview must never invent a production hostname. */
  }
  return {
    origin,
    indexable:
      !!origin &&
      (env.INDEXING_ENABLED ? env.INDEXING_ENABLED === "true" : env.VERCEL_ENV === "production"),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.CONTACT_EMAIL ?? "")
      ? env.CONTACT_EMAIL
      : null,
  };
}

export function pageMetadata(title: string, description: string, pathname: string): Metadata {
  const { origin, indexable } = siteConfig();
  const url = origin ? (pathname === "/" ? origin : new URL(pathname, origin).href) : undefined;
  return {
    title,
    description,
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: url } } : {}),
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: "website",
      title,
      description,
      siteName,
      locale: "en_ZA",
      ...(url
        ? {
            url,
            images: [
              {
                url: `${origin}/share-image`,
                width: 1200,
                height: 630,
                alt: `${siteName} — ${brandTagline}`,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(origin ? { images: [`${origin}/share-image`] } : {}),
    },
  };
}

export const publicPaths = [
  "/",
  "/stores",
  ...stores.map((store) => `/stores/${store.id}`),
  "/about",
  "/privacy",
];

export function jsonLd(value: unknown): string {
  // Source content must never terminate a script element.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
