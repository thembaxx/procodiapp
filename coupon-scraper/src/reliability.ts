import type { ScrapeTarget } from "./types";
import type { ScrapeFailure } from "./scrape-policy";

export type OfferKind =
  | "coupon_code"
  | "discount"
  | "free_delivery"
  | "catalogue_special"
  | "loyalty"
  | "bundle"
  | "cashback";

export interface VerifiedOffer {
  id: string;
  merchant: string;
  store_id: string;
  kind: OfferKind;
  title: string;
  criteria: string;
  code: string | null;
  channel: "online" | "in_store" | "both";
  region: string | null;
  source_url: string;
  source_evidence: string;
  expires_at: string | null;
  ongoing: number;
  checked_at: string;
  valid_until: string;
  checkout_tested: number;
}

type SourceState = {
  merchant: string;
  status: string;
  checked_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  cooldown_until: string | null;
  extracted_count: number;
  error_provider: string | null;
  last_error_code: string | null;
  last_error_status: number | null;
  last_error_at: string | null;
};

const kinds = new Set<OfferKind>([
  "coupon_code",
  "discount",
  "free_delivery",
  "catalogue_special",
  "loyalty",
  "bundle",
  "cashback",
]);
const channels = new Set(["online", "in_store", "both"]);
const storeIds: Record<string, string> = {
  "Pick n Pay": "pnp",
  "Pick n Pay ASAP": "pnp",
  ShopRite: "shoprite",
  Makro: "makro",
  Woolworths: "woolworths",
  Checkers: "checkers",
  SPAR: "spar",
  Clicks: "clicks",
  Takealot: "takealot",
  "Dis-Chem": "dis-chem",
  "Mr D": "mr-d",
  Game: "game",
  "Food Lover's Market": "food-lover-s-market",
  Boxer: "boxer",
  "OK Foods": "ok-foods",
  "HiFi Corp": "hifi-corp",
  Wootware: "wootware",
  Truworths: "truworths",
  "The Fix": "the-fix",
  "Cotton On": "cotton-on",
  Sportscene: "sportscene",
  "Total Sports": "total-sports",
  Foschini: "foschini",
  Ackermans: "ackermans",
  Pep: "pep",
  Jet: "jet",
  OneDayOnly: "onedayonly",
  Loot: "loot",
  Chamberlains: "chamberlains",
  Sorbet: "sorbet",
  "The Body Shop SA": "the-body-shop-sa",
  "Toy Kingdom": "toy-kingdom",
  "Bargain Books": "bargain-books",
  "Baby City": "baby-city",
};

function textField(value: unknown, max: number, min = 1): string | null {
  return typeof value === "string" && value.trim().length >= min && value.length <= max
    ? value.trim()
    : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function allowedOfficialSource(url: string, official: string): boolean {
  try {
    const supplied = new URL(url);
    const target = new URL(official);
    return (
      supplied.protocol === "https:" &&
      !supplied.username &&
      !supplied.password &&
      !supplied.hash &&
      supplied.hostname === target.hostname &&
      !supplied.port &&
      url.length <= 2000
    );
  } catch {
    return false;
  }
}

/** Publication is explicit operator review. Automated browser results are never implicitly approved. */
export function parseReviewedOffer(
  body: unknown,
  targets: readonly ScrapeTarget[],
  at = new Date(),
): VerifiedOffer | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const merchant = textField(value.merchant, 100);
  const target = targets.find((item) => item.merchant === merchant);
  const storeId = textField(value.storeId, 100);
  const kind = value.kind;
  const channel = value.channel;
  const title = textField(value.title, 160, 5);
  const criteria = textField(value.criteria, 650, 10);
  const evidence = textField(value.evidence, 800, 15);
  const sourceUrl = textField(value.sourceUrl, 2000);
  const code =
    value.code === null || value.code === undefined ? null : textField(value.code, 64, 2);
  const region =
    value.region === null || value.region === undefined ? null : textField(value.region, 100, 2);
  const ongoing = value.ongoing === true;
  const expiresAt = value.expiresAt === null ? null : validDate(value.expiresAt);
  if (
    !target ||
    !merchant ||
    !storeId ||
    storeIds[merchant] !== storeId ||
    !kinds.has(kind as OfferKind) ||
    !channels.has(channel as string) ||
    !title ||
    !criteria ||
    !evidence ||
    !sourceUrl ||
    !allowedOfficialSource(sourceUrl, target.url) ||
    (value.code != null && !code) ||
    (value.region != null && !region) ||
    (kind === "coupon_code" && !code) ||
    ongoing === (expiresAt !== null) ||
    (!ongoing && (!expiresAt || Date.parse(expiresAt) <= at.getTime())) ||
    (ongoing && value.expiresAt !== null)
  )
    return null;
  // No claimed checkout testing via this review API: evidence of working checkout
  // needs a separately designed audited process.
  const now = at.toISOString();
  const expiry = expiresAt ? Date.parse(expiresAt) : Infinity;
  const validUntil = new Date(Math.min(at.getTime() + 86_400_000, expiry)).toISOString();
  const id = textField(value.id, 128, 5);
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return {
    id,
    merchant,
    store_id: storeId,
    kind: kind as OfferKind,
    title,
    criteria,
    code,
    channel: channel as VerifiedOffer["channel"],
    region,
    source_url: sourceUrl,
    source_evidence: evidence,
    expires_at: expiresAt,
    ongoing: ongoing ? 1 : 0,
    checked_at: now,
    valid_until: validUntil,
    checkout_tested: 0,
  };
}

export async function approveReviewedOffer(db: D1Database, offer: VerifiedOffer): Promise<void> {
  await db
    .prepare(
      "INSERT INTO verified_offers " +
        "(id,merchant,store_id,kind,title,criteria,code,channel,region,source_url,source_evidence,expires_at,ongoing,checked_at,valid_until,checkout_tested,status) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'published') " +
        "ON CONFLICT(id) DO UPDATE SET merchant=excluded.merchant,store_id=excluded.store_id," +
        "kind=excluded.kind,title=excluded.title,criteria=excluded.criteria,code=excluded.code," +
        "channel=excluded.channel,region=excluded.region,source_url=excluded.source_url," +
        "source_evidence=excluded.source_evidence,expires_at=excluded.expires_at," +
        "ongoing=excluded.ongoing,checked_at=excluded.checked_at,valid_until=excluded.valid_until," +
        "checkout_tested=0,status='published'",
    )
    .bind(
      offer.id,
      offer.merchant,
      offer.store_id,
      offer.kind,
      offer.title,
      offer.criteria,
      offer.code,
      offer.channel,
      offer.region,
      offer.source_url,
      offer.source_evidence,
      offer.expires_at,
      offer.ongoing,
      offer.checked_at,
      offer.valid_until,
      offer.checkout_tested,
    )
    .run();
}

export async function listVerifiedOffers(
  db: D1Database,
  now = new Date(),
): Promise<VerifiedOffer[]> {
  const result = await db
    .prepare(
      "SELECT id,merchant,store_id,kind,title,criteria,code,channel,region,source_url," +
        "source_evidence,expires_at,ongoing,checked_at,valid_until,checkout_tested " +
        "FROM verified_offers WHERE status='published' AND valid_until > ? " +
        "AND (ongoing=1 OR expires_at > ?) ORDER BY checked_at DESC LIMIT 500",
    )
    .bind(now.toISOString(), now.toISOString())
    .all<VerifiedOffer>();
  return result.results;
}

/** Atomic shared browser launch reservation across queue consumers and triggers. */
export async function reserveBrowserSlot(
  db: D1Database,
  spacingSeconds: number,
  now = new Date(),
): Promise<boolean> {
  const next = new Date(now.getTime() + spacingSeconds * 1000).toISOString();
  const claimed = await db
    .prepare(
      "INSERT INTO browser_rate_gate (name,next_allowed_at) VALUES ('shared',?) " +
        "ON CONFLICT(name) DO UPDATE SET next_allowed_at=excluded.next_allowed_at " +
        "WHERE browser_rate_gate.next_allowed_at <= ? RETURNING next_allowed_at",
    )
    .bind(next, now.toISOString())
    .first<{ next_allowed_at: string }>();
  return !!claimed;
}

export async function sourceCoolingDown(db: D1Database, merchant: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT cooldown_until FROM source_health WHERE merchant = ?")
    .bind(merchant)
    .first<{ cooldown_until: string | null }>();
  return !!row?.cooldown_until && Date.parse(row.cooldown_until) > Date.now();
}

export async function recordSourceCheck(
  db: D1Database,
  merchant: string,
  status: "checked" | "empty" | "failed",
  extracted: number,
  diagnostic?: ScrapeFailure,
): Promise<void> {
  const now = new Date();
  const existing = await db
    .prepare("SELECT consecutive_failures FROM source_health WHERE merchant = ?")
    .bind(merchant)
    .first<{ consecutive_failures: number }>();
  const failures = status === "failed" ? (existing?.consecutive_failures ?? 0) + 1 : 0;
  // On a provider outage back off for up to six hours. Even an empty scrape
  // remains a candidate-only result and is not a published offer.
  const delay =
    diagnostic?.code === "browser_rate_limited"
      ? 6 * 3600
      : failures >= 2
        ? Math.min(6 * 3600, 600 * 2 ** Math.min(failures - 2, 6))
        : 0;
  const cooldown = delay ? new Date(now.getTime() + delay * 1000).toISOString() : null;
  await db
    .prepare(
      "INSERT INTO source_health (merchant,status,checked_at,last_success_at,consecutive_failures,cooldown_until,extracted_count) " +
        "VALUES (?,?,?,?,?,?,?) ON CONFLICT(merchant) DO UPDATE SET " +
        "status=excluded.status,checked_at=excluded.checked_at," +
        "last_success_at=CASE WHEN excluded.status='checked' THEN excluded.last_success_at ELSE source_health.last_success_at END," +
        "consecutive_failures=excluded.consecutive_failures,cooldown_until=excluded.cooldown_until," +
        "extracted_count=excluded.extracted_count",
    )
    .bind(
      merchant,
      status,
      now.toISOString(),
      status === "checked" ? now.toISOString() : null,
      failures,
      cooldown,
      extracted,
    )
    .run();
  if (diagnostic) {
    await db
      .prepare(
        "INSERT INTO source_diagnostics (merchant,provider,error_code,http_status,occurred_at) " +
          "VALUES (?,?,?,?,?) ON CONFLICT(merchant) DO UPDATE SET " +
          "provider=excluded.provider,error_code=excluded.error_code," +
          "http_status=excluded.http_status,occurred_at=excluded.occurred_at",
      )
      .bind(
        merchant,
        diagnostic.provider,
        diagnostic.code,
        diagnostic.httpStatus,
        now.toISOString(),
      )
      .run();
  }
}

export async function listSourceHealth(db: D1Database): Promise<SourceState[]> {
  const result = await db
    .prepare(
      "SELECT sh.merchant,sh.status,sh.checked_at,sh.last_success_at,sh.consecutive_failures," +
        "sh.cooldown_until,sh.extracted_count," +
        "CASE WHEN sh.status='failed' THEN sd.provider END AS error_provider," +
        "CASE WHEN sh.status='failed' THEN sd.error_code END AS last_error_code," +
        "CASE WHEN sh.status='failed' THEN sd.http_status END AS last_error_status," +
        "CASE WHEN sh.status='failed' THEN sd.occurred_at END AS last_error_at " +
        "FROM source_health sh LEFT JOIN source_diagnostics sd ON sd.merchant=sh.merchant " +
        "ORDER BY sh.merchant LIMIT 100",
    )
    .all<SourceState>();
  return result.results;
}
