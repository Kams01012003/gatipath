import { describe, expect, it, vi } from "vitest";
import { isLocalMockEnabled, mockLocalRequest } from "../api/mockTrains.js";
import { isFrontendMockEnabled } from "../src/localApi.js";

describe("mock fail-closed behavior", () => {
  it("blocks external provider URLs in local mock mode", async () => {
    const blocked = await mockLocalRequest("https://api.railradar.in/v1/trains/12951/live");
    expect(blocked.status).toBe(403);
    const body = await blocked.json();
    expect(body.success).toBe(false);
  });

  it("serves fixture search and train routes offline", async () => {
    const search = await mockLocalRequest("/api/search?q=12951");
    expect(search.ok).toBe(true);
    const searchBody = await search.json();
    expect(searchBody.data[0].number).toBe("12951");

    const train = await mockLocalRequest("/api/train/12951");
    expect(train.ok).toBe(true);
    const trainBody = await train.json();
    expect(trainBody.data.route.length).toBeGreaterThan(0);
  });

  it("rejects malformed train mock paths without contacting providers", async () => {
    const response = await mockLocalRequest("/api/train/abc12951");
    // Path regex only matches digits; malformed falls through to 404 mock miss.
    expect([400, 404]).toContain(response.status);
  });
});

describe("environment mock switches", () => {
  it("keeps production mocks disabled even when flags are set", () => {
    vi.stubEnv("GATIPATH_MOCK", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocalMockEnabled()).toBe(false);
    expect(
      isFrontendMockEnabled({ DEV: false, VITE_GATIPATH_MOCK: "1" })
    ).toBe(false);
    vi.unstubAllEnvs();
  });
});
