import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ReviewsSection } from "./ReviewsSection.jsx";
import { BlogPreview } from "./BlogPreview.jsx";
import { SiteNav } from "./SiteNav.jsx";
import { applyDocumentMeta } from "./seo.js";
import { getHomeMeta } from "./blogData.js";

/**
 * Shown while LIVE_LOOKUPS_ENABLED is not true.
 * Live product UI remains in LiveHomePage.jsx and is selected by HomePage
 * when /api/capabilities reports liveEnabled.
 */
export function PausedHomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    applyDocumentMeta(getHomeMeta());
  }, []);

  return (
    <div className="app">
      <SiteNav
        onHomeClick={(event) => {
          event.preventDefault();
          navigate("/");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <main className="hero">
        <div className="eyebrow">A clearer way to track Indian trains</div>
        <h1>
          Know where
          <br />
          <em>your train is.</em>
        </h1>
        <p className="sub">
          Search by train name or number. Choose the journey. Follow every station.
        </p>

        <div className="live-paused-notice" role="status">
          <strong>Live lookups are paused.</strong>
          <span> Try Demo to explore sample results.</span>
        </div>

        <div className="hero-demo-cta">
          <Link className="demo-cta-button" to="/demo">
            Try Demo
          </Link>
          <p className="demo-cta-note">
            Sample journeys and PNR results only — not live railway updates.
          </p>
        </div>

        <div className="status-actions" role="group" aria-label="Quick status checks">
          <Link
            className="status-action status-action-pnr"
            to="/demo"
            state={{ mode: "pnr" }}
          >
            <span className="status-action-label">PNR Status</span>
            <span className="status-action-note">Open sample PNR demo</span>
          </Link>
          <Link
            className="status-action status-action-train"
            to="/demo"
            state={{ mode: "train" }}
          >
            <span className="status-action-label">Train Status</span>
            <span className="status-action-note">Open sample train demo</span>
          </Link>
        </div>
      </main>

      <BlogPreview />
      <ReviewsSection />
    </div>
  );
}
