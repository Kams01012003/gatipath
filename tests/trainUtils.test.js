import { describe, expect, it } from "vitest";
import {
  directLookupStations,
  formatDelay,
  formatRouteEndpoints,
  formatTime,
  formatUpdated,
  identifiersMatch,
  isExactFiveDigitTrainNumber,
  journeyDayNumber,
  mapLiveTrain,
  parseDelay,
  trainHeading,
} from "../src/trainUtils.js";

describe("formatTime and updated-time guards", () => {
  it("returns the unavailable placeholder for missing values", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime(undefined)).toBe("—");
    expect(formatTime("")).toBe("—");
  });

  it("returns the unavailable placeholder for invalid timestamps without throwing", () => {
    expect(() => formatTime("not-a-date")).not.toThrow();
    expect(formatTime("not-a-date")).toBe("—");
    expect(formatTime("abc")).toBe("—");
  });

  it("formats valid India-local times", () => {
    const formatted = formatTime("2026-10-31T23:00:00+05:30");
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    expect(formatted).not.toBe("—");
  });

  it("guards updated-time against invalid dates", () => {
    expect(formatUpdated(null)).toBe("Live status");
    expect(formatUpdated("not-a-date")).toBe("Live status");
    expect(formatUpdated("2026-10-31T23:00:00+05:30")).toMatch(/^Updated /);
  });
});

describe("India calendar day numbers", () => {
  it("uses Asia/Kolkata calendar dates for overnight hops under 24 hours", () => {
    expect(
      journeyDayNumber(
        "2026-11-01T01:00:00+05:30",
        "2026-10-31T23:00:00+05:30"
      )
    ).toBe(2);
  });

  it("keeps same-calendar-day stops on DAY 1 even across many hours", () => {
    expect(
      journeyDayNumber(
        "2026-10-31T22:00:00+05:30",
        "2026-10-31T06:00:00+05:30"
      )
    ).toBe(1);
  });

  it("handles timezone offsets that cross the India calendar day", () => {
    // 2026-10-31T18:30:00Z == 2026-11-01T00:00:00+05:30
    expect(
      journeyDayNumber(
        "2026-10-31T18:30:00Z",
        "2026-10-31T10:00:00+05:30"
      )
    ).toBe(2);
  });

  it("supports multi-day journeys", () => {
    expect(
      journeyDayNumber(
        "2026-11-02T08:00:00+05:30",
        "2026-10-31T08:00:00+05:30"
      )
    ).toBe(3);
  });

  it("falls back safely for invalid input", () => {
    expect(journeyDayNumber("not-a-date", "2026-10-31T08:00:00+05:30")).toBe(1);
    expect(journeyDayNumber("2026-11-01T01:00:00+05:30", "bad")).toBe(1);
    expect(journeyDayNumber(null, null)).toBe(1);
  });

  it("maps overnight day dividers through mapLiveTrain", () => {
    const train = mapLiveTrain({
      data: {
        trainNumber: "12951",
        trainName: "Rajdhani",
        status: "running",
        route: [
          {
            stationName: "Mumbai Central",
            stationCode: "MMCT",
            sequence: 1,
            scheduledDeparture: "2026-10-31T23:00:00+05:30",
          },
          {
            stationName: "Surat",
            stationCode: "ST",
            sequence: 2,
            scheduledArrival: "2026-11-01T01:00:00+05:30",
            scheduledDeparture: "2026-11-01T01:10:00+05:30",
          },
        ],
      },
    });

    expect(train.stations[0].dayNumber).toBe(1);
    expect(train.stations[1].dayNumber).toBe(2);
  });
});

describe("current-location matching", () => {
  it("does not mark every stop current when location metadata is missing", () => {
    const train = mapLiveTrain({
      data: {
        trainNumber: "12951",
        status: "running",
        currentLocation: {},
        route: [
          { stationName: "A", stationCode: "A", sequence: 1 },
          { stationName: "B", stationCode: "B", sequence: 2 },
          { stationName: "C", stationCode: "C", sequence: 3 },
        ],
      },
    });

    expect(train.stations.every((stop) => stop.state !== "Current")).toBe(true);
    expect(train.stationsRemaining).toBeNull();
  });

  it("does not match when stop identifiers are also missing", () => {
    const train = mapLiveTrain({
      data: {
        status: "running",
        currentLocation: { stationCode: undefined, sequence: undefined },
        route: [
          { stationName: "A" },
          { stationName: "B" },
        ],
      },
    });

    expect(train.stations.filter((stop) => stop.state === "Current")).toHaveLength(0);
  });

  it("matches mixed sequence number/string types and preserves remaining stations", () => {
    expect(identifiersMatch(2, "2")).toBe(true);
    expect(identifiersMatch(undefined, undefined)).toBe(false);

    const train = mapLiveTrain({
      data: {
        status: "running",
        currentLocation: {
          stationName: "Ratlam",
          stationCode: "RTM",
          sequence: "2",
        },
        nextHalt: { stationName: "Kota" },
        route: [
          { stationName: "Mumbai Central", stationCode: "MMCT", sequence: 1, status: "departed" },
          { stationName: "Ratlam", stationCode: "RTM", sequence: 2, status: "arrived" },
          { stationName: "Kota", stationCode: "KOTA", sequence: 3 },
          { stationName: "New Delhi", stationCode: "NDLS", sequence: 4 },
        ],
      },
    });

    expect(train.stations[1].state).toBe("Current");
    expect(train.stations.filter((stop) => stop.state === "Current")).toHaveLength(1);
    expect(train.stationsRemaining).toBe(2);
    expect(train.current).toBe("Ratlam");
    expect(train.next).toBe("Kota");
  });
});

describe("route endpoint helpers and delays", () => {
  it("formats route labels without dangling arrows", () => {
    expect(formatRouteEndpoints("Mumbai Central", "New Delhi")).toBe(
      "Mumbai Central → New Delhi"
    );
    expect(formatRouteEndpoints("", "New Delhi")).toBe("New Delhi");
    expect(formatRouteEndpoints("Mumbai Central", "")).toBe("Mumbai Central");
    expect(formatRouteEndpoints("", "")).toBe("");
    expect(formatRouteEndpoints(undefined, null)).toBe("");
  });

  it("preserves root-level source and destination on direct lookup payloads", () => {
    const stations = directLookupStations({
      trainNumber: "12951",
      trainName: "Rajdhani",
      source: { name: "Mumbai Central" },
      destination: { name: "New Delhi" },
    });
    expect(stations).toEqual({
      source: "Mumbai Central",
      destination: "New Delhi",
    });
  });

  it("keeps nested train source/destination working with precedence", () => {
    const stations = directLookupStations({
      source: { name: "Root Source" },
      destination: { name: "Root Destination" },
      train: {
        source: { name: "Nested Source" },
        destination: { name: "Nested Destination" },
      },
    });
    expect(stations).toEqual({
      source: "Nested Source",
      destination: "Nested Destination",
    });
  });

  it("distinguishes zero delay from unknown delay", () => {
    expect(parseDelay(0)).toBe(0);
    expect(formatDelay(0)).toBe("On time");
    expect(parseDelay(null)).toBeNull();
    expect(formatDelay(null)).toBe("Delay unavailable");
    expect(formatDelay("12")).toBe("12 min late");
  });

  it("uses selection name fallback in trainHeading", () => {
    expect(trainHeading({ name: "Himalayan Queen", number: "14095" })).toBe(
      "Himalayan Queen"
    );
    expect(trainHeading({ name: "Train", number: "14095" })).toBe("14095");
    expect(trainHeading({ name: "", number: "" })).toBe("Train");
  });

  it("marks empty and missing routes as schedule-unavailable without inventing stops", () => {
    const empty = mapLiveTrain({
      data: {
        trainNumber: "19999",
        status: "running",
        delayMinutes: 5,
        currentLocation: { stationName: "Somewhere" },
        route: [],
      },
    });
    expect(empty.hasSchedule).toBe(false);
    expect(empty.stations).toEqual([]);
    expect(empty.state).toBe("running");
    expect(empty.current).toBe("Somewhere");
    expect(empty.delay).toBe(5);

    const missing = mapLiveTrain({
      data: {
        trainNumber: "19999",
        status: "scheduled",
      },
    });
    expect(missing.hasSchedule).toBe(false);
    expect(missing.stations).toEqual([]);
  });

  it("validates exact five-digit train numbers", () => {
    expect(isExactFiveDigitTrainNumber("12951")).toBe(true);
    expect(isExactFiveDigitTrainNumber(" 12951 ")).toBe(true);
    expect(isExactFiveDigitTrainNumber("abc12951")).toBe(false);
    expect(isExactFiveDigitTrainNumber("1295")).toBe(false);
    expect(isExactFiveDigitTrainNumber("129511")).toBe(false);
  });

  it("uses arrival/departure placeholders for missing station times", () => {
    const train = mapLiveTrain({
      data: {
        route: [
          {
            stationName: "Origin",
            stationCode: "ORG",
            sequence: 1,
            scheduledDeparture: "2026-10-31T08:00:00+05:30",
          },
          {
            stationName: "Destination",
            stationCode: "DST",
            sequence: 2,
            scheduledArrival: "2026-10-31T12:00:00+05:30",
          },
        ],
      },
    });
    expect(train.stations[0].arrival).toBe("—");
    expect(train.stations[0].departure).not.toBe("—");
    expect(train.stations[1].departure).toBe("—");
    expect(train.stations[1].arrival).not.toBe("—");
  });
});
