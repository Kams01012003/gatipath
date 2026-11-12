import { isLocalMockEnabled, mockPnrResponse } from "./mockTrains.js";
import { rejectIfLiveLookupsDisabled } from "./liveLookups.js";
import {
  isExactTenDigitPnr,
  normalizePnrInput,
  sanitizePnrPayload,
} from "../src/pnrUtils.js";

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 8;
const recentByClient = new Map();

/** RailRadar documented error.code values only — never free-text messages. */
const ALLOWED_UPSTREAM_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "HISTORICAL_NOT_INCLUDED",
  "VALIDATION_ERROR",
  "VALIDATION:INVALID_INPUT",
  "VALIDATION:MISSING_PARAMETER",
  "INVALID_DATE",
  "TRAIN_NOT_FOUND",
  "STATION_NOT_FOUND",
  "NOT_FOUND",
  "COACH_DATA_UNAVAILABLE",
  "LIVE_DATA_UNAVAILABLE",
  "API:DATA_NOT_AVAILABLE",
  "TOO_MANY_REQUESTS",
  "INTERNAL_ERROR",
  "DB_ERROR",
  "DB_SCHEMA_ERROR",
  "NETWORK:TIMEOUT",
  "SERVICE_UNAVAILABLE",
  "DB_CONNECTION_ERROR",
  "JOURNEY_UNAVAILABLE",
]);

const CLASS = {
  AUTH: "provider_auth",
  QUOTA: "provider_quota",
  NOT_FOUND: "provider_not_found",
  OUTAGE: "provider_outage",
  TIMEOUT: "provider_timeout",
  INVALID_RESPONSE: "provider_invalid_response",
  CONFIG: "config_missing",
  RATE_LIMITED: "rate_limited",
  VALIDATION: "validation_error",
  METHOD: "method_not_allowed",
};

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

function allowlistedUpstreamCode(body) {
  const raw = body?.error?.code;
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  if (!ALLOWED_UPSTREAM_CODES.has(code)) {
    // Namespaced EXTERNAL_SERVICE:* from docs — allow exact prefix form only.
    if (/^EXTERNAL_SERVICE:[A-Z0-9_]+$/.test(code)) return code;
    return null;
  }
  return code;
}

/**
 * Safe failed-lookup diagnostic only: HTTP status + allowlisted code + class.
 * Never logs URL, PNR, API key, payload, or upstream free-text messages.
 */
function logPnrFailure(diagnostic) {
  const safe = {
    event: "pnr_lookup_failed",
    class: diagnostic.class,
    upstreamStatus:
      Number.isInteger(diagnostic.upstreamStatus) ? diagnostic.upstreamStatus : null,
    upstreamCode:
      typeof diagnostic.upstreamCode === "string" ? diagnostic.upstreamCode : null,
  };
  console.error(JSON.stringify(safe));
}

function fail(res, status, error, diagnostic) {
  logPnrFailure(diagnostic);
  const payload = {
    success: false,
    error,
    code: diagnostic.class,
  };
  if (Number.isInteger(diagnostic.upstreamStatus)) {
    payload.upstreamStatus = diagnostic.upstreamStatus;
  }
  if (typeof diagnostic.upstreamCode === "string") {
    payload.upstreamCode = diagnostic.upstreamCode;
  }
  return res.status(status).json(payload);
}

function classifyUpstream(status, upstreamCode) {
  if (status === 401 || status === 403) {
    return { httpStatus: 503, class: CLASS.AUTH, error: "PNR status is temporarily unavailable. Please try again later." };
  }
  if (status === 429 || upstreamCode === "TOO_MANY_REQUESTS") {
    return {
      httpStatus: 429,
      class: CLASS.QUOTA,
      error:
        "PNR status is temporarily unavailable because the data provider has reached its request limit. Please try again later.",
    };
  }
  if (
    status === 404 ||
    upstreamCode === "NOT_FOUND" ||
    upstreamCode === "API:DATA_NOT_AVAILABLE"
  ) {
    return {
      httpStatus: 404,
      class: CLASS.NOT_FOUND,
      error: "No reservation record was found for that PNR.",
    };
  }
  if (status === 400) {
    return {
      httpStatus: 502,
      class: CLASS.INVALID_RESPONSE,
      error: "PNR status is temporarily unavailable. Please try again later.",
    };
  }
  return {
    httpStatus: 503,
    class: CLASS.OUTAGE,
    error: "PNR status is temporarily unavailable. Please try again later.",
  };
}

export default async function handler(req, res) {
  setNoStore(res);

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed.",
      code: CLASS.METHOD,
    });
  }

  let pnr;
  try {
    pnr = readPnr(req);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Enter a valid 10-digit PNR.",
      code: CLASS.VALIDATION,
    });
  }

  if (!isExactTenDigitPnr(pnr)) {
    return res.status(400).json({
      success: false,
      error: "Enter a valid 10-digit PNR.",
      code: CLASS.VALIDATION,
    });
  }

  if (!enforceRateLimit(clientKey(req))) {
    return fail(res, 429, "Too many PNR checks from this connection. Please try again shortly.", {
      class: CLASS.RATE_LIMITED,
    });
  }

  if (isLocalMockEnabled()) {
    const mocked = mockPnrResponse(pnr);
    return res.status(mocked.status).json(mocked.body);
  }

  if (rejectIfLiveLookupsDisabled(res, setNoStore)) {
    return;
  }

  const apiKey = process.env.RAILRADAR_API_KEY;
  if (!apiKey) {
    return fail(
      res,
      503,
      "PNR status is temporarily unavailable. Please try again later.",
      { class: CLASS.CONFIG }
    );
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
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    const upstreamCode = allowlistedUpstreamCode(body);
    const upstreamStatus = response.status;

    if (!response.ok || !body?.success) {
      const mapped = classifyUpstream(upstreamStatus, upstreamCode);
      return fail(res, mapped.httpStatus, mapped.error, {
        class: mapped.class,
        upstreamStatus,
        upstreamCode,
      });
    }

    const sanitized = sanitizePnrPayload(body);
    if (!sanitized) {
      return fail(
        res,
        503,
        "PNR status is temporarily unavailable. Please try again later.",
        {
          class: CLASS.INVALID_RESPONSE,
          upstreamStatus,
          upstreamCode,
        }
      );
    }

    return res.status(200).json({
      success: true,
      data: sanitized,
      sourceNote:
        "Reservation details are provided for convenience and may change. Confirm critical details on official Indian Railways channels when needed.",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return fail(res, 504, "The PNR check timed out. Please try again.", {
        class: CLASS.TIMEOUT,
      });
    }
    return fail(
      res,
      503,
      "PNR status is temporarily unavailable. Please try again later.",
      { class: CLASS.OUTAGE }
    );
  } finally {
    clearTimeout(timer);
  }
}
