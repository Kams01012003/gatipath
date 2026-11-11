import { describe, expect, it, vi } from "vitest";
import {
  directLookupStations,
  formatDelay,
  formatRouteEndpoints,
  formatTime,
  formatUpdated,
  hasUsableIdentifier,
  identifiersMatch,
  indiaCalendarDayKey,
  isExactFiveDigitTrainNumber,
  journeyDayNumber,
  mapLiveTrain,
  parseDelay,
  readTrainIdentity,
  trainHeading,
} from "../src/trainUtils.js";
import { mockSearchResponse, mockTrainResponse } from "../api/mockTrains.js";
import searchHandler from "../api/search.js";
import trainHandler from "../api/train/[number].js";
import { createRes, installFailClosedFetch, jsonResponse } from "./helpers/offlineFetch.js";

describe("regression matrix: times and days", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    ["", "—"],
    ["not-a-date", "—"],
    ["2026-13-99", "—"],
  ])("formatTime(%j) => %s", (input, expected) => {
    expect(formatTime(input)).toBe(expected);
  });

  it.each([
    [null, "Live status"],
    ["bad", "Live status"],
  ])("formatUpdated(%j) => %s", (input, expected) => {
    expect(formatUpdated(input)).toBe(expected);
  });

  it.each([
    ["2026-10-31T23:00:00+05:30", "2026-10-31"],
    ["2026-10-31T18:30:00Z", "2026-11-01"],
  ])("india day key for %s", (iso, key) => {
    expect(indiaCalendarDayKey(iso)).toBe(key);
  });

  it.each([
    ["2026-11-01T01:00:00+05:30", "2026-10-31T23:00:00+05:30", 2],
    ["2026-10-31T12:00:00+05:30", "2026-10-31T01:00:00+05:30", 1],
    ["2026-11-03T09:00:00+05:30", "2026-10-31T09:00:00+05:30", 4],
    ["nope", "2026-10-31T09:00:00+05:30", 1],
  ])("journeyDayNumber(%s, %s) => %i", (scheduled, first, day) => {
    expect(journeyDayNumber(scheduled, first)).toBe(day);
  });
});

describe("regression matrix: identity and matching", () => {
  it.each([
    [undefined, false],
    [null, false],
    ["", false],
    ["  ", false],
    [0, true],
    [2, true],
    ["RTM", true],
  ])("hasUsableIdentifier(%j) => %s", (value, expected) => {
    expect(hasUsableIdentifier(value)).toBe(expected);
  });

  it.each([
    [undefined, undefined, false],
    [2, "2", true],
    ["RTM", "RTM", true],
    ["RTM", "NDLS", false],
    ["", "", false],
  ])("identifiersMatch(%j, %j) => %s", (left, right, expected) => {
    expect(identifiersMatch(left, right)).toBe(expected);
  });

  it("readTrainIdentity supports nested and root shapes", () => {
    expect(
      readTrainIdentity({
        trainNumber: "12951",
        trainName: "Rajdhani",
      })
    ).toEqual({ number: "12951", name: "Rajdhani" });
    expect(
      readTrainIdentity({
        train: { number: "14095", name: "Himalayan Queen" },
      })
    ).toEqual({ number: "14095", name: "Himalayan Queen" });
  });

  it.each([
    ["12951", true],
    [" 12951 ", true],
    ["abc12951", false],
    ["1295a", false],
    ["129511", false],
  ])("isExactFiveDigitTrainNumber(%j) => %s", (value, expected) => {
    expect(isExactFiveDigitTrainNumber(value)).toBe(expected);
  });
});

describe("regression matrix: delays and route labels", () => {
  it.each([
    [0, "On time"],
    [null, "Delay unavailable"],
    [undefined, "Delay unavailable"],
    ["", "Delay unavailable"],
    [75, "1 hr 15 min late"],
    [60, "1 hr late"],
    [12, "12 min late"],
  ])("formatDelay(%j) => %s", (value, expected) => {
    expect(formatDelay(value)).toBe(expected);
  });

  it("parseDelay rejects negatives and junk", () => {
    expect(parseDelay(-1)).toBeNull();
    expect(parseDelay("12min")).toBeNull();
    expect(parseDelay("12")).toBe(12);
  });

  it.each([
    ["A", "B", "A → B"],
    ["A", "", "A"],
    ["", "B", "B"],
    ["", "", ""],
  ])("formatRouteEndpoints(%j, %j) => %j", (from, to, expected) => {
    expect(formatRouteEndpoints(from, to)).toBe(expected);
  });

  it.each([
    [{ name: "Named", number: "1" }, "Named"],
    [{ name: "Train", number: "12001" }, "12001"],
    [{ name: "  ", number: "12001" }, "12001"],
  ])("trainHeading(%j)", (train, expected) => {
    expect(trainHeading(train)).toBe(expected);
  });
});

describe("regression matrix: mapLiveTrain states", () => {
  it("preserves cancelled and completed statuses without inventing schedule", () => {
    const cancelled = mapLiveTrain({
      data: { status: "cancelled", route: [] },
    });
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.hasSchedule).toBe(false);

    const completed = mapLiveTrain({
      data: { status: "completed", route: [] },
    });
    expect(completed.state).toBe("completed");
  });

  it("keeps known current location when sequence matches by code only", () => {
    const train = mapLiveTrain({
      data: {
        status: "running",
        currentLocation: { stationName: "Kota", stationCode: "KOTA" },
        route: [
          { stationName: "A", stationCode: "AAA", sequence: 1 },
          { stationName: "Kota", stationCode: "KOTA", sequence: 2 },
        ],
      },
    });
    expect(train.stations[1].state).toBe("Current");
    expect(train.stationsRemaining).toBeNull();
  });
});

describe("regression matrix: directLookupStations empty nested fallback", () => {
  it.each([
    [
      {
        train: { source: {}, destination: {} },
        source: { name: "Mumbai Central" },
        destination: { name: "New Delhi" },
      },
      { source: "Mumbai Central", destination: "New Delhi" },
    ],
    [
      {
        train: { source: { name: "Nested" }, destination: { code: "" } },
        source: { name: "Root Source" },
        destination: { name: "Root Destination" },
      },
      { source: "Nested", destination: "Root Destination" },
    ],
    [
      {
        train: {
          sourceName: "Nested Source Name",
          destinationCode: "NDLS",
        },
        source: { name: "Root Source" },
        destination: { name: "Root Destination" },
      },
      { source: "Nested Source Name", destination: "NDLS" },
    ],
  ])("normalizes %#", (payload, expected) => {
    expect(directLookupStations(payload)).toEqual(expected);
  });
});

describe("regression matrix: mock fixtures and handlers", () => {
  it("mock search finds by number and name", () => {
    expect(mockSearchResponse("129").data[0].number).toBe("12951");
    expect(mockSearchResponse("Himalayan").data[0].number).toBe("14095");
    expect(mockSearchResponse("x").data).toEqual([]);
  });

  it("mock train returns schedule for known numbers and empty route for unknown", () => {
    expect(mockTrainResponse("12951").data.route.length).toBeGreaterThan(0);
    expect(mockTrainResponse("19999").data.route).toEqual([]);
  });

  it("train handler rejects malformed numbers before fetch", async () => {
    const { fetchMock } = installFailClosedFetch();
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
    const res = createRes();
    await trainHandler({ query: { number: "12-951" } }, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    vi.unstubAllEnvs();
  });

  it("search handler returns empty data for short queries without provider calls", async () => {
    const { fetchMock } = installFailClosedFetch();
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
    const res = createRes();
    await searchHandler({ query: { q: "a" } }, res);
    expect(res.body).toEqual({ success: true, data: [] });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    vi.unstubAllEnvs();
  });

  it("train handler maps provider 502 on malformed JSON/network throw", async () => {
    installFailClosedFetch(async () => {
      throw new Error("socket hang up");
    });
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
    const res = createRes();
    await trainHandler({ query: { number: "12951" } }, res);
    expect(res.statusCode).toBe(502);
    vi.unstubAllEnvs();
  });

  it("train handler surfaces upstream error payloads", async () => {
    installFailClosedFetch(async () =>
      jsonResponse({ error: { message: "Train not found" } }, 404)
    );
    vi.stubEnv("GATIPATH_MOCK", "0");
    vi.stubEnv("RAILRADAR_API_KEY", "test-key");
    const res = createRes();
    await trainHandler({ query: { number: "12951" } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/train not found/i);
    vi.unstubAllEnvs();
  });
});
