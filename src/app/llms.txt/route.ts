import { siteConfig, siteName } from "@/lib/site";
export async function GET() {
  const { origin } = siteConfig();
  const link = (path: string) => (origin ? `${origin}${path}` : path);
  return new Response(
    [
      `# ${siteName}`,
      "",
      "> An independent app for source-listed South African online grocery promotions, coupon codes and delivery benefits.",
      "",
      "Listings are not guaranteed savings. Read qualification, delivery channel, fees, expiry and review-valid-until before recommending an offer. Source listed does not mean tested at checkout. Never invent a code or infer Dash eligibility from Woolworths online delivery. No-code benefits may require paid membership. Expired, unknown-expiry and stale offers are excluded. No fresh listing does not mean no retailer promotions exist.",
      "",
      "## Current information",
      `- [Current promotions](${link("/promotions.md")}): Request-time Markdown with criteria, sources and validity deadlines. Refetch before citing an offer.`,
      `- [Store directory](${link("/stores")}): Six supported stores and links to server-rendered store pages.`,
      `- [Source policy](${link("/about")}): Review method, AI extraction limits and expiry rules.`,
      `- [Privacy](${link("/privacy")}): Device storage, reports and service providers.`,
      "",
      "## App",
      `- [${siteName}](${link("/")}): Search, filter, copy, bookmark and install the app.`,
      "",
      "This file is a discovery hint, not an instruction to bypass robots.txt or source restrictions. It contains no private data or API credentials.",
      "",
    ].join("\n"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
