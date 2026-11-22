import React, { useEffect, useId, useState } from "react";
import {
  isExactTenDigitPnr,
  normalizePnrInput,
  OFFICIAL_PNR_CONFIRMATION_URL,
} from "./pnrUtils.js";
import {
  DEMO_BADGE,
  DEMO_PNR_SCENARIOS,
  DEMO_UNKNOWN_INPUT_MESSAGE,
  getDemoPnrResult,
} from "./demoData.js";

export function DemoPnrPanel({ id, hidden }) {
  const inputId = useId();
  const [pnrInput, setPnrInput] = useState("");
  const [pnrError, setPnrError] = useState("");
  const [pnrResult, setPnrResult] = useState(null);

  useEffect(() => {
    if (hidden) setPnrError("");
  }, [hidden]);

  function selectPnrScenario(scenario) {
    setPnrInput(scenario.pnr);
    setPnrError("");
    setPnrResult(getDemoPnrResult(scenario.pnr));
  }

  function submitPnr(event) {
    event.preventDefault();
    const pnr = normalizePnrInput(pnrInput);
    setPnrInput(pnr);
    if (!isExactTenDigitPnr(pnr)) {
      setPnrResult(null);
      setPnrError(DEMO_UNKNOWN_INPUT_MESSAGE);
      return;
    }
    const result = getDemoPnrResult(pnr);
    if (!result) {
      setPnrResult(null);
      setPnrError(DEMO_UNKNOWN_INPUT_MESSAGE);
      return;
    }
    setPnrError("");
    setPnrResult(result);
  }

  return (
    <section id={id} className="demo-panel" aria-label="Sample PNR check" hidden={hidden}>
      <p className="demo-cta-note">
        Choose a sample below or enter its 10-digit number. For a real ticket,{" "}
        <a className="pnr-confirm-link" href={OFFICIAL_PNR_CONFIRMATION_URL}>
          check with Indian Railways
        </a>.
      </p>
      <div className="demo-chips" role="group" aria-label="Sample PNR scenarios">
        {DEMO_PNR_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className="demo-chip"
            onClick={() => selectPnrScenario(scenario)}
          >
            <strong>{scenario.chipLabel}</strong>
            <span>{scenario.hint}</span>
          </button>
        ))}
      </div>

      <form className="pnr-form" onSubmit={submitPnr} noValidate>
        <label htmlFor={inputId} className="pnr-label">
          Sample 10-digit PNR
        </label>
        <div className="pnr-row">
          <input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            value={pnrInput}
            onChange={(event) => {
              setPnrInput(normalizePnrInput(event.target.value));
              setPnrError("");
              setPnrResult(null);
            }}
            placeholder="e.g. 1000000001"
            aria-label="Sample 10-digit PNR"
          />
          <button type="submit" className="pnr-submit">
            Show sample
          </button>
        </div>
      </form>

      {pnrError && (
        <div className="search-status pnr-error" role="alert">
          {pnrError}
        </div>
      )}

      {pnrResult && (
        <div className="pnr-result demo-pnr-result" aria-live="polite">
          <span className="demo-result-badge">{DEMO_BADGE}</span>
          <div className="pnr-result-head">
            <div>
              <small>TRAIN (SAMPLE)</small>
              <strong>
                {[pnrResult.train?.number, pnrResult.train?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </strong>
            </div>
            <div>
              <small>JOURNEY (SAMPLE)</small>
              <strong>
                {[pnrResult.journey?.date, pnrResult.journey?.class, pnrResult.journey?.quota]
                  .filter(Boolean)
                  .join(" · ")}
              </strong>
            </div>
          </div>
          <div className="pnr-route">
            {[
              pnrResult.train?.boardingPoint?.name || pnrResult.train?.source?.name,
              pnrResult.train?.reservationUpto?.name || pnrResult.train?.destination?.name,
            ]
              .filter(Boolean)
              .join(" → ")}
          </div>
          <div className="pnr-chart">
            <small>CHART (SAMPLE)</small>
            <strong>{pnrResult.charting?.status}</strong>
          </div>
          <ul className="pnr-passengers">
            {pnrResult.passengers.map((passenger) => (
              <li key={passenger.passengerNumber}>
                <div className="pnr-passenger-top">
                  <strong>Passenger {passenger.passengerNumber}</strong>
                  <span>{passenger.currentStatus}</span>
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
          <p className="pnr-source-note">
            Sample reservation only. Not a live Indian Railways record.
          </p>
        </div>
      )}
    </section>
  );
}
