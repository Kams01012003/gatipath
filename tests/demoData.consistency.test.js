import { describe, expect, it } from "vitest";
import { mapLiveTrain, formatTime } from "../src/trainUtils.js";
import {
  getDemoPnrResult,
  getDemoTrainPayload,
  parseDemoMode,
} from "../src/demoData.js";

function minutesBetween(isoLater, isoEarlier) {
  return Math.round(
    (new Date(isoLater).getTime() - new Date(isoEarlier).getTime()) / 60000
  );
}

describe("demo delayed sample time consistency", () => {
  it("keeps 19002 delay minutes aligned with actual vs scheduled times", () => {
    const payload = getDemoTrainPayload("19002");
    expect(payload.data.delayMinutes).toBe(40);

    const pune = payload.data.route.find((stop) => stop.stationCode === "PUNE");
    expect(pune).toBeTruthy();
    expect(minutesBetween(pune.actualArrival, pune.scheduledArrival)).toBe(40);
    expect(minutesBetween(pune.actualDeparture, pune.scheduledDeparture)).toBe(
      40
    );
    expect(pune.delayArrival).toBe(40);
    expect(pune.delayDeparture).toBe(40);
    // Actual departure must not precede actual arrival on the same halt.
    expect(
      new Date(pune.actualDeparture).getTime()
    ).toBeGreaterThanOrEqual(new Date(pune.actualArrival).getTime());

    const mapped = mapLiveTrain(payload);
    expect(mapped.delay).toBe(40);
    const mappedPune = mapped.stations.find((station) => station.code === "PUNE");
    expect(mappedPune.arrival).toBe(formatTime(pune.scheduledArrival));
    expect(mappedPune.actualArrival).toBe(formatTime(pune.actualArrival));
    expect(mappedPune.actualArrival).not.toBe(formatTime("2026-11-15T09:05:00.000Z"));
    expect(mappedPune.delay).toBe(40);
  });

  it("uses a plausible SL berth code for mixed-sample RAC, not SU", () => {
    const mixed = getDemoPnrResult("1000000004");
    const rac = mixed.passengers.find((passenger) => passenger.isRAC);
    expect(rac.berthCode).toBe("SL");
    expect(rac.berthCode).not.toBe("SU");
  });
});

describe("parseDemoMode", () => {
  it("accepts pnr case-insensitively and defaults everything else to train", () => {
    expect(parseDemoMode("pnr")).toBe("pnr");
    expect(parseDemoMode("PNR")).toBe("pnr");
    expect(parseDemoMode(" train ")).toBe("train");
    expect(parseDemoMode(null)).toBe("train");
    expect(parseDemoMode(undefined)).toBe("train");
    expect(parseDemoMode("")).toBe("train");
    expect(parseDemoMode("admin")).toBe("train");
  });
});
