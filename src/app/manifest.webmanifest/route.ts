import type { MetadataRoute } from "next";
import { appearanceBackground } from "@/lib/appearance";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const background = appearanceBackground(searchParams.get("theme"), searchParams.get("design"));
  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name: "Grocery Codes SA",
    short_name: "Grocery codes",
    description: "A little less at checkout. Today's South African grocery promotions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    lang: "en-ZA",
    dir: "ltr",
    categories: ["shopping", "utilities"],
    prefer_related_applications: false,
    launch_handler: { client_mode: "navigate-existing" },
    background_color: background,
    theme_color: background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/screenshots/phone.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Your grocery stores and today's savings",
      },
    ],
    shortcuts: [
      {
        name: "Free delivery",
        description: "Find grocery delivery benefits",
        url: "/?filter=free_delivery",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Discounts",
        description: "Find grocery discounts",
        url: "/?filter=discount",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Saved offers",
        description: "Open your saved promotions",
        url: "/?saved=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
