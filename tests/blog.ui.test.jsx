import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { App, HomePage } from "../src/main.jsx";
import { BlogArticlePage, BlogIndexPage } from "../src/BlogPages.jsx";
import { jsonResponse } from "./helpers/offlineFetch.js";

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async (url) => {
    if (String(url).startsWith("/api/capabilities")) {
      return jsonResponse({ liveEnabled: false });
    }
    if (String(url).startsWith("/api/reviews")) {
      return jsonResponse({
        success: true,
        storageConfigured: true,
        submissionEnabled: true,
        message: "",
        average: null,
        count: 0,
        reviews: [],
      });
    }
    return jsonResponse({ success: true, data: [] });
  }),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("blog and homepage status actions UI", () => {
  it("exposes Blog nav, Try Demo, homepage preview cards and demo status links", async () => {
    render(<App />);
    expect(await screen.findByRole("link", { name: /^blog$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /try demo/i }).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: /guides for clearer train travel/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /how to check live train running status/i })
    ).toBeInTheDocument();

    expect(await screen.findByText(/live lookups are paused/i)).toBeInTheDocument();
    const pnr = screen.getByRole("link", { name: /pnr status\s*open sample pnr demo/i });
    expect(pnr).toHaveAttribute("href", "/demo?mode=pnr");
    const trainStatus = screen.getByRole("link", {
      name: /train status\s*open sample train demo/i,
    });
    expect(trainStatus).toHaveAttribute("href", "/demo");
  });

  it("does not call search or pnr APIs from the paused homepage", async () => {
    const { localApi } = await import("../src/localApi.js");
    localApi.mockClear();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/live lookups are paused/i)).toBeInTheDocument();
    const user = userEvent.setup();
    const cta = screen.getAllByRole("link", { name: /try demo/i }).find((el) =>
      el.classList.contains("demo-cta-button")
    );
    await user.click(cta);
    expect(
      localApi.mock.calls.some(([url]) => String(url).includes("/api/search"))
    ).toBe(false);
    expect(
      localApi.mock.calls.some(([url]) => String(url).includes("/api/pnr"))
    ).toBe(false);
    expect(
      localApi.mock.calls.every(
        ([url]) =>
          String(url).startsWith("/api/capabilities") ||
          String(url).startsWith("/api/reviews")
      )
    ).toBe(true);
  });

  it("renders blog index and article routes without visible dates", async () => {
    render(
      <MemoryRouter initialEntries={["/blog"]}>
        <Routes>
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogArticlePage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: /train travel guides/i })
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
    );

    cleanup();
    render(
      <MemoryRouter
        initialEntries={["/blog/how-to-check-live-train-running-status"]}
      >
        <Routes>
          <Route path="/blog/:slug" element={<BlogArticlePage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(
      await screen.findByRole("heading", {
        name: /how to check live train running status in india/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to blog/i })).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /enquiry\.indianrail\.gov\.in/i,
      })
    ).toHaveAttribute("href", "https://enquiry.indianrail.gov.in/");
  });
});
