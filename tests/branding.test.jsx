import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/main.jsx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  })),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("RailDisha user-facing branding", () => {
  it("renders the RailDisha wordmark, Hindi tagline, and omits GatiPath brand text", () => {
    render(<App />);

    const home = screen.getByRole("button", { name: /raildisha home/i });
    expect(home).toBeInTheDocument();
    expect(home.textContent).toContain("RailDisha");
    expect(home.textContent).toContain("आपको मिलेगी सही दिशा");
    const tagline = home.querySelector(".brand-tagline");
    expect(tagline).toHaveAttribute("lang", "hi");
    expect(tagline).toHaveTextContent("आपको मिलेगी सही दिशा");
    expect(document.body.textContent).not.toMatch(/gati\s*path/i);
  });

  it("keeps journey scroll-margin at least as tall as the branded sticky header", async () => {
    const { localApi } = await import("../src/localApi.js");
    localApi.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          trainNumber: "12951",
          trainName: "Mumbai Rajdhani",
          status: "running",
          route: [
            {
              stationName: "Mumbai Central",
              stationCode: "MMCT",
              sequence: 1,
              scheduledDeparture: "2026-10-31T08:00:00+05:30",
            },
          ],
          train: {
            number: "12951",
            name: "Mumbai Rajdhani",
            type: "Rajdhani",
            source: { name: "Mumbai Central" },
            destination: { name: "New Delhi" },
          },
        },
      }),
    });

    window.history.pushState(null, "", "/?train=12951");
    render(<App />);
    expect(await screen.findByRole("button", { name: /search again/i })).toBeInTheDocument();
    const journey = document.getElementById("journey");
    const scrollMargin = Number.parseFloat(getComputedStyle(journey).scrollMarginTop || "0");
    expect(scrollMargin).toBeGreaterThanOrEqual(72);
  });

  it("renders RailDisha in the journey footer after a direct train load URL", async () => {
    const { localApi } = await import("../src/localApi.js");
    localApi.mockImplementation(async (url) => {
      if (String(url).includes("/api/train/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              trainNumber: "12951",
              trainName: "Mumbai Rajdhani",
              status: "running",
              delayMinutes: 0,
              currentLocation: {
                stationName: "Ratlam",
                stationCode: "RTM",
                sequence: 2,
              },
              train: {
                number: "12951",
                name: "Mumbai Rajdhani",
                type: "Rajdhani",
                source: { name: "Mumbai Central" },
                destination: { name: "New Delhi" },
              },
              route: [
                {
                  stationName: "Mumbai Central",
                  stationCode: "MMCT",
                  sequence: 1,
                  status: "departed",
                  scheduledDeparture: "2026-10-31T08:00:00+05:30",
                },
                {
                  stationName: "Ratlam",
                  stationCode: "RTM",
                  sequence: 2,
                  status: "arrived",
                  scheduledArrival: "2026-10-31T09:15:00+05:30",
                  scheduledDeparture: "2026-10-31T09:25:00+05:30",
                },
              ],
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      };
    });

    window.history.pushState(null, "", "/?train=12951");
    render(<App />);

    expect(await screen.findByText("RailDisha")).toBeInTheDocument();
    expect(screen.queryByText(/gatipath/i)).not.toBeInTheDocument();
  });

  it("uses RailDisha in the HTML document title", () => {
    const html = readFileSync(resolve("index.html"), "utf8");
    expect(html).toMatch(/<title>RailDisha — Know where your train is\.<\/title>/);
    expect(html).not.toMatch(/Gatipath|GatiPath|Gati Path/i);
  });

  it("documents the purchased domain without inventing deployment wiring", () => {
    const readme = readFileSync(resolve("README.md"), "utf8");
    expect(readme).toMatch(/^# RailDisha/m);
    expect(readme).toContain("https://raildisha.com");
    expect(readme).not.toMatch(/Gatipath is a one-page/i);
    expect(readme).toMatch(/GATIPATH_MOCK/);
  });
});
