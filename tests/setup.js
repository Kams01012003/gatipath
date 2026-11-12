import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const PROVIDER_HOST_RE =
  /railradar\.in|ntes|irctc\.co|enquiry\.indianrail\.gov|api\.railway/i;

if (typeof globalThis.__externalProviderFetchCount !== "number") {
  globalThis.__externalProviderFetchCount = 0;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();

  // Default fail-closed fetch: tests that need responses must stub/replace this.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(input);
      if (PROVIDER_HOST_RE.test(url) || /^https?:\/\//i.test(url)) {
        globalThis.__externalProviderFetchCount += 1;
        throw new Error(`Unexpected network request blocked: ${url}`);
      }
      throw new Error(`Unexpected fetch blocked: ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
