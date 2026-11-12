/**
 * Server-only gate for quota-consuming RailRadar lookups.
 * Default OFF. Re-enable later with LIVE_LOOKUPS_ENABLED=true in Vercel env
 * (never VITE_ / public). See README "Live lookups".
 */
export function areLiveLookupsEnabled(env = process.env) {
  return String(env?.LIVE_LOOKUPS_ENABLED || "").trim().toLowerCase() === "true";
}

export function liveUnavailablePayload() {
  return {
    success: false,
    code: "live_unavailable",
    error:
      "Live lookups are paused. Try Demo on RailDisha to explore sample results.",
  };
}

export function rejectIfLiveLookupsDisabled(res, setHeaders) {
  if (areLiveLookupsEnabled()) return false;
  if (typeof setHeaders === "function") setHeaders(res);
  else {
    res.setHeader?.("Cache-Control", "no-store, max-age=0");
    res.setHeader?.("Pragma", "no-cache");
  }
  res.status(503).json(liveUnavailablePayload());
  return true;
}
