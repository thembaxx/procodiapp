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
