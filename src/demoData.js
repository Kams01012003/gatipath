/**
 * Browser-only demo fixtures for /demo.
 * Synthetic sample identifiers only — never real passenger names or user PNRs.
 */

export const DEMO_NOTICE =
  "Explore sample journeys and PNR results. These are not live updates.";

export const DEMO_BADGE = "DEMO · SAMPLE DATA";

export const DEMO_SAMPLE_DATE_LABEL = "Sample journey date · 15 Nov 2026";

/** Deterministic IST-labelled sample times (fixed calendar day, UTC stored). */
const T = {
  d0_0600: "2026-11-15T00:30:00.000Z", // 06:00 IST
  d0_0615: "2026-11-15T00:45:00.000Z", // 06:15 IST
  d0_0830: "2026-11-15T03:00:00.000Z", // 08:30 IST
  d0_0845: "2026-11-15T03:15:00.000Z", // 08:45 IST
  d0_1100: "2026-11-15T05:30:00.000Z", // 11:00 IST
  d0_1118: "2026-11-15T05:48:00.000Z", // 11:18 IST
  d0_1140: "2026-11-15T06:10:00.000Z", // 11:40 IST (11:00 + 40 min)
  d0_1158: "2026-11-15T06:28:00.000Z", // 11:58 IST (11:18 + 40 min)
  d0_1400: "2026-11-15T08:30:00.000Z", // 14:00 IST
  d0_1800: "2026-11-15T12:30:00.000Z", // 18:00 IST
  d0_1840: "2026-11-15T13:10:00.000Z", // 18:40 IST
};

export const DEMO_TRAIN_SCENARIOS = [
  {
    id: "on-time",
    chipLabel: "On-time sample",
    number: "19001",
    name: "Sample Himalayan Express",
    hint: "Enter 19001 or tap this chip",
  },
  {
    id: "delayed",
    chipLabel: "Delayed sample",
    number: "19002",
    name: "Sample Deccan Mail",
    hint: "Enter 19002 or tap this chip",
  },
];

export const DEMO_PNR_SCENARIOS = [
  {
    id: "confirmed",
    chipLabel: "Confirmed (CNF)",
    pnr: "1000000001",
    hint: "Sample PNR 1000000001",
  },
  {
    id: "rac",
    chipLabel: "RAC sample",
    pnr: "1000000002",
    hint: "Sample PNR 1000000002",
  },
  {
    id: "waitlisted",
    chipLabel: "Waitlisted (WL)",
    pnr: "1000000003",
    hint: "Sample PNR 1000000003",
  },
  {
    id: "mixed",
    chipLabel: "Mixed passengers",
    pnr: "1000000004",
    hint: "Sample PNR 1000000004",
  },
];

const onTimePayload = {
  success: true,
  data: {
    status: "running",
    delayMinutes: 0,
    lastUpdatedAt: T.d0_1118,
    train: {
      number: "19001",
      name: "Sample Himalayan Express",
      type: "Express",
      source: { code: "KLK", name: "Kalka" },
      destination: { code: "SML", name: "Shimla" },
    },
    currentLocation: { stationCode: "BOF", stationName: "Barog", sequence: 3 },
    nextHalt: { stationName: "Solan" },
    previousHalt: { stationName: "Dharampur Himachal" },
    route: [
      {
        sequence: 1,
        stationCode: "KLK",
        stationName: "Kalka",
        scheduledDeparture: T.d0_0600,
        actualDeparture: T.d0_0600,
        status: "departed",
        delayDeparture: 0,
        platform: "1",
      },
      {
        sequence: 2,
        stationCode: "DMP",
        stationName: "Dharampur Himachal",
        scheduledArrival: T.d0_0830,
        scheduledDeparture: T.d0_0845,
        actualArrival: T.d0_0830,
        actualDeparture: T.d0_0845,
        status: "departed",
        delayArrival: 0,
        delayDeparture: 0,
        platform: "1",
      },
      {
        sequence: 3,
        stationCode: "BOF",
        stationName: "Barog",
        scheduledArrival: T.d0_1100,
        scheduledDeparture: T.d0_1118,
        actualArrival: T.d0_1100,
        status: "arrived",
        delayArrival: 0,
        platform: "2",
      },
      {
        sequence: 4,
        stationCode: "SOL",
        stationName: "Solan",
        scheduledArrival: T.d0_1400,
        scheduledDeparture: T.d0_1400,
        status: "pending",
        platform: "1",
      },
      {
        sequence: 5,
        stationCode: "SML",
        stationName: "Shimla",
        scheduledArrival: T.d0_1800,
        status: "pending",
        platform: "1",
      },
    ],
  },
  meta: { timestamp: T.d0_1118, source: "demo-fixture" },
};

const delayedPayload = {
  success: true,
  data: {
    status: "delayed",
    delayMinutes: 40,
    lastUpdatedAt: T.d0_1140,
    train: {
      number: "19002",
      name: "Sample Deccan Mail",
      type: "Mail",
      source: { code: "CSMT", name: "Chhatrapati Shivaji Maharaj Terminus" },
      destination: { code: "MAS", name: "Chennai Central" },
    },
    currentLocation: {
      stationCode: "PUNE",
      stationName: "Pune Junction",
      sequence: 2,
    },
    nextHalt: { stationName: "Solapur" },
    previousHalt: { stationName: "Chhatrapati Shivaji Maharaj Terminus" },
    route: [
      {
        sequence: 1,
        stationCode: "CSMT",
        stationName: "Chhatrapati Shivaji Maharaj Terminus",
        scheduledDeparture: T.d0_0600,
        actualDeparture: T.d0_0615,
        status: "departed",
        delayDeparture: 15,
        platform: "9",
      },
      {
        sequence: 2,
        stationCode: "PUNE",
        stationName: "Pune Junction",
        scheduledArrival: T.d0_1100,
        scheduledDeparture: T.d0_1118,
        actualArrival: T.d0_1140,
        actualDeparture: T.d0_1158,
        status: "arrived",
        delayArrival: 40,
        delayDeparture: 40,
        platform: "3",
      },
      {
        sequence: 3,
        stationCode: "SUR",
        stationName: "Solapur",
        scheduledArrival: T.d0_1800,
        scheduledDeparture: T.d0_1840,
        status: "pending",
        delayArrival: 40,
        platform: "2",
      },
      {
        sequence: 4,
        stationCode: "MAS",
        stationName: "Chennai Central",
        scheduledArrival: "2026-11-16T06:30:00.000Z",
        status: "pending",
        delayArrival: 40,
        platform: "5",
      },
    ],
  },
  meta: { timestamp: T.d0_1140, source: "demo-sample" },
};

const TRAIN_PAYLOADS = {
  "19001": onTimePayload,
  "19002": delayedPayload,
};

export function getDemoTrainPayload(number) {
  const key = String(number ?? "").trim();
  return TRAIN_PAYLOADS[key] || null;
}

export function listDemoTrainDirectory(query = "") {
  const text = String(query || "").trim().toLowerCase();
  const all = DEMO_TRAIN_SCENARIOS.map((scenario) => ({
    number: scenario.number,
    name: scenario.name,
    source: scenario.number === "19001" ? "Kalka" : "Mumbai CSMT",
    destination: scenario.number === "19001" ? "Shimla" : "Chennai Central",
    demoScenarioId: scenario.id,
  }));
  if (text.length < 2) return all;
  return all.filter(
    (train) =>
      train.number.includes(text) || train.name.toLowerCase().includes(text)
  );
}

const PNR_RESULTS = {
  "1000000001": {
    pnrNumber: "1000000001",
    train: {
      number: "19001",
      name: "Sample Himalayan Express",
      source: { code: "KLK", name: "Kalka" },
      destination: { code: "SML", name: "Shimla" },
      boardingPoint: { code: "KLK", name: "Kalka" },
      reservationUpto: { code: "SML", name: "Shimla" },
    },
    journey: { date: "2026-11-15", class: "CC", quota: "GN" },
    charting: {
      isPrepared: true,
      status: "Chart Prepared (sample)",
      chartUrl: null,
    },
    passengers: [
      {
        passengerNumber: 1,
        bookingStatus: "CNF",
        currentStatus: "CNF",
        coach: "C1",
        berthNumber: "12",
        berthCode: "WS",
        isConfirmed: true,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
      {
        passengerNumber: 2,
        bookingStatus: "CNF",
        currentStatus: "CNF",
        coach: "C1",
        berthNumber: "14",
        berthCode: "WS",
        isConfirmed: true,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
    ],
    checkedAt: "2026-11-15T05:48:00.000Z",
  },
  "1000000002": {
    pnrNumber: "1000000002",
    train: {
      number: "19002",
      name: "Sample Deccan Mail",
      source: { code: "CSMT", name: "Chhatrapati Shivaji Maharaj Terminus" },
      destination: { code: "MAS", name: "Chennai Central" },
      boardingPoint: { code: "PUNE", name: "Pune Junction" },
      reservationUpto: { code: "MAS", name: "Chennai Central" },
    },
    journey: { date: "2026-11-15", class: "3A", quota: "GN" },
    charting: {
      isPrepared: false,
      status: "Chart Not Prepared (sample)",
      chartUrl: null,
    },
    passengers: [
      {
        passengerNumber: 1,
        bookingStatus: "RAC/4/GN",
        currentStatus: "RAC",
        coach: "B2",
        berthNumber: "7",
        berthCode: "SL",
        isConfirmed: false,
        isRAC: true,
        isWaitlisted: false,
        isCancelled: false,
      },
    ],
    checkedAt: "2026-11-15T06:10:00.000Z",
  },
  "1000000003": {
    pnrNumber: "1000000003",
    train: {
      number: "19001",
      name: "Sample Himalayan Express",
      source: { code: "KLK", name: "Kalka" },
      destination: { code: "SML", name: "Shimla" },
      boardingPoint: { code: "KLK", name: "Kalka" },
      reservationUpto: { code: "SML", name: "Shimla" },
    },
    journey: { date: "2026-11-15", class: "SL", quota: "GN" },
    charting: {
      isPrepared: false,
      status: "Chart Not Prepared (sample)",
      chartUrl: null,
    },
    passengers: [
      {
        passengerNumber: 1,
        bookingStatus: "WL/18/GN",
        currentStatus: "WL",
        coach: null,
        berthNumber: null,
        berthCode: null,
        isConfirmed: false,
        isRAC: false,
        isWaitlisted: true,
        isCancelled: false,
      },
    ],
    checkedAt: "2026-11-15T05:48:00.000Z",
  },
  "1000000004": {
    pnrNumber: "1000000004",
    train: {
      number: "19002",
      name: "Sample Deccan Mail",
      source: { code: "CSMT", name: "Chhatrapati Shivaji Maharaj Terminus" },
      destination: { code: "MAS", name: "Chennai Central" },
      boardingPoint: { code: "CSMT", name: "Chhatrapati Shivaji Maharaj Terminus" },
      reservationUpto: { code: "MAS", name: "Chennai Central" },
    },
    journey: { date: "2026-11-15", class: "3A", quota: "GN" },
    charting: {
      isPrepared: true,
      status: "Chart Prepared (sample)",
      chartUrl: null,
    },
    passengers: [
      {
        passengerNumber: 1,
        bookingStatus: "CNF",
        currentStatus: "CNF",
        coach: "B1",
        berthNumber: "21",
        berthCode: "LB",
        isConfirmed: true,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
      {
        passengerNumber: 2,
        bookingStatus: "RAC/2/GN",
        currentStatus: "RAC",
        coach: "B1",
        berthNumber: "5",
        berthCode: "SL",
        isConfirmed: false,
        isRAC: true,
        isWaitlisted: false,
        isCancelled: false,
      },
      {
        passengerNumber: 3,
        bookingStatus: "WL/9/GN",
        currentStatus: "WL",
        coach: null,
        berthNumber: null,
        berthCode: null,
        isConfirmed: false,
        isRAC: false,
        isWaitlisted: true,
        isCancelled: false,
      },
    ],
    checkedAt: "2026-11-15T06:10:00.000Z",
  },
};

export function getDemoPnrResult(pnr) {
  const key = String(pnr ?? "").replace(/\D/g, "");
  return PNR_RESULTS[key] || null;
}

export const DEMO_UNKNOWN_INPUT_MESSAGE =
  "Use one of the sample numbers shown";

/** Allowlist demo mode from query/state — anything else defaults to train. */
export function parseDemoMode(value) {
  return String(value ?? "").trim().toLowerCase() === "pnr" ? "pnr" : "train";
}

export function getDemoMeta() {
  return {
    title: "Demo · Sample journeys | RailDisha",
    description:
      "Explore RailDisha with sample train journeys and PNR results. Demo data only — not live updates.",
    path: "/demo",
    canonical: "https://raildisha.com/demo",
    robots: "noindex,nofollow",
  };
}
