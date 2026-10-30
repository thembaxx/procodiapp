/** Cross-retailer browser budget: one start per 30 seconds (conservative Free tier). */
export const BROWSER_SPACING_SECONDS = 30;

export function pacedJobs(
  indices: readonly number[],
): { body: { index: number }; delaySeconds: number }[] {
  return indices.map((index, position) => ({
    body: { index },
    delaySeconds: position * BROWSER_SPACING_SECONDS,
  }));
}

export type ScrapeFailure = {
  provider: "browser_run" | "retailer" | "worker";
  code:
    | "browser_rate_limited"
    | "browser_http_error"
    | "browser_launch_error"
    | "retailer_access_denied"
    | "retailer_page_missing"
    | "retailer_rate_limited"
    | "retailer_navigation_error"
    | "retailer_selector_error"
    | "scrape_error";
  httpStatus: number | null;
};

/** Keep stable, non-sensitive failure codes. Never publish raw provider errors or URLs. */
export function classifyScrapeError(error: unknown): ScrapeFailure {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/\b(?:returned|code:|status:)\s*(\d{3})\b/i);
  const httpStatus = status ? Number(status[1]) : null;
  // An HTTP error from the retailer is distinct from a Browser Run API error.
  if (/retailer navigation returned\s+\d{3}/i.test(message)) {
    const code =
      httpStatus === 401 || httpStatus === 403
        ? "retailer_access_denied"
        : httpStatus === 404 || httpStatus === 410
          ? "retailer_page_missing"
          : httpStatus === 429
            ? "retailer_rate_limited"
            : "retailer_navigation_error";
    return { provider: "retailer", code, httpStatus };
  }
  if (/retailer page not found/i.test(message))
    return { provider: "retailer", code: "retailer_page_missing", httpStatus: 404 };
  if (
    httpStatus === 429 ||
    /rate limit exceeded|too many requests|browser time limit exceeded/i.test(message)
  )
    return { provider: "browser_run", code: "browser_rate_limited", httpStatus: 429 };
  if (/browser scrape returned\s+\d{3}/i.test(message))
    return { provider: "browser_run", code: "browser_http_error", httpStatus };
  if (/unable to create new browser/i.test(message))
    return { provider: "browser_run", code: "browser_launch_error", httpStatus };
  if (
    /retailer selector (?:timeout|missing|unavailable)|retailer selectors matched no readable content|waiting for selector/i.test(
      message,
    )
  )
    return { provider: "retailer", code: "retailer_selector_error", httpStatus };
  if (/navigation|net::ERR_|timeout|ERR_ABORTED/i.test(message))
    return { provider: "retailer", code: "retailer_navigation_error", httpStatus };
  return { provider: "worker", code: "scrape_error", httpStatus };
}

/** Do not repeat requests to an explicitly denied/missing page or a rate-limited source. */
export function shouldRetryScrape(failure: ScrapeFailure): boolean {
  return ![
    "browser_rate_limited",
    "retailer_access_denied",
    "retailer_page_missing",
    "retailer_rate_limited",
  ].includes(failure.code);
}
