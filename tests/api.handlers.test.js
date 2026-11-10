import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import searchHandler from "../api/search.js";
import trainHandler from "../api/train/[number].js";
import { isLocalMockEnabled } from "../api/mockTrains.js";
import { isFrontendMockEnabled } from "../src/localApi.js";
import { createRes, installFailClosedFetch, jsonResponse } from "./helpers/offlineFetch.js";

describe("api/train number validation", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects malformed input with 400 and zero fetch calls", async () => {
    const { fetchMock } = installFailClosedFetch();
    const res = createRes();

    await trainHandler({ query: { number: "abc12951" } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects short or padded nondigit stripping attempts", async () => {
    const { fetchMock } = installFailClosedFetch();

    for (const number of ["1295", "12 951", "12951a", ""]) {
      const res = createRes();
      await trainHandler({ query: { number } }, res);
      expect(res.statusCode).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("api/search direct lookup source/destination", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves root-level source and destination labels", async () => {
    installFailClosedFetch(async (url) => {
      if (url.includes("/legacy/trains/12951")) {
        return jsonResponse({
          success: true,
          data: {
            trainNumber: "12951",
            trainName: "Rajdhani",
            source: { name: "Mumbai Central" },
            destination: { name: "New Delhi" },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const res = createRes();
    await searchHandler({ query: { q: "12951" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0]).toMatchObject({
      number: "12951",
      name: "Rajdhani",
      source: "Mumbai Central",
      destination: "New Delhi",
    });
  });

  it("keeps nested train endpoint fields working", async () => {
    installFailClosedFetch(async (url) => {
      if (url.includes("/legacy/trains/14095")) {
        return jsonResponse({
          success: true,
          data: {
            train: {
              number: "14095",
              name: "Himalayan Queen",
              source: { name: "Kalka" },
              destination: { name: "Shimla" },
            },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const res = createRes();
    await searchHandler({ query: { q: "14095" } }, res);

    expect(res.body.data[0]).toMatchObject({
      number: "14095",
      name: "Himalayan Queen",
      source: "Kalka",
      destination: "Shimla",
    });
  });

  it("stops fallbacks after a provider 429", async () => {
    const { calls } = installFailClosedFetch(async () => {
      const errorBody = {
        error: { message: "quota exceeded" },
      };
      return {
        ok: false,
        status: 429,
        json: async () => errorBody,
      };
    });

    const res = createRes();
    await searchHandler({ query: { q: "Rajdhani Express" } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.success).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    // Parallel compressed lookups may start together, but later fallbacks must stop.
    expect(
      calls.some((call) =>
        /search\/stations|trains\/between|lookup\/trains\/prs$|lookup\/trains\/ntes|lookup\/search\/trains/.test(
          call.url
        )
      )
    ).toBe(false);
  });

  it("supports successful number and name searches with fixtures", async () => {
    vi.stubEnv("GATIPATH_MOCK", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");

    const numberRes = createRes();
    await searchHandler({ query: { q: "12951" } }, numberRes);
    expect(numberRes.body.data[0].number).toBe("12951");

    const nameRes = createRes();
    await searchHandler({ query: { q: "Himalayan" } }, nameRes);
    expect(nameRes.body.data.some((item) => item.number === "14095")).toBe(true);
  });
});

describe("api/train empty route and static fallback", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an empty live route unchanged when static fallback has no schedule", async () => {
    installFailClosedFetch(async (url) => {
      if (url.includes("/live")) {
        return jsonResponse({
          success: true,
          data: {
            trainNumber: "19999",
            status: "running",
            route: [],
          },
        });
      }
      if (url.includes("dataType=static")) {
        return jsonResponse({
          success: true,
          data: {
            trainNumber: "19999",
            trainName: "Ghost Mail",
            route: [],
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const res = createRes();
    await trainHandler({ query: { number: "19999" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.route).toEqual([]);
    expect(res.body.data.status).toBe("running");
  });

  it("fills route from static fallback when live route is empty", async () => {
    installFailClosedFetch(async (url) => {
      if (url.includes("/live")) {
        return jsonResponse({
          success: true,
          data: {
            trainNumber: "12951",
            status: "scheduled",
            route: [],
          },
        });
      }
      if (url.includes("dataType=static")) {
        return jsonResponse({
          success: true,
          data: {
            trainNumber: "12951",
            trainName: "Mumbai Rajdhani",
            route: [
              {
                stationName: "Mumbai Central",
                stationCode: "MMCT",
                sequence: 1,
                scheduledDeparture: "2026-10-31T08:00:00+05:30",
              },
              {
                stationName: "New Delhi",
                stationCode: "NDLS",
                sequence: 2,
                scheduledArrival: "2026-10-31T20:00:00+05:30",
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const res = createRes();
    await trainHandler({ query: { number: "12951" } }, res);
    expect(res.body.data.route).toHaveLength(2);
    expect(res.body.data.trainName).toBe("Mumbai Rajdhani");
  });

  it("surfaces network failures without calling unexpected hosts", async () => {
    installFailClosedFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const res = createRes();
    await trainHandler({ query: { number: "12951" } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe("production mock guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never enables local mock in production", () => {
    vi.stubEnv("GATIPATH_MOCK", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalMockEnabled()).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isLocalMockEnabled()).toBe(false);
  });

  it("only enables frontend mock in development with VITE_GATIPATH_MOCK=1", () => {
    expect(
      isFrontendMockEnabled({ DEV: true, VITE_GATIPATH_MOCK: "1" })
    ).toBe(true);
    expect(
      isFrontendMockEnabled({ DEV: false, VITE_GATIPATH_MOCK: "1" })
    ).toBe(false);
    expect(
      isFrontendMockEnabled({ DEV: true, VITE_GATIPATH_MOCK: "0" })
    ).toBe(false);
  });
});
