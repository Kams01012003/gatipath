import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DemoPage } from "../src/DemoPage.jsx";
import { DEMO_BADGE, DEMO_UNKNOWN_INPUT_MESSAGE } from "../src/demoData.js";

const localApiState = { calls: [] };

vi.mock("../src/localApi.js", () => ({
  localApi: vi.fn(async (url) => {
    localApiState.calls.push(url);
    throw new Error(`Demo must not call localApi: ${url}`);
  }),
}));

afterEach(() => {
  cleanup();
  localApiState.calls = [];
});

beforeEach(() => {
  window.history.replaceState(null, "", "/demo");
});

function renderDemo(entry = "/demo") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Demo page (browser fixtures only)", () => {
  it("shows persistent DEMO notice and sample train on-time journey without API calls", async () => {
    renderDemo();
    expect(screen.getAllByText(DEMO_BADGE).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/explore sample journeys and pnr results/i)
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /on-time sample/i }));

    expect(
      await screen.findByRole("heading", { name: /sample himalayan express/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/sample status · running on time/i)).toBeInTheDocument();
    expect(screen.getByText(/sample position/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Barog/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/updated now|live status available/i)).not.toBeInTheDocument();
    expect(localApiState.calls).toEqual([]);
  });

  it("shows delayed sample with coherent 40-minute late times", async () => {
    renderDemo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delayed sample/i }));
    expect(
      await screen.findByRole("heading", { name: /sample deccan mail/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/sample status · 40 min late/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Pune Junction/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/11:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample actual 11:40/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sample actual 02:35/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Choose a sample train or PNR to explore RailDisha/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/fixtures|Browser-only/i)).not.toBeInTheDocument();
    expect(localApiState.calls).toEqual([]);
  });

  it("rejects unknown train numbers without fabricating a journey", async () => {
    renderDemo();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/sample train number or name/i), "99999");
    await user.click(screen.getByRole("button", { name: /^show sample$/i }));
    expect(await screen.findByText(DEMO_UNKNOWN_INPUT_MESSAGE)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /sample himalayan express/i })
    ).not.toBeInTheDocument();
    expect(document.getElementById("journey")).toBeNull();
    expect(localApiState.calls).toEqual([]);
  });

  it("shows CNF/RAC/WL/mixed sample PNR results with coach/berth where appropriate", async () => {
    renderDemo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /sample pnr status/i }));

    await user.click(screen.getByRole("button", { name: /confirmed \(cnf\)/i }));
    const confirmed = await screen.findByRole("list");
    expect(within(confirmed).getAllByText(/^CNF$/i).length).toBeGreaterThan(0);
    expect(within(confirmed).getByText(/Coach C1 · Berth 12 \(WS\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /rac sample/i }));
    const rac = await screen.findByRole("list");
    expect(within(rac).getByText(/^RAC$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /waitlisted \(wl\)/i }));
    const wl = await screen.findByRole("list");
    expect(within(wl).getByText(/^WL$/i)).toBeInTheDocument();
    expect(within(wl).queryByText(/Coach/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mixed passengers/i }));
    const mixed = await screen.findByRole("list");
    expect(within(mixed).getByText(/Passenger 3/i)).toBeInTheDocument();
    expect(within(mixed).getByText(/^CNF$/i)).toBeInTheDocument();
    expect(within(mixed).getByText(/^RAC$/i)).toBeInTheDocument();
    expect(within(mixed).getByText(/^WL$/i)).toBeInTheDocument();
    expect(localApiState.calls).toEqual([]);
  });

  it("rejects unknown PNR input with the sample-numbers message", async () => {
    renderDemo();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /sample pnr status/i }));
    await user.type(screen.getByLabelText(/sample 10-digit pnr/i), "5555555555");
    await user.click(screen.getByRole("button", { name: /^show sample$/i }));
    expect(await screen.findByText(DEMO_UNKNOWN_INPUT_MESSAGE)).toBeInTheDocument();
    expect(localApiState.calls).toEqual([]);
  });

  it("opens PNR mode immediately from /demo?mode=pnr (refresh-safe)", async () => {
    renderDemo("/demo?mode=pnr");
    expect(
      screen.getByRole("button", { name: /sample pnr status/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByLabelText(/sample 10-digit pnr/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/sample train number or name/i)
    ).not.toBeInTheDocument();
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://raildisha.com/demo"
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex,nofollow"
    );
    expect(localApiState.calls).toEqual([]);
  });

  it("defaults /demo and unknown mode values to train", async () => {
    renderDemo("/demo?mode=evil");
    expect(
      screen.getByRole("button", { name: /sample train status/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByLabelText(/sample train number or name/i)
    ).toBeInTheDocument();
    expect(localApiState.calls).toEqual([]);
  });
});
