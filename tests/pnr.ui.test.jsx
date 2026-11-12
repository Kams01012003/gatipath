import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../src/main.jsx";
import { jsonResponse } from "./helpers/offlineFetch.js";

const localApiState = {
  handler: null,
  calls: [],
};

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async (url, options) => {
    localApiState.calls.push({ url, options });
    if (localApiState.handler) return localApiState.handler(url, options);
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

describe("inline PNR status UI", () => {
  it("switches to an inline PNR form without redirecting or calling the API", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    const pnrButton = screen.getByRole("button", { name: /pnr status/i });
    expect(pnrButton.tagName).toBe("BUTTON");
    expect(pnrButton).not.toHaveAttribute("href");

    await user.click(pnrButton);
    expect(screen.getByLabelText(/10-digit pnr/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check status/i })).toBeInTheDocument();
    expect(
      localApiState.calls.some(({ url }) => String(url).includes("/api/pnr"))
    ).toBe(false);
  });

  it("validates short PNRs client-side without calling localApi", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pnr status/i }));
    await user.type(screen.getByLabelText(/10-digit pnr/i), "12345");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText(/enter a valid 10-digit pnr/i)).toBeInTheDocument();
    expect(
      localApiState.calls.some(({ url }) => String(url).includes("/api/pnr"))
    ).toBe(false);
  });

  it("shows mocked PNR results inline and restores train search mode", async () => {
    localApiState.handler = async (url, options = {}) => {
      if (String(url).startsWith("/api/pnr")) {
        const body = JSON.parse(options.body || "{}");
        expect(body.pnr).toMatch(/^\d{10}$/);
        return jsonResponse({
          success: true,
          data: {
            pnrNumber: body.pnr,
            train: {
              number: "12952",
              name: "MUMBAI RAJDHANI",
              source: { code: "NDLS", name: "New Delhi" },
              destination: { code: "MMCT", name: "Mumbai Central" },
              boardingPoint: { code: "NDLS", name: "New Delhi" },
              reservationUpto: { code: "MMCT", name: "Mumbai Central" },
            },
            journey: { date: "2026-08-20", class: "3A", quota: "GN" },
            charting: { isPrepared: false, status: "Chart Not Prepared", chartUrl: null },
            passengers: [
              {
                passengerNumber: 1,
                bookingStatus: "WL/14/GN",
                currentStatus: "CNF",
                coach: "B4",
                berthNumber: "58",
                berthCode: "LB",
                isConfirmed: true,
                isRAC: false,
                isWaitlisted: false,
                isCancelled: false,
              },
            ],
            checkedAt: "2026-11-02T14:02:30+05:30",
          },
          sourceNote: "Reservation details are provided for convenience and may change.",
        });
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
      throw new Error(`Unhandled ${url}`);
    };

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pnr status/i }));
    await user.type(screen.getByLabelText(/10-digit pnr/i), "1234567890");
    await user.click(screen.getByRole("button", { name: /check status/i }));

    expect(await screen.findByText(/mumbai rajdhani/i)).toBeInTheDocument();
    expect(screen.getByText(/passenger 1/i)).toBeInTheDocument();
    expect(screen.getByText(/^cnf$/i)).toBeInTheDocument();
    expect(screen.getByText(/coach b4/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /optional official confirmation/i })
    ).toHaveAttribute(
      "href",
      "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en3"
    );

    await user.click(screen.getByRole("button", { name: /train status/i }));
    expect(
      screen.getByRole("textbox", { name: /search trains by number or name/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/10-digit pnr/i)).not.toBeInTheDocument();
  });
});
