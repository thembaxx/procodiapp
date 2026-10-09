import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { appearanceBootstrap, appearanceCriticalCss, appearanceNoScript } from "@/lib/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grocery codes — A little less at checkout",
  description:
    "Find today's South African grocery promotions. Explore six stores, filter free delivery and discounts, and copy coupon codes in a tap.",
  applicationName: "Grocery Codes SA",
  icons: {
    icon: "/icon.svg",
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Grocery codes" },
};

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
