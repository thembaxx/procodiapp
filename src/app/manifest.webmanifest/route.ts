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
    background_color: background,
    theme_color: background,
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
