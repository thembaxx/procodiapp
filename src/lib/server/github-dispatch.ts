import { takeRefreshSlot } from "./storage";

export type DispatchStatus =
  | { status: "not_configured" | "recent" | "queued" | "failed" }
  | { status: "cooldown"; retryAfter: number };

/**
 * Only the server may dispatch this fixed workflow. The GitHub Actions token is
 * never returned to the browser and repeated refreshes share one global slot.
 */
export async function queuePromotionDiscovery(updatedAt: string | null): Promise<DispatchStatus> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { status: "not_configured" };
  if (updatedAt && Number.isFinite(Date.parse(updatedAt)) &&
      Date.now() - Date.parse(updatedAt) >= 0 &&
      Date.now() - Date.parse(updatedAt) < 600_000)
    return { status: "recent" };
  const retryAfter = await takeRefreshSlot("discovery:global", 600);
  if (retryAfter) return { status: "cooldown", retryAfter };

  const repository = process.env.PROMOTION_FEED_REPOSITORY || "thembaxx/procodiapp";
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repository))
    return { status: "failed" };
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/discovery.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    return { status: response.ok ? "queued" : "failed" };
  } catch {
    return { status: "failed" };
  }
}
