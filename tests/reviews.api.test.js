import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reviewsHandler from "../api/reviews.js";
import moderateHandler from "../api/reviews/moderate.js";
import { resetMemoryReviewStore } from "../api/reviewsStore.js";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("reviews API handlers", () => {
  beforeEach(() => {
    resetMemoryReviewStore();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetMemoryReviewStore();
    vi.unstubAllEnvs();
  });

  it("GET reports unconfigured storage and disabled submissions", async () => {
    const res = mockRes();
    await reviewsHandler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.storageConfigured).toBe(false);
    expect(res.body.submissionEnabled).toBe(false);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.message).toBe(
      "Reviews are temporarily unavailable. Please try again later."
    );
  });

  it("POST fails closed when storage is not connected", async () => {
    const res = mockRes();
    await reviewsHandler(
      {
        method: "POST",
        headers: {},
        body: { rating: 5, name: "Jay", comment: "Great" },
      },
      res
    );
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe("storage_unconfigured");
  });

  it("GET/POST work with memory test store and moderation token", async () => {
    vi.stubEnv("GATIPATH_REVIEWS_MEMORY", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REVIEWS_MODERATION_TOKEN", "mod-secret");

    const post = mockRes();
    await reviewsHandler(
      {
        method: "POST",
        headers: { "x-raildisha-client": "api-test-client" },
        body: { rating: 5, name: "Neha", comment: "Accurate ETA" },
      },
      post
    );
    expect(post.statusCode).toBe(202);
    expect(post.body.status).toBe("pending");

    const getPending = mockRes();
    await reviewsHandler({ method: "GET", headers: {} }, getPending);
    expect(getPending.body.count).toBe(0);

    const moderate = mockRes();
    await moderateHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer mod-secret" },
        body: { id: post.body.id, action: "publish" },
      },
      moderate
    );
    expect(moderate.statusCode).toBe(200);
    expect(moderate.body.status).toBe("published");

    const getPublished = mockRes();
    await reviewsHandler({ method: "GET", headers: {} }, getPublished);
    expect(getPublished.body.count).toBe(1);
    expect(getPublished.body.average).toBe(5);
    expect(getPublished.body.reviews[0].name).toBe("Neha");
  });

  it("rejects unauthorized moderation", async () => {
    vi.stubEnv("REVIEWS_MODERATION_TOKEN", "mod-secret");
    const res = mockRes();
    await moderateHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body: { id: "x", action: "publish" },
      },
      res
    );
    expect(res.statusCode).toBe(401);
  });
});
