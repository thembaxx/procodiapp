/** Deployment should validate the API contract, not reject healthy releases for old scrape failures. */
export function inspectSource(source, { deployment = false, now = Date.now() } = {}) {
  const errors = [];
  const warnings = [];
  const merchant = String(source?.merchant ?? "Unknown").slice(0, 80);
  const failures = Number(source?.consecutive_failures);
  if (!Number.isInteger(failures) || failures < 0) {
    errors.push("Invalid failure count for " + merchant);
    return { errors, warnings };
  }
  if (failures >= 3) {
    const reason = source?.last_error_code ? " (" + String(source.last_error_code).slice(0, 80) + ")" : "";
    const diagnostic = merchant + ": " + failures + " consecutive failures" + reason;
    (deployment ? warnings : errors).push(diagnostic);
  }
  const checked = source?.checked_at ? Date.parse(source.checked_at) : NaN;
  if (Number.isFinite(checked) && now - checked > 48 * 3600_000) {
    warnings.push(merchant + ": last checked over 48 hours ago");
  }
  return { errors, warnings };
}
