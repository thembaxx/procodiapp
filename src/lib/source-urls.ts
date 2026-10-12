import { stores, type Store } from "./stores";

const voucherDomains = ["picodi.com", "wethrift.com"];
function approvedHost(host: string, domains: readonly string[]) {
  // Subdomains must be reviewed explicitly; a parent domain is not a wildcard.
  return domains.some((domain) => host === domain || host === `www.${domain}`);
}
export function allowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      approvedHost(url.hostname, [
        ...stores.flatMap((store) => [...store.domains]),
        ...voucherDomains,
      ])
    );
  } catch {
    return false;
  }
}
export function allowedStoreUrl(value: string, store: Store): boolean {
  if (!allowedUrl(value)) return false;
  const url = new URL(value);
  if (approvedHost(url.hostname, store.domains)) return true;
  if (!approvedHost(url.hostname, voucherDomains)) return false;
  // Aggregators cover many unrelated merchants and countries. A search hit
  // must point to this retailer, not simply to an approved aggregator hostname.
  const merchants = {
    checkers: "checkers|sixty60|sixty-60",
    pnp: "pnp|pick-n-pay|picknpay|pick-and-pay",
    woolworths: "woolworths|woolies",
    shoprite: "shoprite",
    spar: "spar|spar2u",
    makro: "makro",
  };
  try {
    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    if (approvedHost(url.hostname, ["picodi.com"]) && !pathname.startsWith("/za/")) return false;
    return new RegExp(`(?:^|[-_/])(?:${merchants[store.id]})(?:[-_/]|$)`).test(pathname);
  } catch {
    return false;
  }
}
