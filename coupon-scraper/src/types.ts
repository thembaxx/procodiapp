export interface ScrapeTarget {
  merchant: string;
  url: string;
  selectors: string[];
  usePuppeteer?: boolean;
}
export interface Coupon {
  id: string;
  code: string | null;
  merchant: string;
  title: string | null;
  description: string | null;
  discount: string | null;
  source_url: string;
  found_at: string;
  expires_at: string | null;
}
export interface ScrapeJob {
  index: number;
}
