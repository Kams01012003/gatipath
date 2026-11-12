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
  it("exposes Blog nav, homepage preview cards and status action buttons", async () => {
    render(<App />);
    expect(screen.getByRole("link", { name: /^blog$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /guides for clearer train travel/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /how to check live train running status/i })
    ).toBeInTheDocument();

    const pnr = screen.getByRole("button", {
      name: /pnr status\s*check on raildisha/i,
    });
    expect(pnr).not.toHaveAttribute("href");

    const trainStatus = screen.getByRole("button", {
      name: /train status\s*use search below/i,
    });
    expect(trainStatus).toBeInTheDocument();
  });

  it("focuses the train search from Train Status without calling localApi search", async () => {
    const { localApi } = await import("../src/localApi.js");
    localApi.mockClear();
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pnr status/i }));
    expect(screen.getByLabelText(/10-digit pnr/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /train status\s*use search below/i })
    );
    const input = screen.getByRole("textbox", {
      name: /search trains by number or name/i,
    });
    expect(document.activeElement).toBe(input);
    expect(
      localApi.mock.calls.some(([url]) => String(url).includes("/api/search"))
    ).toBe(false);
    expect(
      localApi.mock.calls.some(([url]) => String(url).includes("/api/pnr"))
    ).toBe(false);
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
