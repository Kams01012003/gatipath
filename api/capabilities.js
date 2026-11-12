import { areLiveLookupsEnabled } from "./liveLookups.js";

/**
 * Same-origin capability probe for the homepage switch.
 * Returns ONLY { liveEnabled } — no secrets, no provider calls.
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ liveEnabled: false });
  }

  return res.status(200).json({
    liveEnabled: areLiveLookupsEnabled(),
  });
}
