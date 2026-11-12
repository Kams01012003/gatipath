import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { localApi } from "./localApi.js";
import { ReviewsSection } from "./ReviewsSection.jsx";
import { BlogPreview } from "./BlogPreview.jsx";
import { BlogArticlePage, BlogIndexPage } from "./BlogPages.jsx";
import { SiteNav } from "./SiteNav.jsx";
import { applyDocumentMeta } from "./seo.js";
import { getHomeMeta } from "./blogData.js";
import {
  formatDelay,
  formatRouteEndpoints,
  formatTime,
  mapLiveTrain,
  trainHeading,
} from "./trainUtils.js";
import {
  isExactTenDigitPnr,
  normalizePnrInput,
  OFFICIAL_PNR_CONFIRMATION_URL,
} from "./pnrUtils.js";
import "./styles.css";

function isAbortError(error) {
  return error?.name === "AbortError";
}

export function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [completedSearchQuery, setCompletedSearchQuery] = useState(null);
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(null);
  const [active, setActive] = useState(null);
  const [boarding, setBoarding] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const searchCacheRef = useRef(new Map());
  const skipSearchRef = useRef(null);
  const loadedTrainRef = useRef(null);
  const inFlightTrainRef = useRef(null);
  const loadAbortRef = useRef(null);
  const loadRequestRef = useRef(0);
  const scrollTimerRef = useRef(null);
  const searchAbortRef = useRef(null);
  const searchTimerRef = useRef(null);
  const searchRequestRef = useRef(0);
  const [listening, setListening] = useState(false);
  const [heroMode, setHeroMode] = useState("train");
  const [pnrInput, setPnrInput] = useState("");
  const [pnrLoading, setPnrLoading] = useState(false);
  const [pnrError, setPnrError] = useState("");
  const [pnrResult, setPnrResult] = useState(null);
  const [pnrSourceNote, setPnrSourceNote] = useState("");
  const searchInputRef = useRef(null);
  const pnrInputRef = useRef(null);
  const pnrAbortRef = useRef(null);
  const pnrRequestRef = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    applyDocumentMeta(getHomeMeta());
  }, []);

  function cancelPnrLookup() {
    pnrRequestRef.current += 1;
    if (pnrAbortRef.current) {
      pnrAbortRef.current.abort();
      pnrAbortRef.current = null;
    }
  }

  function clearPnrPanel() {
    cancelPnrLookup();
    setPnrLoading(false);
    setPnrError("");
    setPnrResult(null);
    setPnrSourceNote("");
  }

  function activateTrainMode(event) {
    event?.preventDefault?.();
    setHeroMode("train");
    clearPnrPanel();
  }

  function activatePnrMode(event) {
    event?.preventDefault?.();
    setHeroMode("pnr");
    // Mode change alone must not call the provider.
    cancelPnrLookup();
    setPnrLoading(false);
    setPnrError("");
    setPnrResult(null);
    setPnrSourceNote("");
  }

  useEffect(() => {
    if (heroMode === "train") {
      const input = searchInputRef.current || document.getElementById("train-search");
      if (!input) return;
      input.focus({ preventScroll: true });
      return;
    }
    const input = pnrInputRef.current || document.getElementById("pnr-input");
    if (!input) return;
    input.focus({ preventScroll: true });
  }, [heroMode]);

  async function submitPnr(event) {
    event.preventDefault();
    const pnr = normalizePnrInput(pnrInput);
    setPnrInput(pnr);
    setPnrError("");
    setPnrResult(null);
    setPnrSourceNote("");

    if (!isExactTenDigitPnr(pnr)) {
      setPnrError("Enter a valid 10-digit PNR.");
      return;
    }

    cancelPnrLookup();
    const requestId = pnrRequestRef.current + 1;
    pnrRequestRef.current = requestId;
    const controller = new AbortController();
    pnrAbortRef.current = controller;
    setPnrLoading(true);

    try {
      const response = await localApi("/api/pnr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ pnr }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (requestId !== pnrRequestRef.current) return;
      if (!response.ok || !body.success) {
        throw new Error(body.error || "PNR status is temporarily unavailable. Please try again later.");
      }
      setPnrResult(body.data || null);
      setPnrSourceNote(body.sourceNote || "");
    } catch (error) {
      if (requestId !== pnrRequestRef.current || isAbortError(error)) return;
      setPnrResult(null);
      setPnrError(error.message || "PNR status is temporarily unavailable. Please try again later.");
    } finally {
      if (requestId === pnrRequestRef.current) {
        setPnrLoading(false);
        pnrAbortRef.current = null;
      }
    }
  }

  const startVoiceSearch = () => {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("Voice search is not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    setListening(true);
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    setQuery(transcript);
  };

  recognition.onerror = () => {
    setListening(false);
  };

  recognition.onend = () => {
    setListening(false);
  };

  recognition.start();
};

  function cancelScheduledScroll() {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }

  function cancelTrainLoad() {
    loadRequestRef.current += 1;
    inFlightTrainRef.current = null;
    cancelScheduledScroll();
    if (loadAbortRef.current) {
      loadAbortRef.current.abort();
      loadAbortRef.current = null;
    }
  }

  function cancelTrainSearch() {
    searchRequestRef.current += 1;
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }

  function clearTrainSelection() {
    cancelTrainLoad();
    cancelTrainSearch();
    clearPnrPanel();
    skipSearchRef.current = null;
    loadedTrainRef.current = null;
    setSelected(null);
    setDirection(null);
    setActive(null);
    setQuery("");
    setBoarding("");
    setResults([]);
    setSearchError("");
    setCompletedSearchQuery(null);
    setLiveError("");
    setLoading(false);
    setSearching(false);
    setHeroMode("train");
    setPnrInput("");
  }

  useEffect(() => {
    const q = query.trim();

    if (skipSearchRef.current !== null && q === skipSearchRef.current) {
      return;
    }

    if (skipSearchRef.current !== null) {
      skipSearchRef.current = null;
    }

    if (q.length < 3 || active) {
      setResults([]);
      setSearchError("");
      setSearching(false);
      setCompletedSearchQuery(null);
      return;
    }

    const cacheKey = q.toLowerCase();
    const cached = searchCacheRef.current.get(cacheKey);

    if (cached) {
      setResults(cached);
      setSearchError("");
      setSearching(false);
      setCompletedSearchQuery(q);
      return;
    }

    const requestId = ++searchRequestRef.current;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(false);
    setSearchError("");
    setCompletedSearchQuery(null);

    const timer = setTimeout(async () => {
      if (requestId !== searchRequestRef.current) return;

      setSearching(true);
      setSearchError("");

      try {
        const response = await localApi(
          `/api/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );

        const body = await response.json();

        if (requestId !== searchRequestRef.current) return;

        if (!response.ok || !body.success) {
          throw new Error(body.error || "Search unavailable");
        }

        const data = body.data || [];

        searchCacheRef.current.set(cacheKey, data);
        if (requestId !== searchRequestRef.current) return;
        setResults(data);
        setCompletedSearchQuery(q);
      } catch (error) {
        if (requestId !== searchRequestRef.current) return;
        if (isAbortError(error)) return;
        setResults([]);
        setSearchError(error.message || "Search unavailable");
        setCompletedSearchQuery(q);
      } finally {
        if (requestId === searchRequestRef.current) {
          setSearching(false);
        }
      }
    }, 900);

    searchTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (searchTimerRef.current === timer) {
        searchTimerRef.current = null;
      }
      controller.abort();
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
      if (searchRequestRef.current === requestId) {
        searchRequestRef.current += 1;
      }
    };
  }, [query, active]);

  async function loadTrain(number, fallbackName = "") {
    cancelTrainLoad();

    const requestId = loadRequestRef.current;
    const trainNumber = String(number);
    if (loadedTrainRef.current !== trainNumber) {
      setActive(null);
      loadedTrainRef.current = null;
    }
    const controller = new AbortController();
    loadAbortRef.current = controller;
    inFlightTrainRef.current = trainNumber;

    setLoading(true);
    setLiveError("");

    try {
      const response = await localApi(`/api/train/${trainNumber}`, {
        signal: controller.signal,
      });
      const body = await response.json();
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok || !body.success) throw new Error(body.error || "Live status unavailable");
      const train = mapLiveTrain(body, {
        number: trainNumber,
        name: fallbackName,
      });
      if (!train) throw new Error("Live status unavailable");
      if (requestId !== loadRequestRef.current) return;

      setActive(train);
      loadedTrainRef.current = trainNumber;
      inFlightTrainRef.current = null;
      setBoarding("");
      scrollTimerRef.current = setTimeout(() => {
        if (requestId !== loadRequestRef.current) return;
        scrollTimerRef.current = null;
        document.getElementById("journey")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      if (isAbortError(error)) return;
      loadedTrainRef.current = null;
      inFlightTrainRef.current = null;
      setLiveError(error.message || "Live status unavailable");
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
        }
      }
    }
  }

  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const rawTrain = params.get("train");
      const trainParam = rawTrain?.trim() || "";

      if (!/^\d{5}$/.test(trainParam)) {
        if (rawTrain !== null) {
          const url = new URL(window.location.href);
          url.searchParams.delete("train");
          window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
        }
        clearTrainSelection();
        return;
      }

      if (loadedTrainRef.current === trainParam && inFlightTrainRef.current == null) {
        return;
      }

      if (inFlightTrainRef.current === trainParam) {
        return;
      }

      cancelTrainSearch();
      setResults([]);
      setSearchError("");
      setSearching(false);
      setCompletedSearchQuery(null);
      skipSearchRef.current = trainParam;
      setQuery(trainParam);
      loadTrain(trainParam);
    }

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      cancelTrainLoad();
      cancelTrainSearch();
    };
  }, []);

  function clearObsoleteSelectionState() {
    cancelTrainLoad();
    setSelected(null);
    setDirection(null);
    setLiveError("");
    setLoading(false);
    loadedTrainRef.current = null;
    const url = new URL(window.location.href);
    if (url.searchParams.has("train")) {
      url.searchParams.delete("train");
      window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
    }
  }

  function onQueryChange(value) {
    if (selected || liveError || loading || inFlightTrainRef.current) {
      clearObsoleteSelectionState();
    }
    setQuery(value);
  }

  function choose(t) {
    cancelTrainSearch();
    skipSearchRef.current = query.trim();
    setSelected(t);
    setDirection(null);
    setResults([]);
    setSearchError("");
    setSearching(false);
    setCompletedSearchQuery(null);
    setLiveError("");
    const url = new URL(window.location.href);
    url.searchParams.set("train", t.number);
    window.history.pushState(null, "", url.pathname + url.search);
    loadTrain(t.number, t.name);
  }

  function reset() {
    clearTrainSelection();
    const url = new URL(window.location.href);
    url.searchParams.delete("train");
    window.history.pushState(null, "", url.pathname + (url.search ? url.search : ""));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const statusText = useMemo(() => {
    if (!active) return "";
    if (active.state === "running") return "ON THE WAY";
    if (active.state === "delayed") return "DELAYED";
    if (active.state === "cancelled") return "CANCELLED";
    if (active.state === "completed") return "JOURNEY COMPLETE";
    return "SCHEDULED";
  }, [active]);

  const scheduledDeparture = active?.stations?.[0]?.time;
  const trimmedQuery = query.trim();
  const showEmptyResults =
    !searching &&
    !selected &&
    !loading &&
    !active &&
    !searchError &&
    results.length === 0 &&
    trimmedQuery.length >= 3 &&
    completedSearchQuery === trimmedQuery;

  return <div className="app">
    <SiteNav
      onHomeClick={(event) => {
        event.preventDefault();
        reset();
        navigate("/");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    />

    {!active ? <>
    <main className="hero">
      <div className="eyebrow">A clearer way to track Indian trains</div>
      <h1>Know where<br/><em>your train is.</em></h1>
      <p className="sub">Search by train name or number. Choose the journey. Follow every station.</p>

      <div className="status-actions" role="group" aria-label="Quick status checks">
        <button
          type="button"
          className={`status-action status-action-pnr ${heroMode === "pnr" ? "active" : ""}`}
          aria-pressed={heroMode === "pnr"}
          onClick={activatePnrMode}
        >
          <span className="status-action-label">PNR Status</span>
          <span className="status-action-note">Check on RailDisha</span>
        </button>
        <button
          type="button"
          className={`status-action status-action-train ${heroMode === "train" ? "active" : ""}`}
          aria-pressed={heroMode === "train"}
          onClick={activateTrainMode}
        >
          <span className="status-action-label">Train Status</span>
          <span className="status-action-note">Use search below</span>
        </button>
      </div>

      {heroMode === "train" ? (
        <>
          <div className="search-wrap">
            <div className="search-icon" aria-hidden="true">⌕</div>
            <label htmlFor="train-search" className="sr-only">Search trains by number or name</label>
            <input
              id="train-search"
              ref={searchInputRef}
              autoFocus
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="Train number or name"
              aria-label="Search trains by number or name"
            />
            <button
              type="button"
              className={`voice-button ${listening ? "listening" : ""}`}
              onClick={startVoiceSearch}
              aria-label="Search by voice"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <line x1="12" y1="19" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </button>
            {query && (
              <button className="clear" onClick={() => onQueryChange("")} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          {searching && <div className="search-status">Searching live train directory…</div>}
          {searchError && <div className="search-status">{searchError}</div>}
          {results.length > 0 && (
            <div className="results">
              {results.map((t) => {
                const route = formatRouteEndpoints(t.source, t.destination);
                return (
                  <button className="result" key={t.number} onClick={() => choose(t)}>
                    <span className="train-mark">↗</span>
                    <span>
                      <b>{t.name}</b>
                      <small>{route ? `${t.number} · ${route}` : t.number}</small>
                    </span>
                    <span className="arrow">→</span>
                  </button>
                );
              })}
            </div>
          )}
          {showEmptyResults && <div className="search-status">No matching trains found.</div>}
        </>
      ) : (
        <div className="pnr-panel">
          <form className="pnr-form" onSubmit={submitPnr} noValidate>
            <label htmlFor="pnr-input" className="pnr-label">
              10-digit PNR
            </label>
            <div className="pnr-row">
              <input
                id="pnr-input"
                ref={pnrInputRef}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                value={pnrInput}
                onChange={(event) => {
                  setPnrInput(normalizePnrInput(event.target.value));
                  setPnrError("");
                }}
                placeholder="Enter 10-digit PNR"
                aria-label="10-digit PNR"
              />
              <button type="submit" className="pnr-submit" disabled={pnrLoading}>
                {pnrLoading ? "Checking…" : "Check Status"}
              </button>
            </div>
          </form>
          {pnrLoading && (
            <div className="search-status" role="status">
              Checking reservation status…
            </div>
          )}
          {pnrError && (
            <div className="search-status pnr-error" role="alert">
              {pnrError}
            </div>
          )}
          {pnrResult && (
            <div className="pnr-result" aria-live="polite">
              <div className="pnr-result-head">
                <div>
                  <small>TRAIN</small>
                  <strong>
                    {[pnrResult.train?.number, pnrResult.train?.name].filter(Boolean).join(" · ") ||
                      "Train details unavailable"}
                  </strong>
                </div>
                <div>
                  <small>JOURNEY</small>
                  <strong>
                    {[pnrResult.journey?.date, pnrResult.journey?.class, pnrResult.journey?.quota]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </strong>
                </div>
              </div>
              <div className="pnr-route">
                {[
                  pnrResult.train?.boardingPoint?.name || pnrResult.train?.source?.name,
                  pnrResult.train?.reservationUpto?.name || pnrResult.train?.destination?.name,
                ]
                  .filter(Boolean)
                  .join(" → ") || "Route details unavailable"}
              </div>
              <div className="pnr-chart">
                <small>CHART</small>
                <strong>{pnrResult.charting?.status || "Chart status unavailable"}</strong>
              </div>
              <ul className="pnr-passengers">
                {(pnrResult.passengers || []).map((passenger) => (
                  <li key={passenger.passengerNumber}>
                    <div className="pnr-passenger-top">
                      <strong>Passenger {passenger.passengerNumber}</strong>
                      <span>{passenger.currentStatus || "Status unavailable"}</span>
                    </div>
                    <div className="pnr-passenger-meta">
                      Booking: {passenger.bookingStatus || "—"}
                      {passenger.coach ? ` · Coach ${passenger.coach}` : ""}
                      {passenger.berthNumber
                        ? ` · Berth ${passenger.berthNumber}${
                            passenger.berthCode ? ` (${passenger.berthCode})` : ""
                          }`
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
              {pnrResult.checkedAt && (
                <div className="pnr-checked">
                  Checked {new Date(pnrResult.checkedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </div>
              )}
              {pnrSourceNote && <p className="pnr-source-note">{pnrSourceNote}</p>}
              <a
                className="pnr-confirm-link"
                href={OFFICIAL_PNR_CONFIRMATION_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Optional official confirmation on Indian Railways
              </a>
            </div>
          )}
        </div>
      )}
    </main>
    <BlogPreview />
    <ReviewsSection />
    </> :
    <main id="journey" className="journey-page">
      <section className="status-page">
        <button type="button" className="back" onClick={reset}>← Search again</button>
        <div className="train-heading">
          <div>
            <div className="eyebrow">{active.number} · {active.type}</div>
            <h2>{trainHeading(active)}</h2>
            <p>{active.from} <span>→</span> {active.to}</p>
          </div>
          <button type="button" className="share" onClick={() => window.navigator.clipboard?.writeText(window.location.href)}>↗ Share</button>
        </div>

        <div className={`status-card ${active.state}`}>
          <div className="status-main">
            <span className="live-dot"></span>
            <div><small>TRAIN STATUS</small><h3>{statusText}</h3></div>
          </div>
          {active.state === "running" && <div className="status-detail"><b>{active.current || "On route"}</b><span>{formatDelay(active.delay)}{active.next ? ` · Next: ${active.next}` : ""}</span></div>}
          {active.state === "scheduled" && scheduledDeparture && scheduledDeparture !== "—" && <div className="status-detail"><b>{scheduledDeparture}</b><span>Scheduled departure from {active.from}</span></div>}
          {active.state === "delayed" && <div className="status-detail"><b>{formatDelay(active.delay)}</b><span>{active.current || "Live status available"}</span></div>}
          {active.state === "completed" && <div className="status-detail"><b>{active.to}</b><span>Journey completed</span></div>}
          {active.state === "cancelled" && <div className="status-detail"><b>Cancelled</b><span>Check railway advisories before travelling</span></div>}
        </div>

        <div className="boarding">
          <div><b>Where are you boarding?</b><small>Highlight your station on the journey</small></div>
          <select value={boarding} onChange={e => setBoarding(e.target.value)} aria-label="Boarding station">
            <option value="">Select a station</option>
            {active.stations.map(s => <option key={`${s.sequence}-${s.code}`} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div className="timeline-head">
          <div>
            <span className="eyebrow">THE JOURNEY</span>
            {active.hasSchedule ? (
              <h3>
                {active.totalStations} stations
                {active.stationsRemaining !== null && (
                  <span> · {active.stationsRemaining} remaining</span>
                )}
              </h3>
            ) : (
              <h3>Schedule unavailable</h3>
            )}
          </div>
        </div>
        {active.hasSchedule ? (
        <div className="timeline">
  {active.stations.map((s, i) => {
    const state = s.state.toLowerCase();
    const isCurrent = state === "current";
    const isBoard = s.name === boarding;
    const previousDay = i > 0 ? active.stations[i - 1].dayNumber : s.dayNumber;
    const showDay = i > 0 && s.dayNumber !== previousDay;

    return (
      <React.Fragment key={`${s.sequence}-${s.code}`}>
        {showDay && (
          <div className="day-divider">
            <span>DAY {s.dayNumber}</span>
          </div>
        )}

        <div
          className={`station ${isCurrent ? "current " : ""}${isBoard ? "boarding-station " : ""}${state === "completed" ? "completed " : ""}`}
        >
          <div className="rail">
            <span className="node">
              {isCurrent
                ? "🚆"
                : state === "completed"
                ? "✓"
                : i === 0 || i === active.stations.length - 1
                ? "●"
                : ""}
            </span>
          </div>

          <div className="station-content">
            <div className="station-name">
              {s.name}
              <span className="station-status">
                {isBoard
                  ? "YOUR STATION"
                  : isCurrent
                  ? "CURRENT LOCATION"
                  : state === "completed"
                  ? "DEPARTED"
                  : s.state}
                {(isCurrent || state === "completed") && s.delay > 0
                  ? ` · ${formatDelay(s.delay)}`
                  : ""}
              </span>
            </div>

            <div className="station-times">
              <div className="time-column">
                <small>ARRIVAL</small>
                <strong>{s.arrival || "—"}</strong>
                {s.actualArrival && s.actualArrival !== "—" && (
                  <span>Actual {s.actualArrival}</span>
                )}
              </div>

              <div className="time-column">
                <small>DEPARTURE</small>
                <strong>{s.departure || "—"}</strong>
                {s.actualDeparture && s.actualDeparture !== "—" && (
                  <span>Actual {s.actualDeparture}</span>
                )}
              </div>

              {s.platform && (
                <div className="time-column platform-column">
                  <small>PLATFORM</small>
                  <strong>{s.platform}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  })}
</div>
        ) : (
          <div className="schedule-unavailable" role="status">
            Route schedule is unavailable for this train. Live status above is preserved when the provider reports it, but station times cannot be shown.
          </div>
        )}
        
        <div className="rating-section">
          <div className="rating-title">How was your experience?</div>
          <a className="rating-link" href="#reviews" onClick={reset}>
            Leave a review on RailDisha
          </a>
        </div>

<footer><span>RailDisha</span><span>Know where your train is.</span></footer>
      </section>
    </main>}

    {loading && <div className="loading-overlay">Connecting to live railway data…</div>}
    {liveError && !active && <div className="error-banner">{liveError}</div>}
  </div>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogArticlePage />} />
      </Routes>
    </BrowserRouter>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
