import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/main.jsx";
import { ReviewsSection } from "../src/ReviewsSection.jsx";
import { jsonResponse } from "./helpers/offlineFetch.js";

const localApiState = {
  handler: null,
  calls: [],
};

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async (url, options) => {
    localApiState.calls.push({ url, options });
    if (localApiState.handler) {
      return localApiState.handler(url, options);
    }
    throw new Error(`Unhandled localApi URL: ${url}`);
  }),
}));

afterEach(() => {
  cleanup();
  localApiState.calls = [];
  localApiState.handler = null;
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("reviews UI ready-to-connect behavior", () => {
  it("shows the reviews section with submit disabled when storage is unconfigured", async () => {
    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/reviews")) {
        return jsonResponse({
          success: true,
          storageConfigured: false,
          submissionEnabled: false,
          message: "Reviews are temporarily unavailable. Please try again later.",
          average: null,
          count: 0,
          reviews: [],
        });
      }
      return jsonResponse({ success: true, data: [] });
    };

    render(<App />);

    expect(screen.getByRole("link", { name: /reviews/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /ratings & reviews/i })
    ).toBeInTheDocument();
    expect(screen.getByText("No reviews yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Reviews are temporarily unavailable. Please try again later.")
    ).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /submit review/i });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText(/display name/i)).toBeDisabled();
    expect(screen.getByPlaceholderText(/what worked well for you/i)).toBeDisabled();
  });

  it("submits through the API when storage is enabled", async () => {
    let posted = null;
    localApiState.handler = async (url, options = {}) => {
      if (String(url).startsWith("/api/reviews") && options.method === "POST") {
        posted = JSON.parse(options.body);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            success: true,
            status: "pending",
            message: "Thanks. Pending moderation.",
          }),
        };
      }
      if (String(url).startsWith("/api/reviews")) {
        return jsonResponse({
          success: true,
          storageConfigured: true,
          submissionEnabled: true,
          message: "",
          average: 5,
          count: 1,
          reviews: [
            {
              id: "rv_seed",
              rating: 5,
              name: "Seed",
              comment: "Published sample",
              createdAt: "2026-11-12T00:00:00.000Z",
            },
          ],
        });
      }
      return jsonResponse({ success: true, data: [] });
    };

    render(<ReviewsSection />);
    expect(await screen.findByText(/average from 1 published review/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /5 stars/i }));
    await user.type(screen.getByLabelText(/display name/i), "Jay");
    await user.type(screen.getByPlaceholderText(/what worked well for you/i), "Clean UI");
    await user.click(screen.getByRole("button", { name: /submit review/i }));

    await waitFor(() => {
      expect(posted).toEqual({ rating: 5, name: "Jay", comment: "Clean UI" });
    });
    expect(await screen.findByText(/thanks\. pending moderation/i)).toBeInTheDocument();
  });
});
