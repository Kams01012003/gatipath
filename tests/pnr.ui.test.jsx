import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function reviewsFixture() {
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

function pnrErrorResponse(status, error) {
  return jsonResponse({ success: false, error }, status);
}

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

  it("validates empty and short PNRs client-side without calling localApi", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pnr status/i }));
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText(/enter a valid 10-digit pnr/i)).toBeInTheDocument();
    expect(
      localApiState.calls.some(({ url }) => String(url).includes("/api/pnr"))
    ).toBe(false);

    await user.type(screen.getByLabelText(/10-digit pnr/i), "12345");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText(/enter a valid 10-digit pnr/i)).toBeInTheDocument();
    expect(
      localApiState.calls.some(({ url }) => String(url).includes("/api/pnr"))
    ).toBe(false);
  });

  it("shows mocked multi-passenger CNF/RAC/WL details and restores train search mode", async () => {
    localApiState.handler = async (url, options = {}) => {
      if (String(url).startsWith("/api/pnr")) {
        const body = JSON.parse(options.body || "{}");
        expect(body).toEqual({ pnr: expect.stringMatching(/^\d{10}$/) });
        expect(Object.keys(body)).toEqual(["pnr"]);
        expect(options.method).toBe("POST");
        expect(options.headers["Content-Type"]).toBe("application/json");
        expect(options.headers["Cache-Control"]).toBe("no-store");
        expect(JSON.stringify(options)).not.toMatch(/RAILRADAR|Bearer|api[_-]?key/i);
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
            charting: {
              isPrepared: false,
              status: "Chart Not Prepared",
              chartUrl: null,
            },
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
              {
                passengerNumber: 2,
                bookingStatus: "RAC/3/GN",
                currentStatus: "RAC",
                coach: "B5",
                berthNumber: "9",
                berthCode: "SU",
                isConfirmed: false,
                isRAC: true,
                isWaitlisted: false,
                isCancelled: false,
              },
              {
                passengerNumber: 3,
                bookingStatus: "WL/21/GN",
                currentStatus: "WL",
                coach: null,
                berthNumber: null,
                berthCode: null,
                isConfirmed: false,
                isRAC: false,
                isWaitlisted: true,
                isCancelled: false,
              },
            ],
            checkedAt: "2026-11-02T14:02:30+05:30",
          },
          sourceNote: "Reservation details are provided for convenience and may change.",
        });
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
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
    expect(screen.getByText(/2026-08-20 · 3A · GN/i)).toBeInTheDocument();
    expect(screen.getByText(/New Delhi → Mumbai Central/i)).toBeInTheDocument();
    expect(screen.getByText(/Chart Not Prepared/i)).toBeInTheDocument();

    expect(screen.getByText(/Passenger 1/i)).toBeInTheDocument();
    expect(screen.getByText(/^CNF$/i)).toBeInTheDocument();
    expect(screen.getByText(/Booking: WL\/14\/GN · Coach B4 · Berth 58 \(LB\)/i)).toBeInTheDocument();

    expect(screen.getByText(/Passenger 2/i)).toBeInTheDocument();
    expect(screen.getByText(/^RAC$/i)).toBeInTheDocument();
    expect(screen.getByText(/Booking: RAC\/3\/GN · Coach B5 · Berth 9 \(SU\)/i)).toBeInTheDocument();

    expect(screen.getByText(/Passenger 3/i)).toBeInTheDocument();
    expect(screen.getByText(/^WL$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Booking: WL\/21\/GN$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Coach null|Berth null/i)).not.toBeInTheDocument();

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

  it("renders missing optional train/coach/berth fields without fabricating values", async () => {
    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/pnr")) {
        return jsonResponse({
          success: true,
          data: {
            pnrNumber: "1234567890",
            train: {
              number: null,
              name: null,
              source: null,
              destination: null,
              boardingPoint: null,
              reservationUpto: null,
            },
            journey: { date: null, class: null, quota: null },
            charting: { isPrepared: false, status: null, chartUrl: null },
            passengers: [
              {
                passengerNumber: 1,
                bookingStatus: null,
                currentStatus: null,
                coach: null,
                berthNumber: null,
                berthCode: null,
                isConfirmed: false,
                isRAC: false,
                isWaitlisted: false,
                isCancelled: false,
              },
            ],
            checkedAt: null,
          },
        });
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
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

    expect(await screen.findByText(/Train details unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Route details unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Chart status unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/^Booking: —$/i)).toBeInTheDocument();
    const passengerStatus = screen.getByText(/Passenger 1/i).parentElement;
    expect(passengerStatus).toHaveTextContent(/Status unavailable/i);
    expect(screen.queryByText(/Coach/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Berth/i)).not.toBeInTheDocument();
  });

  it("shows loading, then maps 404/429/auth fixture errors", async () => {
    let resolvePnr;
    const deferred = new Promise((resolve) => {
      resolvePnr = resolve;
    });
    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/pnr")) {
        await deferred;
        return pnrErrorResponse(404, "No reservation record was found for that PNR.");
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
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

    expect(await screen.findByText(/Checking reservation status/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Checking/i })).toBeDisabled();

    await act(async () => {
      resolvePnr();
    });
    expect(
      await screen.findByText(/No reservation record was found for that PNR/i)
    ).toBeInTheDocument();

    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/pnr")) {
        return pnrErrorResponse(
          429,
          "PNR status is temporarily unavailable because the data provider has reached its request limit. Please try again later."
        );
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
      throw new Error(`Unhandled ${url}`);
    };
    await user.clear(screen.getByLabelText(/10-digit pnr/i));
    await user.type(screen.getByLabelText(/10-digit pnr/i), "1234567891");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText(/request limit/i)).toBeInTheDocument();

    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/pnr")) {
        return pnrErrorResponse(
          503,
          "PNR status is temporarily unavailable. Please try again later."
        );
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
      throw new Error(`Unhandled ${url}`);
    };
    await user.clear(screen.getByLabelText(/10-digit pnr/i));
    await user.type(screen.getByLabelText(/10-digit pnr/i), "1234567892");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(
      await screen.findByText(/PNR status is temporarily unavailable\. Please try again later\./i)
    ).toBeInTheDocument();
  });

  it("ignores stale responses after duplicate submit and mode switch cancellation", async () => {
    const resolvers = [];
    localApiState.handler = async (url, options = {}) => {
      if (String(url).startsWith("/api/pnr")) {
        const body = JSON.parse(options.body || "{}");
        await new Promise((resolve) => {
          resolvers.push({ resolve, pnr: body.pnr });
        });
        return jsonResponse({
          success: true,
          data: {
            pnrNumber: body.pnr,
            train: {
              number: body.pnr === "1111111111" ? "00001" : "99999",
              name: body.pnr === "1111111111" ? "STALE EXPRESS" : "FRESH EXPRESS",
              source: { code: "AAA", name: "Alpha" },
              destination: { code: "BBB", name: "Beta" },
              boardingPoint: { code: "AAA", name: "Alpha" },
              reservationUpto: { code: "BBB", name: "Beta" },
            },
            journey: { date: "2026-08-20", class: "SL", quota: "GN" },
            charting: { isPrepared: true, status: "Chart Prepared", chartUrl: null },
            passengers: [
              {
                passengerNumber: 1,
                bookingStatus: "CNF",
                currentStatus: "CNF",
                coach: "S1",
                berthNumber: "1",
                berthCode: "LB",
                isConfirmed: true,
                isRAC: false,
                isWaitlisted: false,
                isCancelled: false,
              },
            ],
            checkedAt: "2026-11-02T14:02:30+05:30",
          },
        });
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
      throw new Error(`Unhandled ${url}`);
    };

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /pnr status/i }));
    const pnrInput = screen.getByLabelText(/10-digit pnr/i);
    await user.type(pnrInput, "1111111111");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    await waitFor(() => expect(resolvers.length).toBe(1));
    expect(screen.getByRole("button", { name: /Checking/i })).toBeDisabled();

    // Submit button is disabled while loading; form submit still exercises request-id cancellation.
    await user.clear(pnrInput);
    await user.type(pnrInput, "2222222222");
    await act(async () => {
      fireEvent.submit(pnrInput.closest("form"));
    });
    await waitFor(() => expect(resolvers.length).toBe(2));

    await act(async () => {
      resolvers[1].resolve();
    });
    expect(await screen.findByText(/FRESH EXPRESS/i)).toBeInTheDocument();
    expect(screen.queryByText(/STALE EXPRESS/i)).not.toBeInTheDocument();

    await act(async () => {
      resolvers[0].resolve();
    });
    expect(screen.getByText(/FRESH EXPRESS/i)).toBeInTheDocument();
    expect(screen.queryByText(/STALE EXPRESS/i)).not.toBeInTheDocument();

    let third;
    const thirdDeferred = new Promise((resolve) => {
      third = resolve;
    });
    localApiState.handler = async (url) => {
      if (String(url).startsWith("/api/pnr")) {
        await thirdDeferred;
        return jsonResponse({
          success: true,
          data: {
            pnrNumber: "3333333333",
            train: { number: "33333", name: "CANCELLED LOOKUP" },
            journey: { date: "2026-08-20", class: "SL", quota: "GN" },
            charting: { isPrepared: false, status: "Chart Not Prepared" },
            passengers: [],
            checkedAt: "2026-11-02T14:02:30+05:30",
          },
        });
      }
      if (String(url).startsWith("/api/reviews")) return reviewsFixture();
      throw new Error(`Unhandled ${url}`);
    };

    await user.clear(screen.getByLabelText(/10-digit pnr/i));
    await user.type(screen.getByLabelText(/10-digit pnr/i), "3333333333");
    await user.click(screen.getByRole("button", { name: /check status/i }));
    expect(await screen.findByText(/Checking reservation status/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /train status/i }));
    expect(
      screen.getByRole("textbox", { name: /search trains by number or name/i })
    ).toBeInTheDocument();

    await act(async () => {
      third();
    });
    expect(screen.queryByText(/CANCELLED LOOKUP/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/10-digit pnr/i)).not.toBeInTheDocument();
  });
});
