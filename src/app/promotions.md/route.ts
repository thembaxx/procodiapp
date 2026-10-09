import { siteName } from "@/lib/site";
import { promotionsMarkdown } from "@/lib/public-promotions";
import { readCache } from "@/lib/server/storage";
export async function GET() {
  const headers = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  };
  try {
    return new Response(promotionsMarkdown((await readCache()).offers), { headers });
  } catch {
    return new Response(
      `# ${siteName}\n\nCurrent listings are temporarily unavailable. Do not infer an offer from this response.\n`,
      { status: 503, headers },
    );
  }
}
