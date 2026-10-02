export default async function handler(req, res) {
  const apiKey = process.env.RAILRADAR_API_KEY;
  const q = String(req.query?.q || "").trim();

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

  try {
    const url = `https://api.railradar.in/v1/lookup/search/trains?q=${encodeURIComponent(q)}&limit=10`;

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
        error: body?.error?.message || "Train search is temporarily unavailable."
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
