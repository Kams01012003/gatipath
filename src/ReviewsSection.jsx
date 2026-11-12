import React, { useEffect, useId, useRef, useState } from "react";
import { localApi } from "./localApi.js";

function StarSelector({ value, onChange, disabled, name }) {
  return (
    <div className="reviews-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const selected = star === value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            className={`reviews-star ${star <= value ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        );
      })}
      <input type="hidden" name={name} value={value || ""} readOnly />
    </div>
  );
}

export function ReviewsSection() {
  const formId = useId();
  const [loading, setLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [submissionEnabled, setSubmissionEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [average, setAverage] = useState(null);
  const [count, setCount] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const submittedLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await localApi("/api/reviews");
        const body = await response.json();
        if (cancelled) return;
        setStorageConfigured(Boolean(body.storageConfigured));
        setSubmissionEnabled(Boolean(body.submissionEnabled));
        setStatusMessage(body.message || body.error || "");
        setAverage(body.average ?? null);
        setCount(Number(body.count) || 0);
        setReviews(Array.isArray(body.reviews) ? body.reviews : []);
      } catch {
        if (cancelled) return;
        setStorageConfigured(false);
        setSubmissionEnabled(false);
        setStatusMessage("Unable to load reviews right now.");
        setAverage(null);
        setCount(0);
        setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!submissionEnabled) {
      setFormError(
        statusMessage ||
          "Review storage is not connected yet. Submissions are disabled."
      );
      return;
    }
    if (submitting || submittedLock.current) return;
    if (!rating) {
      setFormError("Please choose a rating from 1 to 5 stars.");
      return;
    }
    if (!name.trim()) {
      setFormError("Please enter a display name.");
      return;
    }

    submittedLock.current = true;
    setSubmitting(true);
    try {
      const response = await localApi("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RailDisha-Client": getClientKey(),
        },
        body: JSON.stringify({
          rating,
          name: name.trim(),
          comment: comment.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || "Unable to submit review.");
      }
      setFormSuccess(
        body.message ||
          "Thanks. Your review was received and is awaiting moderation before it appears publicly."
      );
      setRating(0);
      setName("");
      setComment("");
    } catch (error) {
      setFormError(error.message || "Unable to submit review.");
      submittedLock.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  const empty = !loading && count === 0;

  return (
    <section id="reviews" className="reviews-page" aria-labelledby={`${formId}-heading`}>
      <div className="reviews-inner">
        <div className="reviews-header">
          <span className="eyebrow">TRAVELER FEEDBACK</span>
          <h2 id={`${formId}-heading`}>Ratings &amp; reviews</h2>
          <p className="reviews-lead">
            Share how RailDisha helped your journey. Published reviews appear only after moderation.
          </p>
        </div>

        {loading ? (
          <div className="reviews-status" role="status">Loading reviews…</div>
        ) : (
          <>
            {empty ? (
              <div className="reviews-empty" role="status">
                No published reviews yet.
                {average == null && count === 0
                  ? " Be the first to leave feedback once storage is connected."
                  : ""}
              </div>
            ) : (
              <div className="reviews-summary" aria-live="polite">
                <strong>{average.toFixed(1)}</strong>
                <span> average from {count} published review{count === 1 ? "" : "s"}</span>
              </div>
            )}

            {!empty && (
              <ul className="reviews-list">
                {reviews.map((review) => (
                  <li key={review.id} className="reviews-item">
                    <div className="reviews-item-top">
                      <span className="reviews-item-stars" aria-label={`${review.rating} out of 5 stars`}>
                        {"★".repeat(review.rating)}
                        {"☆".repeat(5 - review.rating)}
                      </span>
                      <span className="reviews-item-name">{review.name}</span>
                    </div>
                    {review.comment ? <p className="reviews-item-comment">{review.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <form className="reviews-form" onSubmit={onSubmit} noValidate>
          <h3>Leave a review</h3>
          {!submissionEnabled && (
            <div className="reviews-disabled" role="status">
              {statusMessage ||
                "Review storage is not connected yet. Submissions are disabled until a Vercel Blob store is linked."}
            </div>
          )}

          <div className="reviews-field">
            <span className="reviews-label" id={`${formId}-rating-label`}>Your rating</span>
            <StarSelector
              value={rating}
              onChange={setRating}
              disabled={!submissionEnabled || submitting}
              name="rating"
            />
          </div>

          <div className="reviews-field">
            <label className="reviews-label" htmlFor={`${formId}-name`}>Display name</label>
            <input
              id={`${formId}-name`}
              type="text"
              maxLength={60}
              autoComplete="nickname"
              value={name}
              disabled={!submissionEnabled || submitting}
              onChange={(event) => setName(event.target.value)}
              placeholder="How should we show your name?"
            />
          </div>

          <div className="reviews-field">
            <label className="reviews-label" htmlFor={`${formId}-comment`}>
              Review <span className="reviews-optional">(optional)</span>
            </label>
            <textarea
              id={`${formId}-comment`}
              maxLength={500}
              rows={4}
              value={comment}
              disabled={!submissionEnabled || submitting}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What worked well for you?"
            />
          </div>

          {formError && <div className="reviews-form-error" role="alert">{formError}</div>}
          {formSuccess && <div className="reviews-form-success" role="status">{formSuccess}</div>}

          <button
            type="submit"
            className="reviews-submit"
            disabled={!submissionEnabled || submitting}
          >
            {submitting ? "Submitting…" : "Submit review"}
          </button>
        </form>
      </div>
    </section>
  );
}

function getClientKey() {
  try {
    const existing = window.sessionStorage.getItem("raildisha-review-client");
    if (existing) return existing;
    const created = `web_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.sessionStorage.setItem("raildisha-review-client", created);
    return created;
  } catch {
    return `web_${Date.now().toString(36)}`;
  }
}
