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
  });

  it("rejects non-POST and invalid PNRs before any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const methodRes = mockRes();
    await handler({ method: "GET", headers: {}, body: {} }, methodRes);
    expect(methodRes.statusCode).toBe(405);

    const bad = mockRes();
    await handler({ method: "POST", headers: {}, body: { pnr: "123" } }, bad);
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toMatch(/10-digit/i);
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
