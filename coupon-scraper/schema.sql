-- Initial D1 schema. Preserve existing data when applying this migration.
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT,
  merchant TEXT NOT NULL,
  title TEXT,
  description TEXT,
  discount TEXT,
  source_url TEXT NOT NULL,
  found_at TEXT NOT NULL,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_coupons_merchant_active ON coupons (merchant, active);
CREATE INDEX IF NOT EXISTS idx_coupons_found_at ON coupons (found_at DESC);

-- Only operator-reviewed evidence belongs in the published feed.
-- Browser extraction remains in the legacy coupons table as unverified leads.
CREATE TABLE IF NOT EXISTS verified_offers (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  store_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('coupon_code','discount','free_delivery','catalogue_special','loyalty','bundle','cashback')),
  title TEXT NOT NULL,
  criteria TEXT NOT NULL,
  code TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('online','in_store','both')),
  region TEXT,
  source_url TEXT NOT NULL,
  source_evidence TEXT NOT NULL,
  expires_at TEXT,
  ongoing INTEGER NOT NULL DEFAULT 0 CHECK (ongoing IN (0,1)),
  checked_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  checkout_tested INTEGER NOT NULL DEFAULT 0 CHECK (checkout_tested IN (0,1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','quarantined','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_verified_active ON verified_offers (status, valid_until DESC, store_id);

CREATE TABLE IF NOT EXISTS source_health (
  merchant TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('checked','empty','failed')),
  checked_at TEXT,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  extracted_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_source_cooldown ON source_health (cooldown_until);

-- Atomic daily Firecrawl credit reservations shared by all queue consumers.
-- One basic-proxy scrape is bounded to one request/credit; failed attempts count.
-- Old rows can be pruned periodically, but never delete today's usage.
CREATE TABLE IF NOT EXISTS firecrawl_usage (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0)
);
