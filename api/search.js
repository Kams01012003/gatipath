import { isLocalMockEnabled, mockSearchResponse } from "./mockTrains.js";

function identityText(...values) {
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

function readTrainIdentity(source, fallbackNumber = "") {
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

function stationLabel({ name, station, code } = {}) {
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

function stationFields(record) {
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

function trainsFromDirectory(data) {
  if (Array.isArray(data)) {
    return data.map((item) => ({
      ...readTrainIdentity(item),
      ...stationFields(item),
    }));
  }

  if (data && typeof data === "object") {
    return Object.entries(data).map(([key, value]) => ({
      ...readTrainIdentity(value, key),
      ...stationFields(value),
    }));
  }

  return [];
}

export default async function handler(req, res) {
  const q = String(req.query?.q || "").trim();

  if (isLocalMockEnabled()) {
    return res.status(200).json(mockSearchResponse(q));
  }

  const apiKey = process.env.RAILRADAR_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RailRadar API key is not configured."
    });
  }

  if (q.length < 2) {
    return res.status(200).json({
      success: true,
      data: []
    });
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json"
  };

  const quotaMessage =
    "Train search is temporarily unavailable because the data provider has reached its request limit. Please try again later.";
  let quotaExceeded = false;

  function quotaError() {
    const error = new Error(quotaMessage);
    error.status = 429;
    return error;
  }

  function throwIfQuota(error) {
    if (error?.status === 429) throw error;
  }

  async function railRadar(url) {
    if (quotaExceeded) {
      throw quotaError();
    }

    const response = await fetch(url, { headers });

    if (response.status === 429) {
      quotaExceeded = true;
      throw quotaError();
    }

    const body = await response.json();

    if (!response.ok) {
      const error = new Error(
        body?.error?.message || "RailRadar request failed."
      );
      error.status = response.status;
      throw error;
    }

    return body;
  }

  function cleanWords(value) {
    return value
      .replace(/\bfrom\b/gi, " ")
      .replace(/\bto\b/gi, " ")
      .replace(/\btrain\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeResults(results) {
    if (!Array.isArray(results)) return [];

    return results
      .map((item) => {
        const identity = readTrainIdentity(item);
        const stations = stationFields(item);
        return {
          ...item,
          number: identity.number,
          name: identity.name,
          source: stations.source,
          destination: stations.destination
        };
      })
      .filter((item) => item.number);
  }

  try {
       /*
 * 1. Direct 5-digit train number search.
 *
 * Use RailRadar's direct train-details endpoint instead
 * of searching the large active/PRS train directories.
 */
const numberMatch = q.match(/\b\d{5}\b/);

if (numberMatch) {
  const trainNumber = numberMatch[0];

  try {
    const response = await railRadar(
      `https://api.railradar.in/v1/legacy/trains/${trainNumber}?dataType=static`
    );

    const payload = response?.data;
    const train = payload?.train;
    const identity = readTrainIdentity(payload, trainNumber);

    if (identity.name) {
      const named = train && typeof train === "object" ? train : {};
      return res.status(200).json({
        success: true,
        data: [
          {
            number: identity.number || trainNumber,
            name: identity.name,
            source: stationLabel({
              name: named.sourceName,
              station: named.source,
              code: named.sourceCode,
            }),
            destination: stationLabel({
              name: named.destinationName,
              station: named.destination,
              code: named.destinationCode,
            })
          }
        ]
      });
    }

    console.warn(
      `Train ${trainNumber} not found in direct lookup. Continuing with other searches.`
    );
  } catch (error) {
    throwIfQuota(error);
    console.warn(
      `Direct lookup for ${trainNumber} failed. Continuing with other searches.`,
      error.message
    );
  }
}

            /*
     * 2. Direct train-name search.
     *
     * Search both active trains and the PRS reserved-train
     * directory so services such as Himalayan Queen 14095/14096
     * are not missed.
     */

    const [compressedBody, compressedPrsBody] = await Promise.all([
      railRadar(
        "https://api.railradar.in/v1/lookup/trains/compressed"
      ),
      railRadar(
        "https://api.railradar.in/v1/lookup/trains/prs/compressed"
      )
    ]);

    const compressedData =
      typeof compressedBody?.data === "string"
        ? compressedBody.data
        : "";

    const compressedPrsData =
      typeof compressedPrsBody?.data === "string"
        ? compressedPrsBody.data
        : "";

    const searchText = q.toLowerCase();

    function parseCompressedTrains(data) {
      return data
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [number, name, sourceCode, destinationCode] =
            line.split("|");

          return {
            number: number?.trim() || "",
            name: name?.trim() || "",
            sourceCode: sourceCode?.trim() || "",
            destinationCode: destinationCode?.trim() || ""
          };
        })
        
.filter(
  (train) =>
    train.number &&
    (
      train.name.toLowerCase().includes(searchText) ||
      train.number.includes(searchText)
    )
);
    }

    const activeMatches = parseCompressedTrains(compressedData);
    const prsMatches = parseCompressedTrains(compressedPrsData);

    const matchingTrains = [
      ...activeMatches,
      ...prsMatches
    ]
      .filter(
        (train, index, array) =>
          array.findIndex(
            (item) => item.number === train.number
          ) === index
      )
      .slice(0, 10);

    if (matchingTrains.length > 0) {
  return res.status(200).json({
    success: true,
    data: matchingTrains.map((train) => ({
      number: train.number,
      name: train.name,
      source: train.sourceCode,
      destination: train.destinationCode
    }))
  });
}

        /*
     * 2b. Full PRS directory fallback.
     *
     * Some reserved trains may not appear in the compressed
     * PRS stream. Use the full PRS directory as a fallback.
     */
    try {
      const prsDirectoryBody = await railRadar(
        "https://api.railradar.in/v1/lookup/trains/prs"
      );

      const prsMatches = trainsFromDirectory(prsDirectoryBody?.data)
        .filter((train) => {
          const name = train.name.toLowerCase();
          const number = String(train.number || "");
          return (
            number &&
            (
              name.includes(searchText) ||
              number.includes(searchText)
            )
          );
        })
        .slice(0, 10)
        .map((train) => ({
          number: train.number,
          name: train.name,
          sourceCode: train.source || "",
          destinationCode: train.destination || ""
        }));

      if (prsMatches.length > 0) {
  const combinedMatches = [
    ...matchingTrains,
    ...prsMatches
  ]
    .filter(
      (train, index, array) =>
        array.findIndex(
          (item) => item.number === train.number
        ) === index
    )
    .slice(0, 10);

  return res.status(200).json({
    success: true,
    data: combinedMatches.map((train) => ({
            number: train.number,
            name: train.name,
            source: train.sourceCode,
            destination: train.destinationCode
          }))
        });
      }
    } catch (error) {
      throwIfQuota(error);
      // Continue to route search if the PRS directory is unavailable.
    }
    /*
 * 2c. Generic RailRadar train search fallback.
 *
 * RailRadar's dedicated search endpoint can find trains by
 * official train name or 5-digit train number even when the
 * compressed directories do not contain the train.
 */
try {
  const genericBody = await railRadar(
    `https://api.railradar.in/v1/lookup/search/trains?q=${encodeURIComponent(
      searchText
    )}&limit=10`
  );

  const genericResults = normalizeResults(genericBody?.data);

  const genericMatches = genericResults.filter((train) => {
    const name = String(train.name || "").toLowerCase();
    const number = String(train.number || "");
    return (
      name.includes(searchText) ||
      number.includes(searchText)
    );
  });

  const combinedMatches = [
    ...matchingTrains,
    ...genericMatches
  ]
    .filter(
      (train, index, array) =>
        array.findIndex(
          (item) => String(item.number) === String(train.number)
        ) === index
    )
    .slice(0, 10);

  if (combinedMatches.length > 0) {
    return res.status(200).json({
      success: true,
      data: combinedMatches.map((train) => ({
        number: train.number,
        name: train.name,
        source: train.source || "",
        destination: train.destination || ""
      }))
    });
  }
} catch (error) {
  throwIfQuota(error);
  // Continue to route search if the generic train search is unavailable.
}
    
    /*
     * 2d. NTES train directory fallback.
     * Search the complete NTES train-number/name mapping.
     */
    try {
      const ntesBody = await railRadar(
        "https://api.railradar.in/v1/lookup/trains/ntes"
      );

      const ntesMatches = trainsFromDirectory(ntesBody?.data)
        .filter((train) =>
          String(train.number).toLowerCase().includes(searchText) ||
          train.name.toLowerCase().includes(searchText)
        )
        .filter((train) => train.number)
        .slice(0, 10)
        .map((train) => ({
          number: train.number,
          name: train.name,
          source: train.source || "",
          destination: train.destination || ""
        }));

      if (ntesMatches.length > 0) {
        return res.status(200).json({
          success: true,
          data: ntesMatches
        });
      }
    } catch (error) {
      throwIfQuota(error);
      console.warn("NTES directory search failed:", error.message);
    }
    /*
     * 3. Route search.
     *
     * Supports:
     * Hyderabad Delhi
     * Hyderabad to Delhi
     * Delhi to Hyderabad
     */
    const cleaned = cleanWords(q);
    const words = cleaned.split(" ").filter(Boolean);

    if (words.length < 2) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    /*
     * Find possible station pairs.
     */
    const stationPairs = [];

    const separatorMatch = q.match(
      /^(.+?)\s+(?:to|from)\s+(.+)$/i
    );

    if (separatorMatch) {
      stationPairs.push({
        fromText: separatorMatch[1].trim(),
        toText: separatorMatch[2].trim()
      });
    }

    /*
     * Also try every possible split.
     */
    for (let i = 1; i < words.length; i++) {
      stationPairs.push({
        fromText: words.slice(0, i).join(" "),
        toText: words.slice(i).join(" ")
      });
    }

    /*
     * We also support:
     *
     * Telangana Hyderabad Delhi
     *
     * by detecting a possible train-name prefix/suffix.
     */
    const trainCandidates = [];

    for (let i = 1; i < words.length; i++) {
      const prefix = words.slice(0, i).join(" ");
      const suffix = words.slice(i).join(" ");

      try {
        const prefixBody = await railRadar(
          `https://api.railradar.in/v1/lookup/search/trains?q=${encodeURIComponent(
            prefix
          )}&limit=10`
        );

        const prefixResults = normalizeResults(prefixBody?.data);

        if (prefixResults.length > 0) {
          trainCandidates.push({
            trains: prefixResults,
            routeText: suffix
          });
        }
      } catch (error) {
        throwIfQuota(error);
        // Continue searching.
      }

      try {
        const suffixBody = await railRadar(
          `https://api.railradar.in/v1/lookup/search/trains?q=${encodeURIComponent(
            suffix
          )}&limit=10`
        );

        const suffixResults = normalizeResults(suffixBody?.data);

        if (suffixResults.length > 0) {
          trainCandidates.push({
            trains: suffixResults,
            routeText: prefix
          });
        }
      } catch (error) {
        throwIfQuota(error);
        // Continue searching.
      }
    }

    /*
     * Add route possibilities from detected train-name
     * combinations.
     */
    for (const candidate of trainCandidates) {
      const routeWords = cleanWords(candidate.routeText)
        .split(" ")
        .filter(Boolean);

      if (routeWords.length >= 2) {
        for (let i = 1; i < routeWords.length; i++) {
          stationPairs.push({
            fromText: routeWords.slice(0, i).join(" "),
            toText: routeWords.slice(i).join(" "),
            trainCandidates: candidate.trains
          });
        }
      }
    }

    /*
     * Remove duplicate station-pair attempts.
     */
    const uniquePairs = [];
    const seenPairs = new Set();

    for (const pair of stationPairs) {
      const key = `${pair.fromText.toLowerCase()}|${pair.toText.toLowerCase()}`;

      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        uniquePairs.push(pair);
      }
    }

    /*
     * Search station names and then find trains between them.
     */
    for (const pair of uniquePairs) {
      try {
        const [fromBody, toBody] = await Promise.all([
          railRadar(
            `https://api.railradar.in/v1/lookup/search/stations?q=${encodeURIComponent(
              pair.fromText
            )}&limit=5`
          ),
          railRadar(
            `https://api.railradar.in/v1/lookup/search/stations?q=${encodeURIComponent(
              pair.toText
            )}&limit=5`
          )
        ]);

        const fromStations = Array.isArray(fromBody?.data)
          ? fromBody.data
          : [];

        const toStations = Array.isArray(toBody?.data)
          ? toBody.data
          : [];

        if (!fromStations.length || !toStations.length) {
          continue;
        }

        const fromStation = fromStations[0];
        const toStation = toStations[0];

        const routeBody = await railRadar(
          `https://api.railradar.in/v1/trains/between/${encodeURIComponent(
            fromStation.code
          )}/${encodeURIComponent(
            toStation.code
          )}?live=true&byCity=true`
        );

        const trains = Array.isArray(routeBody?.data?.trains)
          ? routeBody.data.trains
          : [];

        if (!trains.length) {
          continue;
        }

        let routeResults = trains
          .map((item) => {
            const identity = readTrainIdentity(item);
            return {
              number: identity.number,
              name: identity.name,
              source: fromStation.name,
              destination: toStation.name,
              from: item?.from,
              to: item?.to,
              live: item?.live,
              type: item?.train?.type,
              runDays: item?.train?.runDays
            };
          })
          .filter((train) => train.number);

        /*
         * If a train name was included in the search,
         * keep only that train.
         */
        if (pair.trainCandidates?.length) {
          const allowedNumbers = new Set(
            pair.trainCandidates.map((train) => String(train.number))
          );

          routeResults = routeResults.filter((train) =>
            allowedNumbers.has(String(train.number))
          );
        }

        if (routeResults.length > 0) {
          if (quotaExceeded) throw quotaError();
          return res.status(200).json({
            success: true,
            data: routeResults
          });
        }
      } catch (error) {
        throwIfQuota(error);
        // Try the next possible station pair.
      }
    }

    if (quotaExceeded) throw quotaError();
    return res.status(200).json({
      success: true,
      data: []
    });
  } catch (error) {
    if (quotaExceeded) error = quotaError();
    return res.status(error.status || 502).json({
      success: false,
      error:
        error.message ||
        "Unable to search trains right now."
    });
  }
}
