import { checkStorage } from "@/lib/server/storage";
export async function GET() {
  const ready = await checkStorage();
  return Response.json(
    { status: ready ? "ready" : "unavailable" },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}
