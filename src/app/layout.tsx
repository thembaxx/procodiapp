import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { appearanceBootstrap, appearanceCriticalCss, appearanceNoScript } from "@/lib/appearance";
import { pageMetadata, siteDescription, siteName } from "@/lib/site";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    ...pageMetadata(
      `${siteName} — South African grocery coupons & free delivery`,
      siteDescription,
      "/",
    ),
    applicationName: siteName,
    icons: {
      icon: "/icon.svg",
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: siteName },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/jakarta-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/bricolage-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/instrument-italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <noscript dangerouslySetInnerHTML={{ __html: appearanceNoScript }} />
        <style dangerouslySetInnerHTML={{ __html: appearanceCriticalCss }} />
        <script id="grocery-appearance" dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
