import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchHandler from "../api/search.js";
import trainHandler from "../api/train/[number].js";
import pnrHandler from "../api/pnr.js";
import capabilitiesHandler from "../api/capabilities.js";
import { createRes, installFailClosedFetch } from "./helpers/offlineFetch.js";

function mockRes() {
  const res = createRes();
  res.headers = {};
  res.setHeader = function setHeader(key, value) {
    this.headers[key] = value;
  };
  return res;
}

describe("LIVE_LOOKUPS_ENABLED server guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RAILRADAR_API_KEY", "dummy-key-must-not-be-used");
    vi.stubEnv("LIVE_LOOKUPS_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("capabilities returns only liveEnabled false by default with no-store", async () => {
    const { fetchMock } = installFailClosedFetch();
    const res = mockRes();
    await capabilitiesHandler({ method: "GET" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liveEnabled: false });
    expect(res.headers["Cache-Control"]).toMatch(/no-store/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks search/train/pnr upstream with live_unavailable even when a key exists", async () => {
    const { fetchMock, calls } = installFailClosedFetch();

    const search = mockRes();
    await searchHandler({ query: { q: "12951" } }, search);
    expect(search.statusCode).toBe(503);
    expect(search.body.code).toBe("live_unavailable");
    expect(search.headers["Cache-Control"]).toMatch(/no-store/i);

    const train = mockRes();
    await trainHandler({ query: { number: "12951" } }, train);
    expect(train.statusCode).toBe(503);
    expect(train.body.code).toBe("live_unavailable");

    const pnr = mockRes();
    await pnrHandler(
      { method: "POST", headers: {}, body: { pnr: "1234567890" } },
      pnr
    );
    expect(pnr.statusCode).toBe(503);
    expect(pnr.body.code).toBe("live_unavailable");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("when LIVE_LOOKUPS_ENABLED=true, capabilities is true and handlers may fetch (mocked)", async () => {
    vi.stubEnv("LIVE_LOOKUPS_ENABLED", "true");
    const { fetchMock, calls } = installFailClosedFetch(async (url) => {
      if (String(url).includes("/v1/pnr/")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            error: { code: "NOT_FOUND", message: "SENSITIVE" },
          }),
        };
      }
      if (String(url).includes("railradar")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        };
      }
      throw new Error(`Unexpected ${url}`);
    });

    const caps = mockRes();
    await capabilitiesHandler({ method: "GET" }, caps);
    expect(caps.body).toEqual({ liveEnabled: true });

    const search = mockRes();
    await searchHandler({ query: { q: "ab" } }, search);
    // short query returns empty without fetch in search handler after enable
    // q length >= 2 triggers fetch - "ab" is 2
    expect(search.statusCode).toBe(200);

    const pnr = mockRes();
    await pnrHandler(
      {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.10" },
        body: { pnr: "1234567890" },
      },
      pnr
    );
    expect(pnr.statusCode).toBe(404);
    expect(pnr.body.code).toBe("provider_not_found");
    expect(JSON.stringify(pnr.body)).not.toContain("SENSITIVE");
    expect(calls.some((call) => /railradar\.in\/v1\/pnr\//.test(call.url))).toBe(
      true
    );
    expect(fetchMock).toHaveBeenCalled();
  });
});
