import { isLocalMockEnabled, mockPnrResponse } from "./mockTrains.js";
import {
  isExactTenDigitPnr,
  normalizePnrInput,
  sanitizePnrPayload,
} from "../src/pnrUtils.js";

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 8;
const recentByClient = new Map();

function setNoStore(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

function clientKey(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0].trim()}`.slice(0, 128);
  }
  return "anonymous";
}

function enforceRateLimit(key) {
  const now = Date.now();
  const bucket = recentByClient.get(key) || [];
  const fresh = bucket.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    return false;
  }
  fresh.push(now);
  recentByClient.set(key, fresh);
  return true;
}

function readPnr(req) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  return normalizePnrInput(body.pnr ?? body.pnrNumber ?? "");
}

export default async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
    });
  }

  let pnr;
  try {
    pnr = readPnr(req);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Enter a valid 10-digit PNR.",
    });
  }

  if (!isExactTenDigitPnr(pnr)) {
    return res.status(400).json({
      success: false,
      error: "Enter a valid 10-digit PNR.",
    });
  }

  if (!enforceRateLimit(clientKey(req))) {
    return res.status(429).json({
      success: false,
      error: "Too many PNR checks from this connection. Please try again shortly.",
    });
  }

  if (isLocalMockEnabled()) {
    const mocked = mockPnrResponse(pnr);
    return res.status(mocked.status).json(mocked.body);
  }

  const apiKey = process.env.RAILRADAR_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: "PNR status is temporarily unavailable. Please try again later.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`https://api.railradar.in/v1/pnr/${pnr}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (response.status === 429) {
      return res.status(429).json({
        success: false,
        error:
          "PNR status is temporarily unavailable because the data provider has reached its request limit. Please try again later.",
      });
    }

    if (response.status === 404) {
      return res.status(404).json({
        success: false,
        error: "No reservation record was found for that PNR.",
      });
    }

    if (response.status === 401 || response.status === 403) {
      return res.status(503).json({
        success: false,
        error: "PNR status is temporarily unavailable. Please try again later.",
      });
    }

    if (!response.ok || !body?.success) {
      return res.status(503).json({
        success: false,
        error: "PNR status is temporarily unavailable. Please try again later.",
      });
    }

    const sanitized = sanitizePnrPayload(body);
    if (!sanitized) {
      return res.status(503).json({
        success: false,
        error: "PNR status is temporarily unavailable. Please try again later.",
      });
    }

    return res.status(200).json({
      success: true,
      data: sanitized,
      sourceNote:
        "Reservation details are provided for convenience and may change. Confirm critical details on official Indian Railways channels when needed.",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        success: false,
        error: "The PNR check timed out. Please try again.",
      });
    }
    return res.status(503).json({
      success: false,
      error: "PNR status is temporarily unavailable. Please try again later.",
    });
  } finally {
    clearTimeout(timer);
  }
}
