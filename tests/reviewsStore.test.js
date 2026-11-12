import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aggregatePublished,
  getStorageCapability,
  isBlobStorageConfigured,
  listPublishedReviews,
  moderateReview,
  publicReviewView,
  resetMemoryReviewStore,
  seedMemoryPublishedReview,
  submitReview,
  validateReviewInput,
} from "../api/reviewsStore.js";

describe("reviews validation and capability", () => {
  it("validates rating, name, and comment bounds", () => {
    expect(validateReviewInput({ rating: 0, name: "A", comment: "" }).ok).toBe(false);
    expect(validateReviewInput({ rating: 6, name: "A", comment: "" }).ok).toBe(false);
    expect(validateReviewInput({ rating: 5, name: "", comment: "" }).ok).toBe(false);
    expect(
      validateReviewInput({ rating: 5, name: "x".repeat(61), comment: "" }).ok
    ).toBe(false);
    expect(
      validateReviewInput({ rating: 4, name: "Jay", comment: "x".repeat(501) }).ok
    ).toBe(false);
    const ok = validateReviewInput({
      rating: "5",
      name: "  Jay  ",
      comment: "  Smooth boarding UX  ",
    });
    expect(ok.ok).toBe(true);
    expect(ok.value).toEqual({
      rating: 5,
      name: "Jay",
      comment: "Smooth boarding UX",
    });
  });

  it("detects Blob configuration from store id or read-write token only", () => {
    expect(isBlobStorageConfigured({})).toBe(false);
    expect(isBlobStorageConfigured({ BLOB_STORE_ID: "store_abc" })).toBe(true);
    expect(
      isBlobStorageConfigured({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test" })
    ).toBe(true);
  });

  it("keeps submissions disabled when no durable backend is configured", () => {
    const capability = getStorageCapability({
      NODE_ENV: "test",
      GATIPATH_REVIEWS_MEMORY: "0",
    });
    expect(capability.storageConfigured).toBe(false);
    expect(capability.submissionEnabled).toBe(false);
    expect(capability.backend).toBe("none");
  });

  it("escapes public review fields and aggregates averages", () => {
    const view = publicReviewView({
      id: "rv_1",
      rating: 5,
      name: `<script>alert(1)</script>`,
      comment: `Nice & "fast"`,
      createdAt: "2026-11-12T00:00:00.000Z",
    });
    expect(view.name).toContain("&lt;script&gt;");
    expect(view.comment).toContain("&amp;");
    expect(view.comment).toContain("&quot;");
    expect(aggregatePublished([])).toEqual({ average: null, count: 0 });
    expect(
      aggregatePublished([
        { rating: 5 },
        { rating: 4 },
        { rating: 4 },
      ])
    ).toEqual({ average: 4.3, count: 3 });
  });
});

describe("memory test store (offline only)", () => {
  beforeEach(() => {
    resetMemoryReviewStore();
    vi.stubEnv("GATIPATH_REVIEWS_MEMORY", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("REVIEWS_MODERATION_TOKEN", "mod-test-token");
  });

  afterEach(() => {
    resetMemoryReviewStore();
    vi.unstubAllEnvs();
  });

  it("does not treat memory as available in production even when flagged", () => {
    vi.stubEnv("NODE_ENV", "production");
    const capability = getStorageCapability(process.env);
    expect(capability.backend).toBe("none");
    expect(capability.submissionEnabled).toBe(false);
  });

  it("accepts pending reviews and publishes only after moderation", async () => {
    const submitted = await submitReview({
      rating: 5,
      name: "Asha",
      comment: "Clear live status",
      clientKey: "test-client-1",
    });
    expect(submitted.status).toBe("pending");

    const before = await listPublishedReviews();
    expect(before).toHaveLength(0);

    const published = await moderateReview({
      id: submitted.id,
      action: "publish",
    });
    expect(published.status).toBe("published");

    const after = await listPublishedReviews();
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("Asha");
  });

  it("rejects duplicate submissions and enforces rate limits", async () => {
    const payload = {
      rating: 4,
      name: "Ravi",
      comment: "Helpful",
      clientKey: "rate-client",
    };
    await submitReview(payload);
    await expect(submitReview(payload)).rejects.toMatchObject({
      code: "duplicate_submission",
      status: 409,
    });

    for (let i = 0; i < 4; i += 1) {
      await submitReview({
        rating: 3,
        name: `User${i}`,
        comment: `Comment ${i}`,
        clientKey: "rate-client",
      });
    }
    await expect(
      submitReview({
        rating: 2,
        name: "Overflow",
        comment: "one more",
        clientKey: "rate-client",
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });

  it("rejects moderation without a configured token", async () => {
    seedMemoryPublishedReview({
      id: "seed",
      rating: 5,
      name: "Seed",
      comment: "",
      createdAt: "2026-11-12T00:00:00.000Z",
    });
    vi.stubEnv("REVIEWS_MODERATION_TOKEN", "");
    await expect(
      moderateReview({ id: "anything", action: "publish" })
    ).rejects.toMatchObject({
      code: "moderation_unconfigured",
      status: 503,
    });
  });
});
