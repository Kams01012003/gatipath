import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../api/pnr.js";
import { sanitizePnrPayload } from "../src/pnrUtils.js";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function providerError(status, code) {
  return jsonResponse(status, {
    success: false,
    error: { code, message: "SENSITIVE_FREE_TEXT_DO_NOT_LEAK" },
    meta: { traceId: "should-not-appear-in-logs" },
  });
}

describe("PNR API", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("GATIPATH_MOCK", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects non-POST and invalid PNRs before any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const methodRes = mockRes();
    await handler({ method: "GET", headers: {}, body: {} }, methodRes);
    expect(methodRes.statusCode).toBe(405);
    expect(methodRes.body.code).toBe("method_not_allowed");

    const bad = mockRes();
    await handler({ method: "POST", headers: {}, body: { pnr: "123" } }, bad);
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toMatch(/10-digit/i);
    expect(bad.body.code).toBe("validation_error");
    expect(bad.headers["Cache-Control"]).toMatch(/no-store/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves mocked success, not-found and quota fixtures offline", async () => {
    const ok = mockRes();
    await handler({ method: "POST", headers: {}, body: { pnr: "1234567890" } }, ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(ok.body.data.train.number).toBe("12952");
    expect(ok.body.data.passengers[0].currentStatus).toBe("CNF");

    const missing = mockRes();
    await handler({ method: "POST", headers: {}, body: { pnr: "0000000000" } }, missing);
    expect(missing.statusCode).toBe(404);

    const quota = mockRes();
    await handler({ method: "POST", headers: {}, body: { pnr: "9999999999" } }, quota);
    expect(quota.statusCode).toBe(429);
  });

  it("sanitizes documented provider payloads without booking fare or coach position", () => {
    const sanitized = sanitizePnrPayload({
      success: true,
      data: {
        pnrNumber: "1234567890",
        train: {
          number: "12952",
          name: "MUMBAI RAJDHANI",
          source: { code: "NDLS", name: "New Delhi" },
          destination: { code: "MMCT", name: "Mumbai Central" },
          boardingPoint: { code: "NDLS", name: "New Delhi" },
          reservationUpto: { code: "MMCT", name: "Mumbai Central" },
        },
        journey: {
          date: "2026-08-20",
          class: "3A",
          quota: "GN",
          bookingFare: "2145",
        },
        charting: {
          isPrepared: false,
          status: "Chart Not Prepared",
          chartUrl: "https://www.irctc.co.in/online-charts/",
        },
        passengers: [
          {
            passengerNumber: 1,
            bookingStatus: "WL/14/GN",
            currentStatus: "CNF",
            coach: "B4",
            berthNumber: 58,
            berthCode: "LB",
            coachPosition: "12",
            isConfirmed: true,
            isRAC: false,
            isWaitlisted: false,
            isCancelled: false,
          },
        ],
      },
      meta: { timestamp: "2026-11-02T14:02:30+05:30", source: "external" },
    });

    expect(sanitized.journey.bookingFare).toBeUndefined();
    expect(sanitized.passengers[0].coachPosition).toBeUndefined();
    expect(sanitized.passengers[0].coach).toBe("B4");
    expect(sanitized.passengers[0].berthNumber).toBe("58");
    expect(sanitized.charting.chartUrl).toMatch(/^https:\/\//);
    expect(sanitized.checkedAt).toBe("2026-11-02T14:02:30+05:30");
  });
});

describe("PNR API live-path classification (mocked fetch only)", () => {
  const SAMPLE_PNR = "1234567890";
  let clientSeq = 0;

  function reqFor(pnr = SAMPLE_PNR) {
    clientSeq += 1;
    return {
      method: "POST",
      headers: { "x-forwarded-for": `203.0.113.${clientSeq}` },
      body: { pnr },
    };
  }

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key-not-real");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function assertSafeFailureLog(consoleError, expected) {
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain(SAMPLE_PNR);
    expect(logged).not.toContain("test-key-not-real");
    expect(logged).not.toContain("SENSITIVE_FREE_TEXT_DO_NOT_LEAK");
    expect(logged).not.toContain("should-not-appear-in-logs");
    expect(logged).not.toMatch(/api\.railradar\.in/i);
    const parsed = JSON.parse(consoleError.mock.calls.at(-1)[0]);
    expect(parsed).toEqual({
      event: "pnr_lookup_failed",
      class: expected.class,
      upstreamStatus: expected.upstreamStatus ?? null,
      upstreamCode: expected.upstreamCode ?? null,
    });
  }

  it("maps missing RAILRADAR_API_KEY to config_missing without fetch", async () => {
    vi.stubEnv("RAILRADAR_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = mockRes();
    await handler(reqFor(), res);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("config_missing");
    expect(res.body.upstreamStatus).toBeUndefined();
    assertSafeFailureLog(consoleError, { class: "config_missing" });
  });

  it("classifies upstream 401/403 as provider_auth with allowlisted code only", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(401, "UNAUTHORIZED"))
    );

    const unauthorized = mockRes();
    await handler(reqFor(), unauthorized);
    expect(unauthorized.statusCode).toBe(503);
    expect(unauthorized.body).toMatchObject({
      code: "provider_auth",
      upstreamStatus: 401,
      upstreamCode: "UNAUTHORIZED",
    });
    expect(JSON.stringify(unauthorized.body)).not.toContain("SENSITIVE_FREE_TEXT");
    assertSafeFailureLog(consoleError, {
      class: "provider_auth",
      upstreamStatus: 401,
      upstreamCode: "UNAUTHORIZED",
    });

    consoleError.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(403, "FORBIDDEN"))
    );
    const forbidden = mockRes();
    await handler(reqFor(), forbidden);
    expect(forbidden.body).toMatchObject({
      code: "provider_auth",
      upstreamStatus: 403,
      upstreamCode: "FORBIDDEN",
    });
    assertSafeFailureLog(consoleError, {
      class: "provider_auth",
      upstreamStatus: 403,
      upstreamCode: "FORBIDDEN",
    });
  });

  it("classifies upstream 404 and API:DATA_NOT_AVAILABLE as provider_not_found", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(404, "NOT_FOUND"))
    );
    const missing = mockRes();
    await handler(reqFor(), missing);
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toMatchObject({
      code: "provider_not_found",
      upstreamStatus: 404,
      upstreamCode: "NOT_FOUND",
    });
    assertSafeFailureLog(consoleError, {
      class: "provider_not_found",
      upstreamStatus: 404,
      upstreamCode: "NOT_FOUND",
    });

    consoleError.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(404, "API:DATA_NOT_AVAILABLE"))
    );
    const unavailable = mockRes();
    await handler(reqFor(), unavailable);
    expect(unavailable.body.code).toBe("provider_not_found");
    expect(unavailable.body.upstreamCode).toBe("API:DATA_NOT_AVAILABLE");
  });

  it("classifies upstream 429 as provider_quota", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(429, "TOO_MANY_REQUESTS"))
    );
    const res = mockRes();
    await handler(reqFor(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({
      code: "provider_quota",
      upstreamStatus: 429,
      upstreamCode: "TOO_MANY_REQUESTS",
    });
    assertSafeFailureLog(consoleError, {
      class: "provider_quota",
      upstreamStatus: 429,
      upstreamCode: "TOO_MANY_REQUESTS",
    });
  });

  it("classifies upstream 500/503 as provider_outage and strips unknown codes", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(503, "SERVICE_UNAVAILABLE"))
    );
    const outage = mockRes();
    await handler(reqFor(), outage);
    expect(outage.statusCode).toBe(503);
    expect(outage.body).toMatchObject({
      code: "provider_outage",
      upstreamStatus: 503,
      upstreamCode: "SERVICE_UNAVAILABLE",
    });

    consoleError.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => providerError(500, "NOT_A_REAL_CODE"))
    );
    const unknown = mockRes();
    await handler(reqFor(), unknown);
    expect(unknown.body.code).toBe("provider_outage");
    expect(unknown.body.upstreamStatus).toBe(500);
    expect(unknown.body.upstreamCode).toBeUndefined();
    assertSafeFailureLog(consoleError, {
      class: "provider_outage",
      upstreamStatus: 500,
      upstreamCode: null,
    });
  });

  it("classifies malformed success envelope as provider_invalid_response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { success: true, data: null }))
    );
    const res = mockRes();
    await handler(reqFor(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("provider_invalid_response");
    expect(res.body.upstreamStatus).toBe(200);
    assertSafeFailureLog(consoleError, {
      class: "provider_invalid_response",
      upstreamStatus: 200,
      upstreamCode: null,
    });
  });

  it("classifies abort as provider_timeout and network throw as provider_outage", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abortErr;
      })
    );
    const timeout = mockRes();
    await handler(reqFor(), timeout);
    expect(timeout.statusCode).toBe(504);
    expect(timeout.body.code).toBe("provider_timeout");
    assertSafeFailureLog(consoleError, { class: "provider_timeout" });

    consoleError.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up with secret details");
      })
    );
    const network = mockRes();
    await handler(reqFor(), network);
    expect(network.statusCode).toBe(503);
    expect(network.body.code).toBe("provider_outage");
    const logged = String(consoleError.mock.calls.at(-1)[0]);
    expect(logged).not.toContain("socket hang up");
    assertSafeFailureLog(consoleError, { class: "provider_outage" });
  });

  it("returns sanitized success without diagnostic failure logs", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          success: true,
          data: {
            pnrNumber: SAMPLE_PNR,
            train: { number: "12952", name: "TEST" },
            journey: { date: "2026-08-20", class: "3A", quota: "GN" },
            charting: { isPrepared: false, status: "Chart Not Prepared" },
            passengers: [
              {
                passengerNumber: 1,
                bookingStatus: "CNF",
                currentStatus: "CNF",
                isConfirmed: true,
                isRAC: false,
                isWaitlisted: false,
                isCancelled: false,
              },
            ],
          },
          meta: { timestamp: "2026-11-02T14:02:30+05:30" },
        })
      )
    );
    const res = mockRes();
    await handler(reqFor(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.train.number).toBe("12952");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
