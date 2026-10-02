export default async function handler(req, res) {
  const apiKey = process.env.RAILRADAR_API_KEY;
  const number = String(req.query?.number || "").replace(/\D/g, "");

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "RailRadar API key is not configured."
    });
  }

  if (!/^\d{5}$/.test(number)) {
    return res.status(400).json({
      success: false,
      error: "Train number must be 5 digits."
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

    return res.status(200).json(body);
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Unable to reach RailRadar right now."
    });
  }
}
