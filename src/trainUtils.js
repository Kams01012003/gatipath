export function isValidDateInput(value) {
  if (value == null || value === "") return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

export function formatTime(iso) {
  if (!isValidDateInput(iso)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export function parseDelay(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    const number = Number(trimmed);
    if (!Number.isFinite(number)) return null;
    return number;
  }

  return null;
}

export function formatDelay(minutes) {
  const value = parseDelay(minutes);
  if (value == null) return "Delay unavailable";
  if (value === 0) return "On time";

  const hours = Math.floor(value / 60);
  const mins = value % 60;

  if (hours > 0 && mins > 0) {
    return `${hours} hr ${mins} min late`;
  }

  if (hours > 0) {
    return `${hours} hr late`;
  }

  return `${mins} min late`;
}

export function formatUpdated(iso) {
  if (!isValidDateInput(iso)) return "Live status";
  return `Updated ${new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso))}`;
}

export function indiaCalendarDayKey(iso) {
  if (!isValidDateInput(iso)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function journeyDayNumber(scheduled, firstScheduled) {
  const startKey = indiaCalendarDayKey(firstScheduled);
  const currentKey = indiaCalendarDayKey(scheduled);
  if (!startKey || !currentKey) return 1;

  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [currentYear, currentMonth, currentDay] = currentKey.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const currentUtc = Date.UTC(currentYear, currentMonth - 1, currentDay);
  return Math.max(Math.floor((currentUtc - startUtc) / 86400000) + 1, 1);
}

export function hasUsableIdentifier(value) {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "string" && value.trim()) return true;
  return false;
}

export function identifiersMatch(left, right) {
  if (!hasUsableIdentifier(left) || !hasUsableIdentifier(right)) return false;
  return String(left).trim() === String(right).trim();
}

export function sequenceGreaterThan(candidate, reference) {
  if (!hasUsableIdentifier(candidate) || !hasUsableIdentifier(reference)) {
    return false;
  }
  const left = Number(candidate);
  const right = Number(reference);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return left > right;
}

export function identityText(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function readTrainIdentity(source, fallbackNumber = "") {
  if (typeof source === "string" || typeof source === "number") {
    const text = identityText(source);
    if (/^\d{5}$/.test(text)) {
      return { number: text, name: "" };
    }
    return { number: identityText(fallbackNumber), name: text };
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { number: identityText(fallbackNumber), name: "" };
  }

  const nested =
    source.train && typeof source.train === "object" && !Array.isArray(source.train)
      ? source.train
      : null;

  return {
    number: identityText(
      source.number,
      source.trainNumber,
      nested?.number,
      nested?.trainNumber,
      fallbackNumber
    ),
    name: identityText(
      source.name,
      source.trainName,
      nested?.name,
      nested?.trainName
    ),
  };
}

export function stationLabel({ name, station, code } = {}) {
  const objectName =
    station && typeof station === "object"
      ? identityText(station.name, station.stationName)
      : "";
  const explicitName = identityText(name, objectName);
  if (explicitName) return explicitName;
  if (typeof station === "string" && station.trim()) return station.trim();
  const objectCode =
    station && typeof station === "object"
      ? identityText(station.code, station.stationCode)
      : "";
  return identityText(code, objectCode);
}

export function stationFields(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { source: "", destination: "" };
  }

  return {
    source: stationLabel({
      name: record.sourceName,
      station: record.source,
      code: record.sourceCode,
    }),
    destination: stationLabel({
      name: record.destinationName,
      station: record.destination,
      code: record.destinationCode,
    }),
  };
}

function preferUsableStationLabel(primary, fallback) {
  return primary || fallback || "";
}

export function directLookupStations(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { source: "", destination: "" };
  }

  const nested =
    payload.train && typeof payload.train === "object" && !Array.isArray(payload.train)
      ? payload.train
      : {};

  const nestedSource = stationLabel({
    name: nested.sourceName,
    station: nested.source,
    code: nested.sourceCode,
  });
  const rootSource = stationLabel({
    name: payload.sourceName,
    station: payload.source,
    code: payload.sourceCode,
  });
  const nestedDestination = stationLabel({
    name: nested.destinationName,
    station: nested.destination,
    code: nested.destinationCode,
  });
  const rootDestination = stationLabel({
    name: payload.destinationName,
    station: payload.destination,
    code: payload.destinationCode,
  });

  return {
    // Resolve nested and root labels independently so a truthy empty nested
    // object (e.g. source: {}) cannot suppress a usable root name.
    source: preferUsableStationLabel(nestedSource, rootSource),
    destination: preferUsableStationLabel(nestedDestination, rootDestination),
  };
}

export function formatRouteEndpoints(source, destination) {
  const from = typeof source === "string" ? source.trim() : "";
  const to = typeof destination === "string" ? destination.trim() : "";
  if (from && to) return `${from} → ${to}`;
  if (from) return from;
  if (to) return to;
  return "";
}

export function isExactFiveDigitTrainNumber(value) {
  return /^\d{5}$/.test(String(value ?? "").trim());
}

export function mapLiveTrain(payload, fallback = {}) {
  const data = payload?.data;
  if (!data) return null;

  const route = Array.isArray(data.route)
    ? data.route.filter((stop) => stop.isHalt !== false)
    : [];
  const currentCode = data.currentLocation?.stationCode;
  const currentSequence = data.currentLocation?.sequence;

  const totalStations = route.length;
  const stationsRemaining = hasUsableIdentifier(currentSequence)
    ? route.filter((stop) => sequenceGreaterThan(stop.sequence, currentSequence)).length
    : null;

  const firstScheduled = route[0]?.scheduledDeparture || route[0]?.scheduledArrival;

  const stations = route.map((stop) => {
    let state = "Upcoming";
    if (stop.sequence === 1) state = "Origin";
    else if (stop.sequence === route.length) state = "Destination";

    if (stop.status === "departed" || stop.status === "arrived") state = "Completed";
    if (
      identifiersMatch(stop.sequence, currentSequence) ||
      identifiersMatch(stop.stationCode, currentCode)
    ) {
      state = "Current";
    }

    const scheduled = stop.scheduledArrival || stop.scheduledDeparture;
    const dayNumber = journeyDayNumber(scheduled, firstScheduled);

    return {
      name: stop.stationName,
      time: formatTime(scheduled),
      dayNumber,
      arrival: formatTime(stop.scheduledArrival),
      departure: formatTime(stop.scheduledDeparture),
      actualArrival: formatTime(stop.actualArrival),
      actualDeparture: formatTime(stop.actualDeparture),
      platform: stop.platform || null,
      state,
      code: stop.stationCode,
      sequence: stop.sequence,
      delay: parseDelay(stop.delayArrival ?? stop.delayDeparture),
    };
  });

  const status = String(data.status || "").toLowerCase();
  let state = "scheduled";
  if (status.includes("cancel")) state = "cancelled";
  else if (status.includes("complete") || status.includes("arrived") || status === "terminated") {
    state = "completed";
  } else if (status === "delayed") state = "delayed";
  else if (status === "scheduled") state = "scheduled";
  else if (status === "running") state = "running";

  const currentStation =
    data.currentLocation?.stationName ||
    data.previousHalt?.stationName ||
    null;

  const identity = readTrainIdentity(data);
  const hasSchedule = stations.length > 0;

  return {
    number: identity.number || fallback.number || "",
    name: identity.name || fallback.name || "Train",
    totalStations,
    stationsRemaining,
    hasSchedule,
    type: data.train?.type || data.train?.category || "Train",
    from: data.train?.source?.name || "Origin",
    to: data.train?.destination?.name || "Destination",
    fromCode: data.train?.source?.code,
    toCode: data.train?.destination?.code,
    state,
    delay: parseDelay(data.delayMinutes),
    current: currentStation,
    next: data.nextHalt?.stationName || null,
    updatedAt: data.lastUpdatedAt || payload?.meta?.timestamp,
    stations,
  };
}

export function trainHeading(train) {
  const name = typeof train?.name === "string" ? train.name.trim() : "";
  if (name && name !== "Train") return name;
  const number = typeof train?.number === "string" ? train.number.trim() : "";
  return number || name || "Train";
}
