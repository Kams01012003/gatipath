import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/main.jsx";
import { readFileSync, existsSync } from "node:fs";
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
  it("renders the logo image home control without duplicate Hindi tagline text", () => {
    render(<App />);

    const home = screen.getByRole("button", { name: /raildisha home/i });
    expect(home).toBeInTheDocument();
    const logo = home.querySelector("img.brand-logo");
    expect(logo).toBeTruthy();
    expect(logo.getAttribute("src")).toBe("/raildisha-logo.png");
    expect(logo.getAttribute("alt")).toBe("");
    expect(home.querySelector(".brand-tagline")).toBeNull();
    expect(document.body.textContent).not.toMatch(/gati\s*path/i);
    // Tagline lives in the logo artwork; do not duplicate as visible HTML text.
    expect(document.body.textContent).not.toContain("आपको मिलेगी सही दिशा");
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
    expect(screen.getByText("RailDisha")).toBeInTheDocument();
    const journey = document.getElementById("journey");
    const scrollMargin = Number.parseFloat(getComputedStyle(journey).scrollMarginTop || "0");
    expect(scrollMargin).toBeGreaterThanOrEqual(72);
  });

  it("uses RailDisha in the HTML document title", () => {
    const html = readFileSync(resolve("index.html"), "utf8");
    expect(html).toMatch(/<title>RailDisha — Know where your train is\.<\/title>/);
    expect(html).not.toMatch(/Gatipath|GatiPath|Gati Path/i);
  });

  it("ships logo assets and documents the purchased domain", () => {
    expect(existsSync(resolve("public/raildisha-logo.png"))).toBe(true);
    expect(existsSync(resolve("public/raildisha-logo-source.png"))).toBe(true);
    const readme = readFileSync(resolve("README.md"), "utf8");
    expect(readme).toMatch(/^# RailDisha/m);
    expect(readme).toContain("https://raildisha.com");
    expect(readme).toMatch(/GATIPATH_MOCK/);
  });
});
