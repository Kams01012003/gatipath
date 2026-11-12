import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/main.jsx";
import { jsonResponse } from "./helpers/offlineFetch.js";

const searchHits = [
  {
    number: "12951",
    name: "Mumbai Rajdhani",
    source: "Mumbai Central",
    destination: "New Delhi",
  },
  {
    number: "14095",
    name: "Himalayan Queen",
    source: "Kalka",
    destination: "Shimla",
  },
];

const localApiState = {
  handler: null,
  calls: [],
};

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async (url, options) => {
    localApiState.calls.push(url);
    if (localApiState.handler) {
      return localApiState.handler(url, options);
    }
    throw new Error(`Unhandled localApi URL: ${url}`);
  }),
}));

function liveTrainPayload(overrides = {}) {
  return {
    success: true,
    data: {
      trainNumber: "12951",
      trainName: "Mumbai Rajdhani",
      status: "running",
      delayMinutes: 15,
      lastUpdatedAt: "2026-10-31T12:00:00+05:30",
      currentLocation: {
        stationName: "Ratlam",
        stationCode: "RTM",
        sequence: 2,
      },
      nextHalt: { stationName: "Kota" },
      train: {
        number: "12951",
        name: "Mumbai Rajdhani",
        type: "Rajdhani",
        source: { name: "Mumbai Central", code: "MMCT" },
        destination: { name: "New Delhi", code: "NDLS" },
      },
      route: [
        {
          stationName: "Mumbai Central",
          stationCode: "MMCT",
          sequence: 1,
          status: "departed",
          scheduledDeparture: "2026-10-31T23:00:00+05:30",
        },
        {
          stationName: "Ratlam",
          stationCode: "RTM",
          sequence: 2,
          status: "arrived",
          delayArrival: 15,
          scheduledArrival: "2026-11-01T01:00:00+05:30",
          scheduledDeparture: "2026-11-01T01:15:00+05:30",
        },
        {
          stationName: "Kota",
          stationCode: "KOTA",
          sequence: 3,
          scheduledArrival: "2026-11-01T04:00:00+05:30",
          scheduledDeparture: "2026-11-01T04:10:00+05:30",
        },
        {
          stationName: "New Delhi",
          stationCode: "NDLS",
          sequence: 4,
          scheduledArrival: "2026-11-01T08:00:00+05:30",
        },
      ],
      ...overrides,
    },
  };
}

function setApiHandlers(handlers = {}) {
  localApiState.handler = async (url) => {
    if (String(url).startsWith("/api/reviews")) {
      if (handlers.reviews) return handlers.reviews(url);
      return jsonResponse({
        success: true,
        storageConfigured: false,
        submissionEnabled: false,
        message:
          "Review storage is not connected yet. Submissions are disabled until a Vercel Blob store is linked to this project.",
        average: null,
        count: 0,
        reviews: [],
      });
    }
    if (url.startsWith("/api/search")) {
      const query = decodeURIComponent(url.split("q=")[1] || "");
      if (handlers.search) return handlers.search(query, url);
      const data = searchHits.filter(
        (item) =>
          item.number.includes(query) ||
          item.name.toLowerCase().includes(query.toLowerCase())
      );
      return jsonResponse({ success: true, data });
    }
    if (url.startsWith("/api/train/")) {
      const number = url.split("/api/train/")[1];
      if (handlers.train) return handlers.train(number, url);
      return jsonResponse(liveTrainPayload());
    }
    throw new Error(`Unexpected localApi URL: ${url}`);
  };
}

beforeEach(() => {
  localApiState.calls = [];
  setApiHandlers();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

async function typeQuery(text) {
  const user = userEvent.setup();
  const input = screen.getByRole("textbox", {
    name: /search trains by number or name/i,
  });
  await user.clear(input);
  await user.type(input, text);
  return user;
}

describe("search accessibility and empty-result timing", () => {
  it("exposes the search textbox by accessible name", () => {
    render(<App />);
    expect(
      screen.getByRole("textbox", { name: /search trains by number or name/i })
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Train number or name")
    ).toBeInTheDocument();
  });

  it("does not show empty results for a two-character query", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    await typeQuery("ra");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.queryByText(/no matching trains found/i)).not.toBeInTheDocument();
    expect(localApiState.calls.some((url) => url.includes("/api/search"))).toBe(false);
  });

  it("does not flash empty results before debounce or during loading", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveSearch;
    setApiHandlers({
      search: () =>
        new Promise((resolve) => {
          resolveSearch = () =>
            resolve(jsonResponse({ success: true, data: [] }));
        }),
    });
    render(<App />);
    await typeQuery("zzz");

    expect(screen.queryByText(/no matching trains found/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByText(/searching live train directory/i)).toBeInTheDocument();
    expect(screen.queryByText(/no matching trains found/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveSearch();
    });

    expect(await screen.findByText(/no matching trains found/i)).toBeInTheDocument();
  });

  it("preserves debounce, cache, and stale-response protection", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async (query) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        if (query === "old") {
          return jsonResponse({
            success: true,
            data: [{ number: "00000", name: "Stale", source: "", destination: "" }],
          });
        }
        return jsonResponse({
          success: true,
          data: searchHits.filter((item) =>
            item.name.toLowerCase().includes(query.toLowerCase())
          ),
        });
      },
    });

    render(<App />);
    const input = screen.getByRole("textbox", {
      name: /search trains by number or name/i,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.type(input, "old");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await user.clear(input);
    await user.type(input, "Himalayan");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(await screen.findByText("Himalayan Queen")).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();

    const searchCallsBeforeCache = localApiState.calls.filter((url) =>
      url.includes("/api/search")
    ).length;
    await user.clear(input);
    await user.type(input, "Himalayan");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText("Himalayan Queen")).toBeInTheDocument();
    expect(
      localApiState.calls.filter((url) => url.includes("/api/search")).length
    ).toBe(searchCallsBeforeCache);
  });
});

describe("journey UI fixes", () => {
  it("shows DAY 2 for overnight calendar crossings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "12951"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    await user.click(await screen.findByRole("button", { name: /mumbai rajdhani/i }));
    expect(await screen.findByText("DAY 2")).toBeInTheDocument();
    expect(screen.getByText(/current location/i)).toBeInTheDocument();
  });

  it("shows schedule-unavailable for empty routes while preserving status", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async () =>
        jsonResponse({
          success: true,
          data: [
            {
              number: "19999",
              name: "Ghost Mail",
              source: "",
              destination: "",
            },
          ],
        }),
      train: async () =>
        jsonResponse({
          success: true,
          data: {
            trainNumber: "19999",
            trainName: "Ghost Mail",
            status: "running",
            delayMinutes: 8,
            currentLocation: { stationName: "Unknown halt" },
            route: [],
            train: {
              name: "Ghost Mail",
              type: "Express",
              source: { name: "Origin" },
              destination: { name: "Destination" },
            },
          },
        }),
    });

    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "Ghost"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });

    const result = await screen.findByRole("button", { name: /ghost mail/i });
    expect(result.textContent).not.toMatch(/·\s*→/);
    expect(result.textContent).toContain("19999");
    await user.click(result);

    expect(await screen.findByText(/schedule unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/route schedule is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/on the way/i)).toBeInTheDocument();
    expect(screen.queryByText(/0 stations/i)).not.toBeInTheDocument();
    expect(screen.getByText(/unknown halt/i)).toBeInTheDocument();
  });

  it("makes Search again a native button that resets and clears the URL", async () => {
    window.history.pushState(null, "", "/?train=12951");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: /mumbai rajdhani/i })).toBeInTheDocument();
    const trainCallsBeforeReset = localApiState.calls.filter((url) =>
      url.includes("/api/train/")
    ).length;

    const again = screen.getByRole("button", { name: /search again/i });
    again.focus();
    expect(again).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("textbox", { name: /search trains by number or name/i })
    ).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(
      localApiState.calls.filter((url) => url.includes("/api/train/")).length
    ).toBe(trainCallsBeforeReset);
  });

  it("loads directly from URL and supports boarding, share, rating, and zero delay", async () => {
    setApiHandlers({
      train: async () => jsonResponse(liveTrainPayload({ delayMinutes: 0 })),
    });
    window.history.pushState(null, "", "/?train=12951");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByText(/on time/i)).toBeInTheDocument();
    expect(screen.getByText(/current location/i)).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /boarding station/i }),
      "Kota"
    );
    expect(screen.getByText("YOUR STATION")).toBeInTheDocument();

    const share = screen.getByRole("button", { name: /share/i });
    expect(share).toHaveAttribute("type", "button");
    await user.click(share);

    expect(
      screen.getByRole("link", { name: /leave a review on raildisha/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/thanks for your feedback/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /search again/i }));
    expect(window.location.search).toBe("");
  });

  it("uses selection name fallback and arrival/departure placeholders", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async () =>
        jsonResponse({
          success: true,
          data: [
            {
              number: "12001",
              name: "",
              source: "New Delhi",
              destination: "Bhopal",
            },
          ],
        }),
      train: async () =>
        jsonResponse({
          success: true,
          data: {
            trainNumber: "12001",
            status: "scheduled",
            route: [
              {
                stationName: "New Delhi",
                stationCode: "NDLS",
                sequence: 1,
                scheduledDeparture: "2026-10-31T08:00:00+05:30",
              },
              {
                stationName: "Bhopal",
                stationCode: "BPL",
                sequence: 2,
                scheduledArrival: "2026-10-31T14:00:00+05:30",
              },
            ],
            train: {
              number: "12001",
              type: "Shatabdi",
              source: { name: "New Delhi" },
              destination: { name: "Bhopal" },
            },
          },
        }),
    });

    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "12001"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    await user.click(await screen.findByRole("button", { name: /12001/i }));
    expect(await screen.findByRole("heading", { name: "12001" })).toBeInTheDocument();
    expect(screen.getAllByText("ARRIVAL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("reports network errors without showing premature empty results", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async () => {
        throw new Error("Network down");
      },
    });
    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "fail"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    expect(screen.queryByText(/no matching trains found/i)).not.toBeInTheDocument();
  });

  it("reports malformed train JSON from a direct URL load", async () => {
    setApiHandlers({
      train: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    });
    window.history.pushState(null, "", "/?train=12951");
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/unexpected token/i)).toBeInTheDocument();
    });
  });

  it("alerts for unsupported voice search", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /search by voice/i }));
    expect(alertSpy).toHaveBeenCalledWith(
      "Voice search is not supported in this browser."
    );
  });

  it("does not show empty results after selection while loading journey", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveTrain;
    setApiHandlers({
      train: () =>
        new Promise((resolve) => {
          resolveTrain = () => resolve(jsonResponse(liveTrainPayload()));
        }),
    });
    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "12951"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    await user.click(await screen.findByRole("button", { name: /mumbai rajdhani/i }));
    expect(screen.queryByText(/no matching trains found/i)).not.toBeInTheDocument();
    expect(screen.getByText(/connecting to live railway data/i)).toBeInTheDocument();

    await act(async () => {
      resolveTrain();
    });
    expect(await screen.findByRole("heading", { name: /mumbai rajdhani/i })).toBeInTheDocument();
  });

  it("shows empty results after failed load once the query is edited", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async (query) => {
        if (query.toLowerCase() === "zzzz") {
          return jsonResponse({ success: true, data: [] });
        }
        return jsonResponse({
          success: true,
          data: [
            {
              number: "12951",
              name: "Mumbai Rajdhani",
              source: "Mumbai Central",
              destination: "New Delhi",
            },
          ],
        });
      },
      train: async () =>
        jsonResponse(
          { success: false, error: "Upstream unavailable" },
          502
        ),
    });

    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const input = screen.getByRole("textbox", {
      name: /search trains by number or name/i,
    });

    await user.type(input, "12951");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    await user.click(await screen.findByRole("button", { name: /mumbai rajdhani/i }));
    expect(await screen.findByText(/upstream unavailable/i)).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "zzzz");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });

    expect(await screen.findByText(/no matching trains found/i)).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("keeps journey scroll-margin clear of the sticky header", async () => {
    window.history.pushState(null, "", "/?train=12951");
    render(<App />);
    expect(await screen.findByRole("button", { name: /search again/i })).toBeInTheDocument();

    const journey = document.getElementById("journey");
    expect(journey).toBeTruthy();
    const scrollMargin = Number.parseFloat(
      getComputedStyle(journey).scrollMarginTop || "0"
    );
    expect(scrollMargin).toBeGreaterThanOrEqual(64);

    const again = screen.getByRole("button", { name: /search again/i });
    again.focus();
    expect(again).toHaveFocus();
  });

  it("hides dangling blank route arrows when endpoints are missing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setApiHandlers({
      search: async () =>
        jsonResponse({
          success: true,
          data: [
            {
              number: "12951",
              name: "Mumbai Rajdhani",
              source: "",
              destination: "",
            },
          ],
        }),
    });
    render(<App />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(
      screen.getByRole("textbox", { name: /search trains by number or name/i }),
      "12951"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    const result = await screen.findByRole("button", { name: /mumbai rajdhani/i });
    const details = within(result).getByText(/12951/);
    expect(details.textContent).toBe("12951");
    expect(details.textContent).not.toContain("→");
  });
});
