import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { localApi } from "./localApi.js";
import { LiveHomePage } from "./LiveHomePage.jsx";
import { PausedHomePage } from "./PausedHomePage.jsx";
import { DemoPage } from "./DemoPage.jsx";
import { BlogArticlePage, BlogIndexPage } from "./BlogPages.jsx";
import "./styles.css";

/**
 * Chooses paused vs live homepage from server-only LIVE_LOOKUPS_ENABLED
 * via GET /api/capabilities (boolean only). Default: paused.
 * Re-enable: set LIVE_LOOKUPS_ENABLED=true in Vercel and redeploy — no UI rewrite.
 */
export function HomePage() {
  const [liveEnabled, setLiveEnabled] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await localApi("/api/capabilities");
        const body = await response.json();
        if (!cancelled) {
          setLiveEnabled(Boolean(body?.liveEnabled));
        }
      } catch {
        if (!cancelled) setLiveEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (liveEnabled === true) {
    return <LiveHomePage />;
  }

  // null (loading) and false both show paused — safe default, no provider use.
  return <PausedHomePage />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/demo" element={<DemoPage />} />
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
