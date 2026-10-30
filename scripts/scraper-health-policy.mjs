/** Deployment checks the API contract, not historical retailer failures. */
export function inspectSource(source, { deployment = false, now = Date.now() } = {}) {
  const errors = [];
  const warnings = [];
  const merchant = String(source?.merchant ?? "Unknown").slice(0, 80);
  const failures = Number(source?.consecutive_failures);
  if (!Number.isInteger(failures) || failures < 0) {
    errors.push("Invalid failure count for " + merchant);
    return { errors, warnings };
  }
  // Terminal source failures are visible on the first check: cooldown deliberately
  // avoids repeated requests, so requiring three attempts would hide the outage.
  const terminalFailure = [
    "retailer_access_denied",
    "retailer_page_missing",
    "retailer_rate_limited",
  ].includes(source?.last_error_code);
  if (failures >= 3 || (failures > 0 && terminalFailure)) {
    const reason = source?.last_error_code
      ? " (" + String(source.last_error_code).slice(0, 80) + ")"
      : "";
    const diagnostic = merchant + ": " + failures + " consecutive failures" + reason;
    (deployment ? warnings : errors).push(diagnostic);
  }
  const checked = source?.checked_at ? Date.parse(source.checked_at) : NaN;
  if (Number.isFinite(checked) && now - checked > 48 * 3600_000) {
    warnings.push(merchant + ": last checked over 48 hours ago");
  }
  return { errors, warnings };
}
