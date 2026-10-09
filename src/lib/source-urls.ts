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
  return (
    allowedUrl(value) &&
    approvedHost(new URL(value).hostname, [...store.domains, ...voucherDomains])
  );
}
