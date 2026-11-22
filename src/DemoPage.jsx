import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { SiteNav } from "./SiteNav.jsx";
import { applyDocumentMeta } from "./seo.js";
import {
  formatDelay,
  formatRouteEndpoints,
  mapLiveTrain,
  trainHeading,
} from "./trainUtils.js";
import { DemoPnrPanel } from "./DemoPnrPanel.jsx";
import {
  DEMO_BADGE,
  DEMO_NOTICE,
  DEMO_SAMPLE_DATE_LABEL,
  DEMO_TRAIN_SCENARIOS,
  DEMO_UNKNOWN_INPUT_MESSAGE,
  getDemoMeta,
  getDemoTrainPayload,
  listDemoTrainDirectory,
  parseDemoMode,
} from "./demoData.js";

function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <strong>{DEMO_BADGE}</strong>
      <span>{DEMO_NOTICE}</span>
    </div>
  );
}

function DemoBadge() {
  return <span className="demo-result-badge">{DEMO_BADGE}</span>;
}

export function DemoPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const modeFromQuery = parseDemoMode(searchParams.get("mode"));
  const [mode, setMode] = useState(modeFromQuery);
  const [query, setQuery] = useState("");
  const [trainError, setTrainError] = useState("");
  const [active, setActive] = useState(null);
  const [boarding, setBoarding] = useState("");

  useEffect(() => {
    applyDocumentMeta(getDemoMeta());
  }, []);

  useEffect(() => {
    setMode(parseDemoMode(searchParams.get("mode") ?? location.state?.mode));
  }, [searchParams, location.state]);

  function switchMode(nextMode) {
    const safe = parseDemoMode(nextMode);
    setMode(safe);
    if (safe === "pnr") {
      resetTrain();
      navigate("/demo?mode=pnr", { replace: true });
      return;
    }
    navigate("/demo", { replace: true });
  }

  const directory = useMemo(() => listDemoTrainDirectory(query), [query]);

  function resetTrain() {
    setActive(null);
    setBoarding("");
    setTrainError("");
  }

  function selectTrainScenario(scenario) {
    setQuery(scenario.number);
    setTrainError("");
    const payload = getDemoTrainPayload(scenario.number);
    const mapped = mapLiveTrain(payload, {
      number: scenario.number,
      name: scenario.name,
    });
    setActive(mapped);
    setBoarding("");
  }

  function submitTrainSearch(event) {
    event.preventDefault();
    const number = String(query || "").replace(/\D/g, "").slice(0, 5);
    const payload = getDemoTrainPayload(number);
    if (!payload) {
      setActive(null);
      setTrainError(DEMO_UNKNOWN_INPUT_MESSAGE);
      return;
    }
    const scenario = DEMO_TRAIN_SCENARIOS.find((item) => item.number === number);
    setTrainError("");
    setActive(
      mapLiveTrain(payload, {
        number,
        name: scenario?.name || "Sample train",
      })
    );
    setBoarding("");
  }

  const statusText = useMemo(() => {
    if (!active) return "";
    if (active.state === "delayed") {
      return `Sample status · ${formatDelay(active.delay)}`;
    }
    if (active.state === "running") return "Sample status · Running on time";
    if (active.state === "scheduled") return "Sample status · Scheduled";
    if (active.state === "completed") return "Sample status · Completed";
    if (active.state === "cancelled") return "Sample status · Cancelled";
    return "Sample status";
  }, [active]);

  return (
    <div className="app demo-app">
      <SiteNav />
      <DemoBanner />

      <main className={`hero demo-hero ${active ? "demo-hero-compact" : ""}`}>
        <div className="eyebrow">RailDisha demo</div>
        <h1>
          Try sample
          <br />
          <em>journeys &amp; PNR.</em>
        </h1>
        <p className="sub">
          Choose a sample train or PNR to explore RailDisha. All results are
          examples, not live updates.
        </p>
        <p className="demo-date-label">{DEMO_SAMPLE_DATE_LABEL}</p>

        <div className="status-actions" role="group" aria-label="Demo modes">
          <button
            type="button"
            className={`status-action status-action-train ${mode === "train" ? "active" : ""}`}
            aria-pressed={mode === "train"}
            onClick={() => switchMode("train")}
          >
            <span className="status-action-label">Sample Train Status</span>
            <span className="status-action-note">Demo journeys</span>
          </button>
          <button
            type="button"
            className={`status-action status-action-pnr ${mode === "pnr" ? "active" : ""}`}
            aria-pressed={mode === "pnr"}
            onClick={() => switchMode("pnr")}
          >
            <span className="status-action-label">Sample PNR Status</span>
            <span className="status-action-note">Demo reservations</span>
          </button>
        </div>

        {mode === "train" ? (
          <div className="demo-panel">
            <div className="demo-chips" role="group" aria-label="Sample train scenarios">
              {DEMO_TRAIN_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className="demo-chip"
                  onClick={() => selectTrainScenario(scenario)}
                >
                  <strong>{scenario.chipLabel}</strong>
                  <span>
                    {scenario.number} · {scenario.name}
                  </span>
                </button>
              ))}
            </div>

            <form className="demo-form" onSubmit={submitTrainSearch}>
              <label htmlFor="demo-train-search" className="pnr-label">
                Sample train number or name
              </label>
              <div className="pnr-row">
                <input
                  id="demo-train-search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setTrainError("");
                  }}
                  placeholder="e.g. 19001"
                  aria-label="Sample train number or name"
                />
                <button type="submit" className="pnr-submit">
                  Show sample
                </button>
              </div>
            </form>

            {trainError && (
              <div className="search-status pnr-error" role="alert">
                {trainError}
              </div>
            )}

            {!active && directory.length > 0 && (
              <div className="results demo-results">
                {directory.map((train) => {
                  const route = formatRouteEndpoints(train.source, train.destination);
                  return (
                    <button
                      className="result"
                      key={train.number}
                      type="button"
                      onClick={() =>
                        selectTrainScenario(
                          DEMO_TRAIN_SCENARIOS.find((item) => item.number === train.number)
                        )
                      }
                    >
                      <span className="train-mark">↗</span>
                      <span>
                        <b>{train.name}</b>
                        <small>
                          {route ? `${train.number} · ${route}` : train.number} · sample
                        </small>
                      </span>
                      <span className="arrow">→</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
        <DemoPnrPanel hidden={mode !== "pnr"} />

        <p className="demo-home-link">
          <Link to="/">Back to RailDisha home</Link>
        </p>
      </main>

      {active && (
        <main id="journey" className="journey-page demo-journey">
          <section className="status-page">
            <button type="button" className="back" onClick={resetTrain}>
              ← Sample trains again
            </button>
            <DemoBadge />
            <div className="train-heading">
              <div>
                <div className="eyebrow">
                  {active.number} · {active.type} · SAMPLE
                </div>
                <h2>{trainHeading(active)}</h2>
                <p>
                  {active.from} <span>→</span> {active.to}
                </p>
                <p className="demo-date-label">{DEMO_SAMPLE_DATE_LABEL}</p>
              </div>
            </div>

            <div className={`status-card ${active.state} demo-status-card`}>
              <div className="status-main">
                <span className="demo-status-mark" aria-hidden="true">
                  ●
                </span>
                <div>
                  <small>SAMPLE TRAIN STATUS</small>
                  <h3>{statusText}</h3>
                </div>
              </div>
              {active.state === "running" && (
                <div className="status-detail">
                  <b>{active.current || "On sample route"}</b>
                  <span>
                    {formatDelay(active.delay)}
                    {active.next ? ` · Next sample halt: ${active.next}` : ""}
                  </span>
                </div>
              )}
              {active.state === "delayed" && (
                <div className="status-detail">
                  <b>{formatDelay(active.delay)}</b>
                  <span>{active.current || "Sample delayed position"}</span>
                </div>
              )}
            </div>

            <div className="boarding">
              <div>
                <b>Highlight a sample boarding station</b>
                <small>Does not change the sample timetable</small>
              </div>
              <select
                value={boarding}
                onChange={(event) => setBoarding(event.target.value)}
                aria-label="Sample boarding station"
              >
                <option value="">Select a station</option>
                {active.stations.map((station) => (
                  <option key={`${station.sequence}-${station.code}`} value={station.name}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="timeline-head">
              <div>
                <span className="eyebrow">SAMPLE JOURNEY</span>
                <h3>
                  {active.totalStations} stations
                  {active.stationsRemaining !== null && (
                    <span> · {active.stationsRemaining} remaining (sample)</span>
                  )}
                </h3>
              </div>
            </div>

            <div className="timeline">
              {active.stations.map((station, index) => {
                const state = station.state.toLowerCase();
                const isCurrent = state === "current";
                const isBoard = station.name === boarding;
                const previousDay =
                  index > 0 ? active.stations[index - 1].dayNumber : station.dayNumber;
                const showDay = index > 0 && station.dayNumber !== previousDay;

                return (
                  <React.Fragment key={`${station.sequence}-${station.code}`}>
                    {showDay && (
                      <div className="day-divider">
                        <span>DAY {station.dayNumber}</span>
                      </div>
                    )}
                    <div
                      className={`station ${isCurrent ? "current " : ""}${
                        isBoard ? "boarding-station " : ""
                      }${state === "completed" ? "completed " : ""}`}
                    >
                      <div className="rail">
                        <span className="node">
                          {isCurrent
                            ? "🚆"
                            : state === "completed"
                              ? "✓"
                              : index === 0 || index === active.stations.length - 1
                                ? "●"
                                : ""}
                        </span>
                      </div>
                      <div className="station-content">
                        <div className="station-name">
                          {station.name}
                          <span className="station-status">
                            {isBoard
                              ? "YOUR SAMPLE STATION"
                              : isCurrent
                                ? "SAMPLE POSITION"
                                : state === "completed"
                                  ? "DEPARTED (SAMPLE)"
                                  : station.state}
                            {(isCurrent || state === "completed") && station.delay > 0
                              ? ` · ${formatDelay(station.delay)}`
                              : ""}
                          </span>
                        </div>
                        <div className="station-times">
                          <div className="time-column">
                            <small>ARRIVAL</small>
                            <strong>{station.arrival || "—"}</strong>
                            {station.actualArrival && station.actualArrival !== "—" && (
                              <span>Sample actual {station.actualArrival}</span>
                            )}
                          </div>
                          <div className="time-column">
                            <small>DEPARTURE</small>
                            <strong>{station.departure || "—"}</strong>
                            {station.actualDeparture && station.actualDeparture !== "—" && (
                              <span>Sample actual {station.actualDeparture}</span>
                            )}
                          </div>
                          {station.platform && (
                            <div className="time-column platform-column">
                              <small>PLATFORM</small>
                              <strong>{station.platform}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <footer>
              <span>RailDisha Demo</span>
              <span>Sample data only</span>
            </footer>
          </section>
        </main>
      )}
    </div>
  );
}
