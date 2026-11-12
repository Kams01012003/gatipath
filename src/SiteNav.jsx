import React from "react";
import { Link, useNavigate } from "react-router-dom";

export function SiteNav({ onHomeClick } = {}) {
  const navigate = useNavigate();

  function goHome(event) {
    if (typeof onHomeClick === "function") {
      onHomeClick(event);
      return;
    }
    event.preventDefault();
    navigate("/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <header className="nav">
      <button type="button" className="brand" onClick={goHome} aria-label="RailDisha home">
        <img
          className="brand-logo"
          src="/raildisha-logo.png"
          alt=""
          width="2172"
          height="724"
          decoding="async"
        />
      </button>
      <div className="nav-links">
        <Link className="nav-link nav-link-demo" to="/demo">
          Try Demo
        </Link>
        <Link className="nav-link" to="/blog">
          Blog
        </Link>
        <Link className="nav-link" to="/#reviews">
          Reviews
        </Link>
        <div className="nav-pill">INDIAN RAILWAYS · TRAIN JOURNEYS</div>
      </div>
    </header>
  );
}
