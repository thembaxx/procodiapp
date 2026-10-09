import { siteConfig } from "../site";
import { isIP } from "node:net";
import { boundedText, InputLimit } from "./bounded-input";

export function sameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  // Non-browser clients still pass through the rate limiter.
  return !origin || origin === (siteConfig().origin ?? new URL(request.url).origin);
}
export function clientBucket(request: Request): string {
  if (process.env.TRUST_PROXY !== "true") return "local";
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const family = address.length <= 45 && !address.includes("%") ? isIP(address) : 0;
  if (!family) return "unknown";
  return family === 6 ? new URL(`http://[${address}]`).hostname.slice(1, -1) : address;
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
  if (!request.body) throw new InvalidBody(400, "Invalid report.");
  try {
    return JSON.parse(await boundedText(request, maximumBytes, 5000));
  } catch (error) {
    if (error instanceof InputLimit)
      throw new InvalidBody(
        error.kind === "size" ? 413 : 408,
        error.kind === "size" ? "Report is too large." : "Report timed out.",
      );
    throw new InvalidBody(400, "Invalid report.");
  }
}
