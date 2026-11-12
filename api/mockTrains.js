const sampleTrains = [
  {
    number: "12951",
    name: "Mumbai Rajdhani",
    type: "Rajdhani",
    source: "Mumbai Central",
    sourceCode: "MMCT",
    destination: "New Delhi",
    destinationCode: "NDLS",
    status: "running",
    delayMinutes: 15,
    current: { name: "Ratlam", code: "RTM", sequence: 2 },
    next: "Kota",
    stations: [
      ["Mumbai Central", "MMCT", 1, "departed", null],
      ["Ratlam", "RTM", 2, "arrived", 15],
      ["Kota", "KOTA", 3, null, null],
      ["New Delhi", "NDLS", 4, null, null],
    ],
  },
  {
    number: "14095",
    name: "Himalayan Queen",
    type: "Express",
    source: "Kalka",
    sourceCode: "KLK",
    destination: "Shimla",
    destinationCode: "SML",
    status: "delayed",
    delayMinutes: null,
    current: { name: "Barog", code: "BOG", sequence: 2 },
    next: "Solan",
    stations: [
      ["Kalka", "KLK", 1, "departed", null],
      ["Barog", "BOG", 2, "arrived", null],
      ["Solan", "SOL", 3, null, null],
      ["Shimla", "SML", 4, null, null],
    ],
  },
  {
    number: "12001",
    name: "New Delhi Shatabdi",
    type: "Shatabdi",
    source: "New Delhi",
    sourceCode: "NDLS",
    destination: "Bhopal",
    destinationCode: "BPL",
    status: "running",
    delayMinutes: 0,
    current: { name: "New Delhi", code: "NDLS", sequence: 1 },
    next: "Agra Cantt",
    stations: [
      ["New Delhi", "NDLS", 1, "departed", 0],
      ["Agra Cantt", "AGC", 2, null, null],
      ["Bhopal", "BPL", 3, null, null],
    ],
  },
];

export function isLocalMockEnabled() {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "development") return false;
  if (process.env.NODE_ENV === "production") return false;
  return process.env.GATIPATH_MOCK === "1";
}

function searchResult(train) {
  return {
    number: train.number,
    name: train.name,
    source: train.source,
    destination: train.destination,
  };
}

export function mockSearchResponse(query) {
  const text = String(query || "").trim().toLowerCase();
  if (text.length < 2) {
    return { success: true, data: [] };
  }

  const data = sampleTrains
    .filter((train) =>
      train.number.includes(text) ||
      train.name.toLowerCase().includes(text) ||
      train.source.toLowerCase().includes(text) ||
      train.destination.toLowerCase().includes(text)
    )
    .map(searchResult);

  return { success: true, data };
}

function fictionalSchedule(index, count, originDeparture) {
  const isOrigin = index === 0;
  const isDestination = index === count - 1;
  const schedule = {};
  if (!isOrigin) {
    schedule.scheduledArrival = new Date(originDeparture + index * 3600000 + 15 * 60000).toISOString();
  }
  if (!isDestination) {
    const departOffset = isOrigin ? 0 : 25 * 60000;
    schedule.scheduledDeparture = new Date(originDeparture + index * 3600000 + departOffset).toISOString();
  }
  return schedule;
}

function livePayload(train) {
  const originDeparture = Date.parse("2026-10-31T08:00:00+05:30");
  return {
    success: true,
    data: {
      trainNumber: train.number,
      trainName: train.name,
      status: train.status,
      delayMinutes: train.delayMinutes,
      currentLocation: {
        stationName: train.current.name,
        stationCode: train.current.code,
        sequence: train.current.sequence,
      },
      nextHalt: train.next ? { stationName: train.next } : null,
      train: {
        number: train.number,
        name: train.name,
        type: train.type,
        source: { name: train.source, code: train.sourceCode },
        destination: { name: train.destination, code: train.destinationCode },
      },
      route: train.stations.map(([name, code, sequence, status, delay], index, stations) => ({
        stationName: name,
        stationCode: code,
        sequence,
        isHalt: true,
        status,
        delayArrival: delay,
        ...fictionalSchedule(index, stations.length, originDeparture),
      })),
    },
  };
}

export function mockTrainResponse(number) {
  const train = sampleTrains.find((item) => item.number === String(number));
  if (train) return livePayload(train);

  return {
    success: true,
    data: {
      trainNumber: String(number),
      status: "scheduled",
      delayMinutes: null,
      route: [],
    },
  };
}

function mockReviewsResponse(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const href = String(url || "");

  if (href.includes("/api/reviews/moderate")) {
    return {
      ok: false,
      status: 503,
      json: async () => ({
        success: false,
        error:
          "Moderation requires Blob storage and REVIEWS_MODERATION_TOKEN. Local mock mode does not persist reviews.",
      }),
    };
  }

  if (method === "GET") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        storageConfigured: false,
        submissionEnabled: false,
        message:
          "Review storage is not connected yet. Submissions are disabled until a Vercel Blob store is linked to this project.",
        average: null,
        count: 0,
        reviews: [],
      }),
    };
  }

  if (method === "POST") {
    return {
      ok: false,
      status: 503,
      json: async () => ({
        success: false,
        code: "storage_unconfigured",
        error:
          "Review storage is not connected yet. Submissions are disabled until a Vercel Blob store is linked to this project.",
      }),
    };
  }

  return {
    ok: false,
    status: 405,
    json: async () => ({ success: false, error: "Method not allowed." }),
  };
}

export function mockLocalRequest(url, options = {}) {
  const href = String(url || "");
  if (/^https?:\/\//i.test(href) && !href.includes("/api/")) {
    return {
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        error: "External train requests are blocked in local mock mode.",
      }),
    };
  }

  if (href.includes("/api/reviews")) {
    return mockReviewsResponse(href, options);
  }

  const search = href.match(/\/api\/search\?q=([^&]*)/);
  if (search) {
    return {
      ok: true,
      status: 200,
      json: async () => mockSearchResponse(decodeURIComponent(search[1] || "")),
    };
  }

  const train = href.match(/\/api\/train\/(\d+)/);
  if (train) {
    if (!/^\d{5}$/.test(train[1])) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: "Train number must be 5 digits.",
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => mockTrainResponse(train[1]),
    };
  }

  return {
    ok: false,
    status: 404,
    json: async () => ({ success: false, error: "Mock train data is not available." }),
  };
}
