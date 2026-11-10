import { isLocalMockEnabled, mockTrainResponse } from "../mockTrains.js";

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

export default async function handler(req, res) {
  const number = String(req.query?.number || "").replace(/\D/g, "");

  if (!/^\d{5}$/.test(number)) {
    return res.status(400).json({
      success: false,
      error: "Train number must be 5 digits."
    });
  }

  if (isLocalMockEnabled()) {
    return res.status(200).json(mockTrainResponse(number));
  }

  const apiKey = process.env.RAILRADAR_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RailRadar API key is not configured."
    });
  }

  try {
    const params = new URLSearchParams();

    if (req.query?.date) {
      params.set("date", String(req.query.date));
    }

    if (String(req.query?.authoritative || "") === "true") {
      params.set("authoritative", "true");
    }
    
    params.set("haltsOnly", "true");

    const queryString = params.toString();

    const url =
      `https://api.railradar.in/v1/trains/${number}/live` +
      (queryString ? `?${queryString}` : "");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    const body = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error:
          body?.error?.message ||
          "Live train status is temporarily unavailable."
      });
    }

        if (
      body?.success &&
      body?.data &&
      Array.isArray(body.data.route) &&
      body.data.route.length === 0
    ) {
      try {
        const staticUrl =
          `https://api.railradar.in/v1/legacy/trains/${number}` +
          `?dataType=static` +
          (req.query?.date
            ? `&journeyDate=${encodeURIComponent(String(req.query.date))}`
            : "");

        const staticResponse = await fetch(staticUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json"
          }
        });

        if (staticResponse.ok) {
          const staticBody = await staticResponse.json();
          const staticData = staticBody?.data;
          const staticRoute = staticData?.route;

          if (Array.isArray(staticRoute) && staticRoute.length > 0) {
            body.data.route = staticRoute;
          }

          const liveIdentity = readTrainIdentity(body.data);
          const staticIdentity = readTrainIdentity(staticData);
          if (!liveIdentity.number && staticIdentity.number) {
            body.data.trainNumber = staticIdentity.number;
          }
          if (!liveIdentity.name && staticIdentity.name) {
            body.data.trainName = staticIdentity.name;
          }
        }
      } catch (fallbackError) {
        // Keep the original live response if static route lookup fails.
      }
    }

    return res.status(200).json(body);
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Unable to reach RailRadar right now."
    });
  }
}
