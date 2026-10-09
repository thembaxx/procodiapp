import { siteConfig } from "../site";

export function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  // Non-browser clients still pass through the rate limiter.
  return !origin || origin === (siteConfig().origin ?? new URL(request.url).origin);
}
export function clientBucket(request: Request): string {
  return process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown"
    : "local";
}
export class InvalidBody extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function reportBody(request: Request, maximumBytes = 2000): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    throw new InvalidBody(415, "Send a JSON report.");
  if (Number(request.headers.get("content-length") ?? 0) > maximumBytes)
    throw new InvalidBody(413, "Report is too large.");
  if (!request.body) throw new InvalidBody(400, "Invalid report.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new InvalidBody(413, "Report is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new InvalidBody(400, "Invalid report.");
  }
}
