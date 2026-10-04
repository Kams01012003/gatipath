import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function formatTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatDelay(minutes) {
  if (!minutes || minutes === 0) return "On time";

  const value = Math.abs(Number(minutes));
  const hours = Math.floor(value / 60);
  const mins = value % 60;

  if (hours > 0 && mins > 0) {
    return `${hours} hr ${mins} min late`;
  }

  if (hours > 0) {
    return `${hours} hr late`;
  }

  return `${mins} min late`;
}

function formatUpdated(iso) {
  if (!iso) return "Live status";
  return `Updated ${new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso))}`;
}

function mapLiveTrain(payload) {
  const data = payload?.data;
  if (!data) return null;

  const route = Array.isArray(data.route) ? data.route : [];
  const currentCode = data.currentLocation?.stationCode;
  const currentSequence = data.currentLocation?.sequence;
  
  const totalStations = route.length;
  const stationsRemaining = currentSequence
    ? route.filter((stop) => stop.sequence > currentSequence).length
    : null;

  const stations = route.map((stop) => {
    let state = "Upcoming";
    if (stop.status === "departed" || stop.status === "arrived") state = "Completed";
    if (stop.sequence === currentSequence || stop.stationCode === currentCode) state = "Current";
    if (stop.sequence === 1) state = "Origin";
    if (stop.sequence === route.length) state = "Destination";

    const scheduled = stop.scheduledArrival || stop.scheduledDeparture;
    const firstScheduled = route[0]?.scheduledDeparture || route[0]?.scheduledArrival;
const dayNumber = scheduled && firstScheduled
  ? Math.max(
      Math.floor(
        (new Date(scheduled) - new Date(firstScheduled)) / 86400000
      ) + 1,
      1
    )
  : 1;
    return {
      name: stop.stationName,
      time: formatTime(scheduled),
      dayNumber,
      arrival: formatTime(stop.scheduledArrival),
      departure: formatTime(stop.scheduledDeparture),
      actualArrival: formatTime(stop.actualArrival),
      actualDeparture: formatTime(stop.actualDeparture),
      platform: stop.platform || null,
      state,
      code: stop.stationCode,
      sequence: stop.sequence,
      delay: stop.delayArrival ?? stop.delayDeparture ?? 0,
    };
  });

  const status = String(data.status || "").toLowerCase();
  let state = "scheduled";
  if (status.includes("cancel")) state = "cancelled";
  else if (status.includes("complete") || status.includes("arrived") || status === "terminated") state = "completed";
  else if (status === "running" || data.isLive) state = "running";
  else if (status === "delayed") state = "delayed";
  else if (status === "scheduled" || !status) state = "scheduled";

  const currentStation =
    data.currentLocation?.stationName ||
    data.previousHalt?.stationName ||
    null;

  return {
    number: data.trainNumber || data.train?.number,
    name: data.trainName || data.train?.name || "Train",
    totalStations,
    stationsRemaining,
    type: data.train?.type || data.train?.category || "Train",
    from: data.train?.source?.name || "Origin",
    to: data.train?.destination?.name || "Destination",
    fromCode: data.train?.source?.code,
    toCode: data.train?.destination?.code,
    state,
    delay: Number(data.delayMinutes || 0),
    current: currentStation,
    next: data.nextHalt?.stationName || null,
    updatedAt: data.lastUpdatedAt || payload?.meta?.timestamp,
    stations,
  };
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selected, setSelected] = useState(null);
  const [direction, setDirection] = useState(null);
  const [active, setActive] = useState(null);
  const [boarding, setBoarding] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveError, setLiveError] = useState("");
  const searchCacheRef = useRef(new Map());

  useEffect(() => {
  const q = query.trim();

  if (q.length < 3 || active) {
    setResults([]);
    return;
  }

  const cached = searchCacheRef.current.get(q.toLowerCase());

  if (cached) {
    setResults(cached);
    setSearchError("");
    return;
  }

  const timer = setTimeout(async () => {
    setSearching(true);
    setSearchError("");

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`
      );

      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.error || "Search unavailable");
      }

      const data = body.data || [];

      searchCacheRef.current.set(q.toLowerCase(), data);
      setResults(data);
    } catch (error) {
      setResults([]);
      setSearchError(error.message || "Search unavailable");
    } finally {
      setSearching(false);
    }
  }, 900);

  return () => clearTimeout(timer);
}, [query, active]);

  async function loadTrain(number) {
    setLoading(true);
    setLiveError("");
    try {
      const response = await fetch(`/api/train/${number}`);
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Live status unavailable");
      const train = mapLiveTrain(body);
      if (!train) throw new Error("Live status unavailable");
      setActive(train);
      setBoarding("");
      setTimeout(() => document.getElementById("journey")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (error) {
      setLiveError(error.message || "Live status unavailable");
    } finally {
      setLoading(false);
    }
  }

  function choose(t) {
    setSelected(t);
    setDirection(null);
    setResults([]);
    setLiveError("");
    loadTrain(t.number);
  }

  function reset() {
    setSelected(null);
    setDirection(null);
    setActive(null);
    setQuery("");
    setBoarding("");
    setLiveError("");
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

  return <div className="app">
    <header className="nav">
      <button className="brand" onClick={reset}>gati<span>path</span></button>
      <div className="nav-pill">INDIAN RAILWAYS · LIVE JOURNEYS</div>
    </header>

    {!active ? <main className="hero">
      <div className="eyebrow">A clearer way to track Indian trains</div>
      <h1>Know where<br/><em>your train is.</em></h1>
      <p className="sub">Search by train name or number. Choose the journey. Follow every station.</p>
      <div className="search-wrap">
        <div className="search-icon">⌕</div>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search Himalayan Queen, Telangana Express, 14095…" />
        {query && <button className="clear" onClick={() => setQuery("")}>×</button>}
      </div>
      {searching && <div className="search-status">Searching live train directory…</div>}
      {searchError && <div className="search-status">{searchError}</div>}
      {results.length > 0 && <div className="results">
        {results.map(t => <button className="result" key={t.number} onClick={() => choose(t)}>
          <span className="train-mark">↗</span>
          <span><b>{t.name}</b><small>{t.number} · {t.source} → {t.destination}</small></span>
          <span className="arrow">→</span>
        </button>)}
      </div>}
      {!searching && query.length >= 2 && !results.length && !searchError && <div className="search-status">No matching trains found.</div>}
      <div className="examples">
        <span>Try</span>
        {["Himalayan Queen", "Telangana Express", "14095"].map(x => <button key={x} onClick={() => setQuery(x)}>{x}</button>)}
      </div>
    </main> :
    <main id="journey" className="journey-page">
      <section className="status-page">
        <div className="back" onClick={reset}>← Search again</div>
        <div className="train-heading">
          <div>
            <div className="eyebrow">{active.number} · {active.type}</div>
            <h2>{active.name}</h2>
            <p>{active.from} <span>→</span> {active.to}</p>
          </div>
          <button className="share" onClick={() => navigator.clipboard?.writeText(location.href)}>↗ Share</button>
        </div>

        <div className={`status-card ${active.state}`}>
          <div className="status-main">
            <span className="live-dot"></span>
            <div><small>TRAIN STATUS</small><h3>{statusText}</h3></div>
          </div>
          {active.state === "running" && <div className="status-detail"><b>{active.current || "On route"}</b><span>{active.delay > 0 ? `${active.delay} min late` : "Running on time"}{active.next ? ` · Next: ${active.next}` : ""}</span></div>}
          {active.state === "scheduled" && <div className="status-detail"><b>{scheduledDeparture}</b><span>Scheduled departure from {active.from}</span></div>}
          {active.state === "delayed" && <div className="status-detail"><b>{active.delay} min late</b><span>{active.current || "Live status available"}</span></div>}
          {active.state === "completed" && <div className="status-detail"><b>{active.to}</b><span>Journey completed</span></div>}
          {active.state === "cancelled" && <div className="status-detail"><b>Cancelled</b><span>Check railway advisories before travelling</span></div>}
        </div>

        <div className="boarding">
          <div><b>Where are you boarding?</b><small>Highlight your station on the journey</small></div>
          <select value={boarding} onChange={e => setBoarding(e.target.value)}>
            <option value="">Select a station</option>
            {active.stations.map(s => <option key={`${s.sequence}-${s.code}`} value={s.name}>{s.name}</option>)}
          </select>
        </div>

        <div className="timeline-head">
          <div>
            <span className="eyebrow">THE JOURNEY</span>
            <h3>
              {active.totalStations} stations
              {active.stationsRemaining !== null && (
                <span> · {active.stationsRemaining} remaining</span>
              )}
            </h3>
          </div>
        </div>
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
                {s.actualArrival && (
                  <span>Actual {s.actualArrival}</span>
                )}
              </div>

              <div className="time-column">
                <small>DEPARTURE</small>
                <strong>{s.departure || "—"}</strong>
                {s.actualDeparture && (
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
        <footer><span>Gatipath</span><span>Know where your train is.</span></footer>
      </section>
    </main>}

    {loading && <div className="loading-overlay">Connecting to live railway data…</div>}
    {liveError && !active && <div className="error-banner">{liveError}</div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
