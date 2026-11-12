import { moderateReview } from "../reviewsStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const expected = String(process.env.REVIEWS_MODERATION_TOKEN || "").trim();
  const provided = typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized moderation request.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await moderateReview({
      id: body.id,
      action: body.action,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || "error",
      error: error.message || "Unable to moderate review.",
    });
  }
}
