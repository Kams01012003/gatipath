import {
  aggregatePublished,
  getStorageCapability,
  listPublishedReviews,
  publicReviewView,
  submitReview,
} from "./reviewsStore.js";

function readClientKey(req) {
  const header = req.headers?.["x-raildisha-client"] || req.headers?.["X-RailDisha-Client"];
  if (typeof header === "string" && header.trim()) return header.trim().slice(0, 128);
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return `ip:${forwarded.split(",")[0].trim()}`.slice(0, 128);
  }
  return "anonymous";
}

export default async function handler(req, res) {
  const method = req.method || "GET";

  if (method === "GET") {
    try {
      const capability = getStorageCapability();
      if (!capability.storageConfigured) {
        return res.status(200).json({
          success: true,
          storageConfigured: false,
          submissionEnabled: false,
          message: capability.message,
          average: null,
          count: 0,
          reviews: [],
        });
      }

      const published = await listPublishedReviews();
      const { average, count } = aggregatePublished(published);
      return res.status(200).json({
        success: true,
        storageConfigured: true,
        submissionEnabled: true,
        message: "",
        average,
        count,
        reviews: published.map(publicReviewView),
      });
    } catch {
      return res.status(503).json({
        success: false,
        storageConfigured: getStorageCapability().storageConfigured,
        submissionEnabled: false,
        error: "Reviews are temporarily unavailable. Please try again later.",
        average: null,
        count: 0,
        reviews: [],
      });
    }
  }

  if (method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const result = await submitReview({
        rating: body.rating,
        name: body.name,
        comment: body.comment,
        clientKey: readClientKey(req),
      });
      return res.status(202).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        success: false,
        code: error.code || "error",
        error: error.message || "Unable to submit review.",
        details: error.details || undefined,
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({
    success: false,
    error: "Method not allowed.",
  });
}
